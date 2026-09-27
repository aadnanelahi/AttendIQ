import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../lib/db.js';
import {
  admsState,
  buildCommandText,
  describeReturnCode,
  deviceTimeZone,
  findAdmsDevice,
  ingestAttLog,
  parseAttLog,
  parseInfo,
  parseKeyValueLine,
  saveAdmsState,
  storeTemplate,
  tzOffsetHours,
  type AdmsDevice,
} from '../modules/adms.js';

type Query = Record<string, string | undefined>;

const MAX_COMMANDS_PER_POLL = 20;

function text(reply: FastifyReply, body: string, code = 200): FastifyReply {
  return reply.code(code).header('Content-Type', 'text/plain; charset=utf-8').send(body);
}

function bodyText(req: FastifyRequest): string {
  const b = req.body as unknown;
  if (Buffer.isBuffer(b)) return b.toString('utf8');
  if (typeof b === 'string') return b;
  return '';
}

async function deviceFor(req: FastifyRequest, reply: FastifyReply): Promise<AdmsDevice | null> {
  const q = req.query as Query;
  const device = await findAdmsDevice(q.SN ?? q.sn);
  if (!device) {
    req.log.warn({ sn: q.SN ?? q.sn, path: req.url.split('?')[0] }, 'ADMS request from unregistered serial number');
    text(reply, 'Unknown device', 401);
    return null;
  }
  return device;
}

/**
 * ZKTeco ADMS (iclock) endpoints. Registered outside /api/v1 because devices use fixed paths.
 * Devices send plain-text bodies, so this plugin accepts any content type as a raw buffer.
 */
export default async function iclockRoutes(app: FastifyInstance): Promise<void> {
  app.removeAllContentTypeParsers();
  app.addContentTypeParser('*', { parseAs: 'buffer' }, (_req, body, done) => done(null, body));

  // Handshake: device asks for its options.
  app.get('/iclock/cdata', async (req, reply) => {
    const device = await deviceFor(req, reply);
    if (!device) return reply;
    const q = req.query as Query;
    const state = admsState(device);
    const tz = deviceTimeZone(device);
    await saveAdmsState(
      device,
      { pushver: q.pushver ?? state.pushver, lastHandshakeAt: new Date().toISOString() },
      { lastSeenAt: new Date() },
    );
    const lines = [
      `GET OPTION FROM: ${device.serialNumber}`,
      `ATTLOGStamp=${state.attlogStamp ?? 'None'}`,
      `OPERLOGStamp=${state.operlogStamp ?? 'None'}`,
      `ATTPHOTOStamp=${state.attphotoStamp ?? 'None'}`,
      `BIODATAStamp=${state.biodataStamp ?? 'None'}`,
      'ErrorDelay=30',
      'Delay=10',
      'TransTimes=00:00;12:00',
      'TransInterval=1',
      'TransFlag=TransData AttLog\tOpLog\tEnrollUser\tChgUser\tEnrollFP\tChgFP\tFACE',
      `TimeZone=${tzOffsetHours(tz)}`,
      'Realtime=1',
      'Encrypt=None',
      'ServerVer=2.4.1',
    ];
    return text(reply, lines.join('\n'));
  });

  // Data upload: attendance, users/templates, biodata.
  app.post('/iclock/cdata', async (req, reply) => {
    const device = await deviceFor(req, reply);
    if (!device) return reply;
    const q = req.query as Query;
    const table = (q.table ?? '').toUpperCase();
    const stamp = q.Stamp ?? q.stamp;
    const body = bodyText(req);
    let count = 0;

    if (table === 'ATTLOG') {
      const lines = parseAttLog(body);
      count = lines.length;
      const result = await ingestAttLog(device, lines);
      req.log.info({ sn: device.serialNumber, lines: count, ...result }, 'ADMS ATTLOG received');
      await saveAdmsState(device, stamp ? { attlogStamp: stamp } : {}, { lastSeenAt: new Date() });
    } else if (table === 'OPERLOG' || table === 'BIODATA' || table === 'USERINFO' || table === 'FINGERTMP') {
      let stored = 0;
      for (const line of body.split('\n')) {
        const rec = parseKeyValueLine(line, table === 'FINGERTMP' ? 'FP' : table);
        if (!rec) continue;
        count++;
        if (rec.kind === 'FP' || rec.kind === 'FACE' || rec.kind === 'BIODATA' || rec.kind === 'FINGERTMP') {
          if ((await storeTemplate(device, rec)) === 'stored') stored++;
        }
      }
      req.log.info({ sn: device.serialNumber, table, lines: count, templatesStored: stored }, 'ADMS data received');
      const patch = table === 'BIODATA' ? { usesBiodata: true, ...(stamp ? { biodataStamp: stamp } : {}) } : stamp && table === 'OPERLOG' ? { operlogStamp: stamp } : {};
      await saveAdmsState(device, patch, { lastSeenAt: new Date() });
    } else {
      // ATTPHOTO, options and other tables are acknowledged but not stored.
      count = body ? body.split('\n').filter((l) => l.trim()).length : 0;
      if (table === 'ATTPHOTO' && stamp) await saveAdmsState(device, { attphotoStamp: stamp }, { lastSeenAt: new Date() });
    }
    return text(reply, `OK: ${count}`);
  });

  // Command poll.
  app.get('/iclock/getrequest', async (req, reply) => {
    const device = await deviceFor(req, reply);
    if (!device) return reply;
    const q = req.query as Query;
    await saveAdmsState(device, parseInfo(q.INFO ?? q.info), { lastSeenAt: new Date() });

    const pending = await prisma.deviceCommand.findMany({
      where: { deviceId: device.id, status: 'PENDING' },
      orderBy: { id: 'asc' },
      take: MAX_COMMANDS_PER_POLL,
    });
    const out: string[] = [];
    for (const cmd of pending) {
      // Claim the command so an overlapping poll cannot send it twice.
      const claimed = await prisma.deviceCommand.updateMany({ where: { id: cmd.id, status: 'PENDING' }, data: { status: 'SENT', sentAt: new Date() } });
      if (claimed.count !== 1) continue;
      try {
        out.push(`C:${cmd.id}:${await buildCommandText(cmd, device)}`);
      } catch (err) {
        await prisma.deviceCommand.update({
          where: { id: cmd.id },
          data: { status: 'FAILED', error: err instanceof Error ? err.message : String(err), completedAt: new Date() },
        });
      }
    }
    return text(reply, out.length ? out.join('\n') : 'OK');
  });

  // Command results: lines like "ID=12&Return=0&CMD=DATA".
  app.post('/iclock/devicecmd', async (req, reply) => {
    const device = await deviceFor(req, reply);
    if (!device) return reply;
    for (const line of bodyText(req).split('\n')) {
      if (!line.trim()) continue;
      const params = new URLSearchParams(line.trim());
      const id = Number(params.get('ID'));
      const ret = Number(params.get('Return') ?? params.get('return'));
      if (!Number.isInteger(id) || id <= 0) continue;
      const ok = Number.isFinite(ret) && ret >= 0;
      await prisma.deviceCommand.updateMany({
        where: { id, deviceId: device.id },
        data: {
          status: ok ? 'DONE' : 'FAILED',
          returnCode: Number.isFinite(ret) ? ret : null,
          error: ok ? null : describeReturnCode(ret),
          completedAt: new Date(),
        },
      });
    }
    await prisma.device.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } });
    return text(reply, 'OK');
  });

  // Results of DATA QUERY commands on some firmware.
  app.post('/iclock/querydata', async (req, reply) => {
    const device = await deviceFor(req, reply);
    if (!device) return reply;
    const q = req.query as Query;
    const tableName = (q.tablename ?? '').toUpperCase();
    let count = 0;
    for (const line of bodyText(req).split('\n')) {
      const rec = parseKeyValueLine(line, tableName === 'FINGERTMP' ? 'FP' : tableName);
      if (!rec) continue;
      count++;
      if (rec.kind === 'FP' || rec.kind === 'FACE' || rec.kind === 'BIODATA' || rec.kind === 'FINGERTMP') await storeTemplate(device, rec);
    }
    return text(reply, `OK: ${count}`);
  });

  // Clock sync on newer firmware.
  app.get('/iclock/rtdata', async (req, reply) => {
    const device = await deviceFor(req, reply);
    if (!device) return reply;
    const hours = tzOffsetHours(deviceTimeZone(device));
    const sign = hours >= 0 ? '+' : '-';
    const tzStr = `${sign}${String(Math.abs(hours)).padStart(2, '0')}00`;
    return text(reply, `DateTime=${Math.floor(Date.now() / 1000)},ServerTZ=${tzStr}`);
  });

  app.get('/iclock/ping', async (req, reply) => {
    const device = await deviceFor(req, reply);
    if (!device) return reply;
    await prisma.device.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } });
    return text(reply, 'OK');
  });
}
