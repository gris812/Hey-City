export type RuntimeIntervalRef<TInterval> = { current: TInterval | null };

export function clearRuntimeInterval<TInterval>(
  intervalRef: RuntimeIntervalRef<TInterval>,
  clearIntervalFn: (id: TInterval) => void
): void {
  if (!intervalRef.current) return;
  clearIntervalFn(intervalRef.current);
  intervalRef.current = null;
}
