import { distanceMeters } from '../demo/guidedTour/distance';

export type MapOrientation = 'north-up' | 'course-up';
export type CameraMotion = { heading: number | null; speedKmh: number | null; timestampMs: number; accuracyMeters?: number };
export const cameraReliability = { maxCourseAgeMs: 20_000, minCourseSpeedKmh: 5, maxCourseAccuracyMeters: 100 } as const;

export function nearestHeading(previous: number, next: number): number {
  return previous + ((next - previous + 540) % 360 + 360) % 360 - 180;
}

type Coordinate = { latitude: number; longitude: number };
export type VehicleCameraFix = CameraMotion & Coordinate;
const vehicleCamera = { tickMs: 500, maxFixAgeMs: 6000, maxFixAccuracyMeters: 50, maxBlendMs: 1800, turnDegreesPerTick: 24 } as const;
export const vehicleCameraTickMs = vehicleCamera.tickMs;

export function markersInViewport<T extends { coordinate: Coordinate }>(markers: T[], region: Coordinate & {
  latitudeDelta: number; longitudeDelta: number;
}): T[] {
  return markers.filter(({ coordinate }) =>
    Math.abs(coordinate.latitude - region.latitude) <= region.latitudeDelta * 0.6 &&
    Math.abs(nearestHeading(region.longitude, coordinate.longitude) - region.longitude) <= region.longitudeDelta * 0.6,
  ).slice(0, 8);
}

function isPlausibleVehicleFix(fix: VehicleCameraFix, previous: VehicleCameraFix | undefined): boolean {
  if (!previous) return true;
  const elapsedSeconds = (fix.timestampMs - previous.timestampMs) / 1000;
  if (elapsedSeconds <= 0) return false;
  if (elapsedSeconds > vehicleCamera.maxFixAgeMs / 1000) return true; // Re-anchor once after a genuine GPS gap.
  const speedMps = Math.min(60, Math.max(fix.speedKmh ?? 0, previous.speedKmh ?? 0) / 3.6);
  const errorAllowance = (fix.accuracyMeters ?? 0) + (previous.accuracyMeters ?? 0) + 15;
  return distanceMeters(previous, fix) <= errorAllowance + 2 * speedMps * elapsedSeconds;
}

/** Camera state only. Speed gating is course reliability, never a movement classifier. */
export class MapCameraController {
  orientation: MapOrientation = 'course-up';
  following = true;
  heading = 0;
  reliableCourse = false;
  private validCourse?: { heading: number; timestampMs: number; accuracyMeters?: number };
  private last?: { latitude?: number; longitude?: number; heading: number };

  private vehicleFix?: VehicleCameraFix;
  private blendFrom?: Coordinate;
  private blendMs = 0;
  private lastVehicleTick?: number;
  private lastVehicleCenter?: Coordinate;
  private lastVehicleHeading?: number;
  private orientationChanged = false;

  updateVehicle(fix: VehicleCameraFix | undefined, now: number) {
    const previous = this.vehicleFix;
    if (fix && now >= fix.timestampMs &&
        now - fix.timestampMs <= vehicleCamera.maxFixAgeMs && Math.abs(fix.latitude) <= 90 && Math.abs(fix.longitude) <= 180 &&
        fix.accuracyMeters !== undefined && fix.accuracyMeters >= 0 && fix.accuracyMeters <= vehicleCamera.maxFixAccuracyMeters &&
        isPlausibleVehicleFix(fix, previous)) {
      this.vehicleFix = fix;
      this.blendFrom = previous && this.lastVehicleCenter && fix.timestampMs - previous.timestampMs <= vehicleCamera.maxFixAgeMs
        ? this.lastVehicleCenter : fix;
      this.blendMs = previous ? Math.min(vehicleCamera.maxBlendMs, fix.timestampMs - previous.timestampMs) : 0;
    }
    const accepted = this.vehicleFix;
    if (!accepted || (!this.following && !this.orientationChanged)) return undefined;
    if (!this.orientationChanged && this.lastVehicleTick !== undefined && now - this.lastVehicleTick < vehicleCamera.tickMs) return undefined;
    if (this.lastVehicleHeading === undefined) this.lastVehicleHeading = this.heading;
    this.lastVehicleTick = now;

    const fresh = now - accepted.timestampMs <= vehicleCamera.maxFixAgeMs;
    const moving = accepted.speedKmh !== null && accepted.speedKmh >= cameraReliability.minCourseSpeedKmh;
    const progress = this.blendMs > 0 ? Math.min(1, (now - accepted.timestampMs) / this.blendMs) : 1;
    const from = this.blendFrom ?? accepted;
    const stationaryJitter = !moving && this.lastVehicleCenter &&
      Math.abs(this.lastVehicleCenter.latitude - accepted.latitude) < 0.000045 &&
      Math.abs(nearestHeading(this.lastVehicleCenter.longitude, accepted.longitude) - this.lastVehicleCenter.longitude) < 0.000045;
    const center = !fresh || stationaryJitter ? this.lastVehicleCenter : {
      latitude: from.latitude + (accepted.latitude - from.latitude) * progress,
      longitude: ((from.longitude + (nearestHeading(from.longitude, accepted.longitude) - from.longitude) * progress + 540) % 360) - 180,
    };
    const wanted = this.update(center ?? accepted, fresh && moving ? accepted : null, now);
    if (!wanted && center === undefined) return undefined;
    const oldHeading = this.lastVehicleHeading;
    const delta = nearestHeading(oldHeading, this.heading) - oldHeading;
    const automaticStep = Math.max(-vehicleCamera.turnDegreesPerTick, Math.min(vehicleCamera.turnDegreesPerTick, delta));
    const nextHeading = oldHeading + (this.orientationChanged ? delta : automaticStep);
    this.heading = nextHeading;
    const centerChanged = this.following && center && (this.lastVehicleCenter?.latitude !== center.latitude || this.lastVehicleCenter?.longitude !== center.longitude);
    const changed = centerChanged || nextHeading !== oldHeading || this.orientationChanged;
    this.orientationChanged = false;
    this.lastVehicleHeading = nextHeading;
    if (centerChanged) this.lastVehicleCenter = center;
    return changed ? { ...(centerChanged ? { center } : {}), heading: nextHeading } : undefined;
  }

  pan(): void { this.following = false; }
  follow(): void { this.following = true; this.last = undefined; this.lastVehicleCenter = undefined; this.orientationChanged = true; }
  toggleOrientation(): void { this.orientationChanged = true; this.orientation = this.orientation === 'north-up' ? 'course-up' : 'north-up'; }

  update(coordinate: { latitude: number; longitude: number }, motion: CameraMotion | null, now: number) {
    const age = motion ? now - motion.timestampMs : Infinity;
    if (motion && age >= 0 && age <= cameraReliability.maxCourseAgeMs &&
        (motion.accuracyMeters === undefined || (Number.isFinite(motion.accuracyMeters) && motion.accuracyMeters >= 0 && motion.accuracyMeters <= cameraReliability.maxCourseAccuracyMeters)) &&
        motion.speedKmh !== null && motion.speedKmh >= cameraReliability.minCourseSpeedKmh &&
        (!this.validCourse || motion.timestampMs >= this.validCourse.timestampMs) &&
        motion.heading !== null && Number.isFinite(motion.heading) && motion.heading >= 0 && motion.heading < 360) {
      this.validCourse = { heading: motion.heading, timestampMs: motion.timestampMs };
    }
    this.reliableCourse = Boolean(this.validCourse && now - this.validCourse.timestampMs <= cameraReliability.maxCourseAgeMs);
    const next = this.orientation === 'course-up' && this.reliableCourse ? this.validCourse!.heading : 0;
    this.heading = nearestHeading(this.heading, next);
    const command = { ...(this.following ? coordinate : {}), heading: this.heading };
    if (this.last?.latitude === command.latitude && this.last?.longitude === command.longitude && this.last?.heading === command.heading) return undefined;
    this.last = command;
    return { ...(this.following ? { center: coordinate } : {}), heading: this.heading };
  }
}
