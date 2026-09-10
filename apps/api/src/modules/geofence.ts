import { prisma } from '../lib/db.js';

export interface PunchLocation {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  provider?: string;
}

export interface GeofenceResult {
  enabled: boolean;
  matched: boolean;
  distanceMeters: number;
  locationId?: string;
  locationName?: string;
  reason?: string;
}

export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371_000;
  const toRad = (deg: number): number => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Evaluates a punch location against the tenant's configured work locations
 * (geofences). Only locations with latitude, longitude and radiusMeters set are
 * considered. If the employee has an assigned work location, it is the only
 * permitted geofence; otherwise any matching tenant location is accepted.
 */
export async function evaluateGeofence(
  tenantId: string,
  employeeId: string,
  loc: PunchLocation,
): Promise<GeofenceResult> {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { locationId: true },
  });

  const where =
    employee?.locationId != null
      ? { tenantId, id: employee.locationId, latitude: { not: null }, longitude: { not: null }, radiusMeters: { not: null } }
      : { tenantId, latitude: { not: null }, longitude: { not: null }, radiusMeters: { not: null } };

  const locations = await prisma.location.findMany({
    where,
    select: { id: true, name: true, latitude: true, longitude: true, radiusMeters: true },
  });
  if (locations.length === 0) {
    return { enabled: false, matched: true, distanceMeters: 0, reason: 'no_geofences_configured' };
  }

  let best: { id: string; name: string; distance: number; radius: number } | null = null;
  for (const l of locations) {
    if (l.latitude == null || l.longitude == null || l.radiusMeters == null) continue;
    const distance = haversineMeters(loc.latitude, loc.longitude, l.latitude, l.longitude);
    if (!best || distance < best.distance) best = { id: l.id, name: l.name, distance, radius: l.radiusMeters };
  }
  if (!best) return { enabled: false, matched: true, distanceMeters: 0, reason: 'no_geofences_configured' };

  if (best.distance <= best.radius) {
    return {
      enabled: true,
      matched: true,
      distanceMeters: Math.round(best.distance),
      locationId: best.id,
      locationName: best.name,
    };
  }

  return {
    enabled: true,
    matched: false,
    distanceMeters: Math.round(best.distance),
    locationId: best.id,
    locationName: best.name,
    reason: `outside_geofence_${best.name}`,
  };
}