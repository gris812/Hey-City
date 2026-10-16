import type { GuidePreference, SupportedLocale } from '../../localization/preferences';

export type GuideVoicePreviewState = 'idle' | 'loading' | 'playing' | 'error';

export type GuideVoicePreviewSnapshot = {
  state: GuideVoicePreviewState;
  error: string | null;
  activeGuideId: GuidePreference | null;
};

export type VoicePreviewContext = {
  language: SupportedLocale;
  guestId?: string;
};

export type VoicePreviewSound = {
  stop(): Promise<void>;
  unload(): Promise<void>;
};

export type VoicePreviewDeps = {
  requestSample(
    guideId: GuidePreference,
    language: 'ru' | 'en',
    guestId?: string,
  ): Promise<{ audioUrl: string }>;
  resolveUrl(audioUrl: string): string;
  probe(url: string): Promise<void>;
  configureAudio(): Promise<void>;
  createSound(url: string, onFinished: () => void): Promise<VoicePreviewSound>;
};

export class GuideVoicePreviewController {
  private snapshot: GuideVoicePreviewSnapshot = {
    state: 'idle',
    error: null,
    activeGuideId: null,
  };
  private context: VoicePreviewContext;
  private generation = 0;
  private disposed = false;
  private sound: VoicePreviewSound | null = null;
  private readonly listeners = new Set<(snapshot: GuideVoicePreviewSnapshot) => void>();

  constructor(
    context: VoicePreviewContext,
    private readonly deps: VoicePreviewDeps,
  ) {
    this.context = context;
  }

  getSnapshot(): GuideVoicePreviewSnapshot {
    return this.snapshot;
  }

  subscribe(listener: (snapshot: GuideVoicePreviewSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  updateContext(context: VoicePreviewContext): void {
    // Parent rerenders and unrelated preference updates must not cancel playback.
    // The next explicit Play/Retry uses the latest context.
    this.context = context;
  }

  async play(guideId: GuidePreference): Promise<void> {
    if (this.disposed) return;
    const generation = ++this.generation;
    await this.releaseSound(false);
    if (this.disposed || generation !== this.generation) return;

    this.publish({ state: 'loading', error: null, activeGuideId: guideId });

    try {
      const language = this.context.language === 'ru' ? 'ru' : 'en';
      const sample = await this.deps.requestSample(guideId, language, this.context.guestId);
      if (!this.isCurrent(generation)) return;

      const url = this.deps.resolveUrl(sample.audioUrl);
      await this.deps.probe(url);
      if (!this.isCurrent(generation)) return;

      await this.deps.configureAudio();
      if (!this.isCurrent(generation)) return;

      const sound = await this.deps.createSound(url, () => {
        if (!this.isCurrent(generation)) return;
        const finished = this.sound;
        this.sound = null;
        this.publish({ state: 'idle', error: null, activeGuideId: null });
        if (finished) void finished.unload().catch(() => {});
      });
      if (!this.isCurrent(generation)) {
        await sound.unload().catch(() => {});
        return;
      }

      this.sound = sound;
      this.publish({ state: 'playing', error: null, activeGuideId: guideId });
    } catch (cause) {
      if (!this.isCurrent(generation)) return;
      this.publish({
        state: 'error',
        error: cause instanceof Error ? cause.message : 'Voice sample could not be played.',
        activeGuideId: guideId,
      });
    }
  }

  async retry(): Promise<void> {
    const guideId = this.snapshot.activeGuideId;
    if (guideId) await this.play(guideId);
  }

  async stop(): Promise<void> {
    if (this.disposed) return;
    ++this.generation;
    await this.releaseSound(true);
  }

  async switchGuide(nextGuideId: GuidePreference): Promise<void> {
    if (this.snapshot.activeGuideId === nextGuideId && this.snapshot.state === 'idle') return;
    await this.stop();
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    ++this.generation;
    await this.releaseSound(false);
    this.listeners.clear();
  }

  private isCurrent(generation: number): boolean {
    return !this.disposed && generation === this.generation;
  }

  private publish(snapshot: GuideVoicePreviewSnapshot): void {
    if (this.disposed) return;
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }

  private async releaseSound(reset: boolean): Promise<void> {
    const sound = this.sound;
    this.sound = null;
    if (sound) {
      await sound.stop().catch(() => {});
      await sound.unload().catch(() => {});
    }
    if (reset) this.publish({ state: 'idle', error: null, activeGuideId: null });
  }
}
