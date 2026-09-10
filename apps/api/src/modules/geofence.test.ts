import { describe, expect, it } from 'vitest';
import { haversineMeters } from './geofence.js';

describe('haversineMeters', () => {
  it('returns 0 for identical coordinates', () => {
    expect(haversineMeters(25.1972, 55.2744, 25.1972, 55.2744)).toBe(0);
  });

  it('is symmetric', () => {
    const a = haversineMeters(25.1972, 55.2744, 25.2, 55.28);
    const b = haversineMeters(25.2, 55.28, 25.1972, 55.2744);
    expect(a).toBeCloseTo(b, 6);
  });

  it('approximates ~111km per degree of latitude', () => {
    const d = haversineMeters(25, 55, 26, 55);
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });
});
