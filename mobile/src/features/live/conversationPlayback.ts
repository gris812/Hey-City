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

export class ConversationPlayback {
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
    this.suspended = undefined;
    const audio = this.current?.audio;
    this.current = undefined;
    if (audio) await audio.unloadAsync();
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
