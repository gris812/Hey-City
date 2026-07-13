/**
 * Budget guardrails: count Google API calls per user per minute; circuit breaker on 429.
 */
import { budget, circuitBreaker } from '../config';

const callsPerUserMinute = new Map<string, { places: number[]; matrix: number[] }>();
const circuitOpenUntil = new Map<string, number>();

function trimOld(timestamps: number[], windowMs: number): number[] {
  const cutoff = Date.now() - windowMs;
  return timestamps.filter((t) => t > cutoff);
}

export function recordPlacesCall(userId: string): void {
  const now = Date.now();
  let entry = callsPerUserMinute.get(userId);
  if (!entry) {
    entry = { places: [], matrix: [] };
    callsPerUserMinute.set(userId, entry);
  }
  entry.places.push(now);
  entry.places = trimOld(entry.places, 60 * 1000);
}

export function recordMatrixCall(userId: string): void {
  const now = Date.now();
  let entry = callsPerUserMinute.get(userId);
  if (!entry) {
    entry = { places: [], matrix: [] };
    callsPerUserMinute.set(userId, entry);
  }
  entry.matrix.push(now);
  entry.matrix = trimOld(entry.matrix, 60 * 1000);
}

export function canMakePlacesCall(userId: string): boolean {
  if (isCircuitOpen(userId)) return false;
  const entry = callsPerUserMinute.get(userId);
  const count = entry ? trimOld(entry.places, 60 * 1000).length : 0;
  return count < budget.maxPlacesCallsPerMinutePerUser;
}

export function canMakeMatrixCall(userId: string): boolean {
  if (isCircuitOpen(userId)) return false;
  const entry = callsPerUserMinute.get(userId);
  const count = entry ? trimOld(entry.matrix, 60 * 1000).length : 0;
  return count < budget.maxMatrixCallsPerMinutePerUser;
}

export function totalGoogleCallsLastMinute(userId: string): number {
  const entry = callsPerUserMinute.get(userId);
  if (!entry) return 0;
  const window = 60 * 1000;
  const places = trimOld(entry.places, window).length;
  const matrix = trimOld(entry.matrix, window).length;
  return places + matrix;
}

export function canMakeAnyGoogleCall(userId: string): boolean {
  return !isCircuitOpen(userId) && totalGoogleCallsLastMinute(userId) < budget.maxGoogleCallsPerMinutePerUser;
}

export function isCircuitOpen(userId: string): boolean {
  const until = circuitOpenUntil.get(userId);
  return until != null && Date.now() < until;
}

export function openCircuit(userId: string): void {
  circuitOpenUntil.set(userId, Date.now() + circuitBreaker.openSec * 1000);
}
