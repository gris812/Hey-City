/** Bounded replay buffer for one in-flight MP3, shared by all HTTP readers. */
export class ProgressiveAudio {
  private chunks: Buffer[] = [];
  private bytes = 0;
  private ended = false;
  private failure?: Error;
  private wake = new Set<() => void>();
  private resolveReady!: () => void;
  private rejectReady!: (error: Error) => void;
  readonly ready = new Promise<void>((resolve, reject) => {
    this.resolveReady = resolve; this.rejectReady = reject;
  });

  constructor(private readonly maxBytes: number) {
    // Some callers await completion rather than the first byte.
    void this.ready.catch(() => {});
  }

  append(chunk: Buffer): void {
    if (!chunk.length) return;
    if (this.bytes + chunk.length > this.maxBytes) throw new Error('Speech exceeds buffer limit');
    this.bytes += chunk.length;
    this.chunks.push(chunk);
    this.resolveReady();
    this.notify();
  }

  finish(error?: Error): void {
    this.ended = true;
    this.failure = error;
    if (error) this.rejectReady(error); else this.resolveReady();
    this.notify();
  }

  private notify(): void { for (const resolve of this.wake) resolve(); this.wake.clear(); }

  async *read(signal: AbortSignal): AsyncGenerator<Buffer> {
    let index = 0;
    while (!signal.aborted) {
      if (this.failure) throw this.failure;
      if (index < this.chunks.length) { yield this.chunks[index++]; continue; }
      if (this.ended) return;
      await new Promise<void>(resolve => {
        const done = () => { this.wake.delete(done); signal.removeEventListener('abort', done); resolve(); };
        this.wake.add(done);
        signal.addEventListener('abort', done, { once: true });
      });
    }
  }
}
