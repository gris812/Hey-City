export type MapOrientation = 'north-up' | 'course-up';
export type CameraMotion = { heading: number | null; speedKmh: number | null; timestampMs: number; accuracyMeters?: number };
export const cameraReliability = { maxCourseAgeMs: 20_000, minCourseSpeedKmh: 5, maxCourseAccuracyMeters: 100 } as const;

export function nearestHeading(previous: number, next: number): number {
  return previous + ((next - previous + 540) % 360 + 360) % 360 - 180;
}

/** Camera state only. Speed gating is course reliability, never a movement classifier. */
export class MapCameraController {
  orientation: MapOrientation = 'north-up';
  following = true;
  heading = 0;
  reliableCourse = false;
  private validCourse?: { heading: number; timestampMs: number; accuracyMeters?: number };
  private last?: { latitude?: number; longitude?: number; heading: number };

  pan(): void { this.following = false; }
  follow(): void { this.following = true; this.last = undefined; }
  toggleOrientation(): void { this.orientation = this.orientation === 'north-up' ? 'course-up' : 'north-up'; }

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
