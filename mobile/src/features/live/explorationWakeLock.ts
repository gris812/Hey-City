export function shouldKeepExplorationAwake(input: {
  focused: boolean; foreground: boolean; scenario: string; sessionActive: boolean;
  tourState: string; tourPaused: boolean;
}): boolean {
  if (!input.focused || !input.foreground) return false;
  if (input.scenario === 'guided_tour') return !input.tourPaused && !['idle', 'completed', 'error'].includes(input.tourState);
  return input.sessionActive;
}

/** Serialize Expo's async calls so late activation is always released after teardown. */
export class ExplorationWakeLock {
  private desired = false;
  private active = false;
  private disposed = false;
  private queue: Promise<void> = Promise.resolve();
  constructor(private port: { activate(): Promise<void>; deactivate(): Promise<void>; failed(): void }) {}
  setEnabled(enabled: boolean): Promise<void> {
    this.desired = !this.disposed && enabled;
    this.queue = this.queue.then(async () => {
      while (this.active !== this.desired) {
        const target = this.desired;
        try {
          if (target) await this.port.activate(); else await this.port.deactivate();
          this.active = target;
        } catch { this.port.failed(); break; }
      }
    });
    return this.queue;
  }
  dispose(): Promise<void> { this.disposed = true; return this.setEnabled(false); }
}
