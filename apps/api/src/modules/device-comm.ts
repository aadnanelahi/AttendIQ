import net from 'node:net';

export interface DeviceCommunicationTestResult {
  reachable: boolean;
  protocol: string;
  target?: string;
  latencyMs?: number;
  message: string;
}

interface ProbeTarget {
  ipAddress?: string | null;
  port?: number | null;
  protocol?: string | null;
}

function tcpProbe(host: string, port: number, timeoutMs: number): Promise<{ reachable: boolean; latencyMs?: number; message?: string }> {
  return new Promise((resolve) => {
    const started = Date.now();
    const socket = net.createConnection({ host, port });
    let settled = false;
    const done = (ok: boolean, message?: string): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(ok ? { reachable: true, latencyMs: Date.now() - started } : { reachable: false, message });
    };
    socket.setTimeout(timeoutMs, () => done(false, `Connection to ${host}:${port} timed out after ${timeoutMs}ms.`));
    socket.once('connect', () => done(true));
    socket.once('error', (err: NodeJS.ErrnoException) => done(false, `Connection to ${host}:${port} failed (${err.code ?? err.message}).`));
  });
}

async function httpProbe(url: string, timeoutMs: number): Promise<{ reachable: boolean; latencyMs?: number }> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await fetch(url, { signal: controller.signal, redirect: 'manual' });
    return { reachable: true, latencyMs: Date.now() - started };
  } catch {
    return { reachable: false };
  } finally {
    clearTimeout(timer);
  }
}

export async function testDeviceCommunication(device: ProbeTarget): Promise<DeviceCommunicationTestResult> {
  const protocol = device.protocol ?? 'zktcp';
  if (!device.ipAddress) {
    return {
      reachable: false,
      protocol,
      message: 'Device has no IP address configured. Set an IP address and try again.',
    };
  }

  const tcpPort = device.port ?? 4370;
  const tcpTarget = `${device.ipAddress}:${tcpPort}`;
  const tcp = await tcpProbe(device.ipAddress, tcpPort, 3000);
  if (tcp.reachable) {
    return {
      reachable: true,
      protocol,
      target: tcpTarget,
      latencyMs: tcp.latencyMs,
      message: `TCP connection to ${tcpTarget} succeeded (${tcp.latencyMs}ms).`,
    };
  }

  if (protocol !== 'zktcp') {
    const httpPort = device.port ?? 80;
    const httpTarget = `http://${device.ipAddress}:${httpPort}/`;
    const http = await httpProbe(httpTarget, 3000);
    if (http.reachable) {
      return {
        reachable: true,
        protocol,
        target: httpTarget,
        latencyMs: http.latencyMs,
        message: `HTTP probe to ${httpTarget} responded (${http.latencyMs}ms).`,
      };
    }
  }

  return {
    reachable: false,
    protocol,
    target: tcpTarget,
    message: `No connection to ${tcpTarget}. Check the IP address, port, and network reachability to the device.`,
  };
}