import type { PlaybackState, StoryPlaybackIdentity } from '../../presentation/livePresentation';

/**
 * Local-only story playback ownership for M3. Server directives select whether
 * this exact sound may resume; they never cause a story to be regenerated.
 */
export interface StoryAudioPort {
  pauseAsync(): Promise<{ isLoaded?: boolean; positionMillis?: number; error?: string }>;
  playAsync(): Promise<unknown>;
  unloadAsync(): Promise<unknown>;
  getStatusAsync(): Promise<{ positionMillis?: number; isLoaded?: boolean; error?: string }>;
}

export type SuspendedStoryPlayback = {
  momentId: string;
  audioUrl: string;
  positionMillis: number;
};

export type NativeStoryStatus = {
  isLoaded: boolean;
  isPlaying?: boolean;
  isBuffering?: boolean;
  didJustFinish?: boolean;
  positionMillis?: number;
  durationMillis?: number;
  error?: string;
};

export type StoryPlaybackDependencies = {
  create: (url: string, listener: (status: NativeStoryStatus) => void) => Promise<StoryAudioPort>;
  onState: (state: PlaybackState, story?: StoryPlaybackIdentity, progress?: number) => void;
  onEnded: (story: StoryPlaybackIdentity) => void;
  onError: (code: string, story: StoryPlaybackIdentity) => void;
};

export class ConversationPlayback {
  private revision = 0;
  private unloading: Promise<void> = Promise.resolve();
  private story?: StoryPlaybackIdentity;
  private state: PlaybackState = 'idle';
  private heard = false;
  private ended = false;
  private deps?: StoryPlaybackDependencies;

  /** Load, callbacks, failures and completion all belong to this exact media revision. */
  async loadStory(story: StoryPlaybackIdentity, audioUrl: string | undefined, deps: StoryPlaybackDependencies): Promise<void> {
    const clearing = this.clear();
    const revision = this.revision;
    try { await clearing; }
    catch {
      if (revision === this.revision) { deps.onState('error', story); deps.onError('audio_unload_failed', story); }
      return;
    }
    if (revision !== this.revision) return;
    this.story = story;
    this.deps = deps;
    this.heard = false;
    this.ended = false;
    this.state = audioUrl ? 'loading' : 'text_only';
    deps.onState(this.state, story);
    if (!audioUrl) {
      deps.onError('audio_missing', story);
      return;
    }
    try {
      const audio = await deps.create(audioUrl, status => {
        if (!this.matches(revision, story)) return;
        if (!status.isLoaded) {
          if (status.error) this.fail('audio_status_failed', story);
          return;
        }
        if (this.state === 'error' || this.ended) return;
        if (status.isPlaying) this.heard = true;
        if (status.didJustFinish) {
          if (!this.heard) { this.fail('audio_ended_before_start', story); return; }
          this.ended = true;
          this.state = 'completed';
          deps.onState('completed', story, 1);
          deps.onEnded(story);
          return;
        }
        this.state = status.isBuffering ? 'loading' : status.isPlaying ? 'playing' : this.heard ? 'paused' : 'loading';
        deps.onState(this.state, story, status.durationMillis ? (status.positionMillis ?? 0) / status.durationMillis : undefined);
      });
      if (!this.matches(revision, story) || (this.state as PlaybackState) === 'error' || this.ended) { await audio.unloadAsync(); return; }
      this.attach(story.momentId, audioUrl, audio);
      await audio.playAsync(); // Only the native status callback may confirm playing.
      if (!this.matches(revision, story)) await audio.unloadAsync();
    } catch {
      if (this.matches(revision, story)) this.fail('audio_load_failed', story);
    }
  }

  private matches(revision: number, story: StoryPlaybackIdentity): boolean {
    return revision === this.revision && story === this.story;
  }

  private fail(code: string, story: StoryPlaybackIdentity): void {
    if (this.state === 'error' || this.ended) return;
    this.state = 'error';
    this.deps?.onState('error', story);
    this.deps?.onError(code, story);
    const audio = this.current?.audio;
    this.current = undefined;
    const deps = this.deps;
    this.unloading = this.unloading.then(async () => { if (audio) await audio.unloadAsync(); });
    void this.unloading.catch(() => deps?.onError('audio_unload_failed', story));
  }

  async pause(): Promise<void> {
    if (!this.current || !this.story || this.ended || this.state === 'error') return;
    const story = this.story;
    try { await this.current.audio.pauseAsync(); }
    catch { if (this.story === story) this.fail('audio_pause_failed', story); }
  }

  async resume(): Promise<void> {
    if (!this.current || !this.story || this.ended || this.state !== 'paused') return;
    const story = this.story;
    try { await this.current.audio.playAsync(); }
    catch { if (this.story === story) this.fail('audio_resume_failed', story); }
  }

  private current?: { momentId: string; audioUrl: string; audio: StoryAudioPort };
  private suspended?: SuspendedStoryPlayback;

  attach(momentId: string, audioUrl: string, audio: StoryAudioPort): void {
    this.current = { momentId, audioUrl, audio };
    this.suspended = undefined;
  }

  /** Pause first; the native pause status preserves the exact local position. */
  async pauseForConversation(): Promise<SuspendedStoryPlayback | undefined> {
    if (!this.current) return undefined;
    const { momentId, audioUrl, audio } = this.current;
    this.suspended = { momentId, audioUrl, positionMillis: 0 };
    const paused = await audio.pauseAsync();
    const status = paused && typeof paused === 'object' ? paused : await audio.getStatusAsync();
    if (this.suspended?.momentId === momentId) {
      this.suspended.positionMillis = status.positionMillis ?? 0;
    }
    return this.suspended;
  }

  async resumeOriginal(momentId: string): Promise<boolean> {
    if (!this.current || !this.suspended || this.current.momentId !== momentId || this.suspended.momentId !== momentId) {
      return false;
    }
    await this.current.audio.playAsync();
    this.suspended = undefined;
    return true;
  }

  getSuspended(): SuspendedStoryPlayback | undefined {
    return this.suspended ? { ...this.suspended } : undefined;
  }

  async clear(): Promise<void> {
    ++this.revision;
    this.story = undefined;
    this.suspended = undefined;
    const audio = this.current?.audio;
    this.current = undefined;
    this.unloading = this.unloading.then(async () => { if (audio) await audio.unloadAsync(); });
    await this.unloading;
  }
}

/** A late response must never apply map, navigation, or resume actions. */
export function isCurrentConversationTurn(
  responseSessionId: string,
  responseRevision: number,
  activeSessionId: string | null,
  activeRevision: number,
): boolean {
  return responseSessionId === activeSessionId && responseRevision === activeRevision;
}
