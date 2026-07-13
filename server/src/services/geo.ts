/**
 * Geohash and heading/speed buckets for cache keys and corridor.
 */

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

export function encodeGeohash(lat: number, lng: number, precision: number = 7): string {
  let latMin = -90,
    latMax = 90,
    lngMin = -180,
    lngMax = 180;
  let bits = 0;
  let bitsTotal = 0;
  let hash = '';

  while (hash.length < precision) {
    for (let i = 0; i < 5; i++) {
      if (bitsTotal % 2 === 0) {
        const mid = (lngMin + lngMax) / 2;
        bits = bits << 1;
        if (lng >= mid) {
          lngMin = mid;
          bits |= 1;
        } else {
          lngMax = mid;
        }
      } else {
        const mid = (latMin + latMax) / 2;
        bits = bits << 1;
        if (lat >= mid) {
          latMin = mid;
          bits |= 1;
        } else {
          latMax = mid;
        }
      }
      bitsTotal++;
    }
    hash += BASE32[bits];
    bits = 0;
  }
  return hash;
}

/** 8 direction buckets (0-7) from heading degrees 0-360 */
export function headingBucket(headingDeg: number): number {
  const n = ((headingDeg % 360) + 360) % 360;
  return Math.floor((n / 360) * 8) % 8;
}

/** Speed bucket label for cache */
export function speedBucket(speedKmh: number): string {
  if (speedKmh < 40) return 'low';
  if (speedKmh < 80) return 'mid';
  return 'high';
}

/** Point ahead by distance (m) and heading (degrees) */
export function pointAhead(lat: number, lng: number, headingDeg: number, distanceM: number): { lat: number; lng: number } {
  const R = 6371000; // Earth radius m
  const brng = (headingDeg * Math.PI) / 180;
  const d = distanceM / R;
  const lat1 = (lat * Math.PI) / 180;
  const lng1 = (lng * Math.PI) / 180;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng)
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
    );
  return {
    lat: (lat2 * 180) / Math.PI,
    lng: (lng2 * 180) / Math.PI,
  };
}

export function distanceMeters(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
): number {
  const R = 6371000;
  const lat1 = (fromLat * Math.PI) / 180;
  const lat2 = (toLat * Math.PI) / 180;
  const dLat = ((toLat - fromLat) * Math.PI) / 180;
  const dLng = ((toLng - fromLng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** 5-minute departure bucket for Matrix cache */
export function departureBucket(): number {
  return Math.floor(Date.now() / (5 * 60 * 1000));
}
