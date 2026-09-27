import { describe, expect, it } from 'vitest';
import { fieldOf, parseAttLog, parseInfo, parseKeyValueLine, punchTypeFor, tzOffsetHours, zonedLocalToUtc } from './adms.js';

describe('ADMS parsing', () => {
  it('parses ATTLOG lines', () => {
    const lines = parseAttLog('1\t2026-09-27 08:01:02\t0\t1\t0\t0\t0\n25\t2026-09-27 17:30:00\t1\t15\t\t0\t0\n\n');
    expect(lines).toEqual([
      { pin: '1', time: '2026-09-27 08:01:02', status: 0, verify: 1, workcode: '0' },
      { pin: '25', time: '2026-09-27 17:30:00', status: 1, verify: 15, workcode: null },
    ]);
  });

  it('maps ZK status codes to punch types', () => {
    expect(punchTypeFor(0)).toBe('CHECK_IN');
    expect(punchTypeFor(1)).toBe('CHECK_OUT');
    expect(punchTypeFor(4)).toBe('CHECK_IN');
    expect(punchTypeFor(255)).toBe('UNKNOWN');
    expect(punchTypeFor(null)).toBe('UNKNOWN');
  });

  it('parses OPERLOG FP lines keeping "=" inside base64 values', () => {
    const rec = parseKeyValueLine('FP PIN=7\tFID=6\tSize=8\tValid=1\tTMP=SGVsbG8=\r', 'OPERLOG')!;
    expect(rec.kind).toBe('FP');
    expect(fieldOf(rec, 'pin')).toBe('7');
    expect(fieldOf(rec, 'TMP')).toBe('SGVsbG8=');
  });

  it('parses BIODATA lines with mixed-case keys', () => {
    const rec = parseKeyValueLine('BIODATA Pin=3\tNo=1\tIndex=0\tValid=1\tDuress=0\tType=1\tMajorVer=12\tMinorVer=0\tFormat=0\tTmp=QUJD', 'BIODATA')!;
    expect(rec.kind).toBe('BIODATA');
    expect(fieldOf(rec, 'PIN')).toBe('3');
    expect(fieldOf(rec, 'tmp')).toBe('QUJD');
  });

  it('falls back to the table name when a line has no prefix', () => {
    const rec = parseKeyValueLine('PIN=9\tFID=0\tTMP=x', 'FP')!;
    expect(rec.kind).toBe('FP');
  });

  it('parses the INFO string', () => {
    expect(parseInfo('Ver 8.0.4.2-20190530,12,20,3500,192.168.1.201,10,7,12,1,11')).toMatchObject({
      firmware: 'Ver 8.0.4.2-20190530',
      userCount: 12,
      fpCount: 20,
      attCount: 3500,
      deviceIp: '192.168.1.201',
      fpVersion: '10',
      faceVersion: '7',
    });
  });
});

describe('ADMS time zones', () => {
  it('converts Dubai wall time to UTC', () => {
    expect(zonedLocalToUtc('2026-09-27 08:00:00', 'Asia/Dubai')?.toISOString()).toBe('2026-09-27T04:00:00.000Z');
    expect(tzOffsetHours('Asia/Dubai')).toBe(4);
  });

  it('handles DST zones', () => {
    expect(zonedLocalToUtc('2026-07-01 12:00:00', 'Europe/London')?.toISOString()).toBe('2026-07-01T11:00:00.000Z');
    expect(zonedLocalToUtc('2026-01-01 12:00:00', 'Europe/London')?.toISOString()).toBe('2026-01-01T12:00:00.000Z');
  });

  it('rejects malformed times', () => {
    expect(zonedLocalToUtc('yesterday', 'UTC')).toBeNull();
  });
});
