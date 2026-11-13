import type { SelectedStoryResult } from '@heycity/shared';

export type StoryChoice = {
  sessionId: string;
  poiId: string;
  name: string;
  latitude: number;
  longitude: number;
  level: 'short' | 'long';
  language: string;
  guideId?: 'dana' | 'arthur';
};
export type SelectionDependencies = {
  stopPlayback(): Promise<void>;
  request(choice: StoryChoice, requestId: string, signal: AbortSignal): Promise<SelectedStoryResult>;
  preparing(choice: StoryChoice): void;
  selected(choice: StoryChoice, result: SelectedStoryResult): Promise<void>;
  failed(choice: StoryChoice, error: unknown, stage?: 'stop' | 'request' | 'delivery'): void;
};

/** Local request supersession only. The session's server JourneyState owns narrative decisions. */
export class ExplicitStorySelection {
  private sequence = 0;
  private current?: { key: string; abort: AbortController; state: 'pending' | 'delivered' | 'error'; requestId: string; result?: SelectedStoryResult };
  get isPreparing(): boolean { return this.current?.state === 'pending'; }
  get holdsAutomaticNarration(): boolean {
    return Boolean(this.current);
  }

  async select(choice: StoryChoice, deps: SelectionDependencies): Promise<void> {
    const key = JSON.stringify([choice.sessionId, choice.poiId, choice.level, choice.language, choice.guideId]);
    const prior = this.current?.key === key ? this.current : undefined;
    if (prior && prior.state !== 'error') return;
    this.cancel();
    const current = { key, abort: new AbortController(), state: 'pending' as const,
      requestId: prior?.requestId ?? `native-${Date.now()}-${++this.sequence}`, result: prior?.result };
    this.current = current;
    deps.preparing(choice);
    let stage: 'stop' | 'request' | 'delivery' = 'stop';
    try {
      await deps.stopPlayback();
      if (this.current !== current) return;
      stage = 'request';
      const result = current.result ?? await deps.request(choice, current.requestId, current.abort.signal);
      if (this.current !== current) return;
      if (result.poiId !== choice.poiId ||
          (choice.guideId && result.guideId !== choice.guideId && !(choice.guideId === 'arthur' && result.guideId === 'artur'))) {
        throw new Error('Selection response identity mismatch');
      }
      this.current.result = result;
      this.current.state = 'delivered';
      stage = 'delivery';
      await deps.selected(choice, result);
    } catch (error) {
      if (this.current !== current) return;
      this.current.state = 'error';
      deps.failed(choice, error, stage);
    }
  }

  /** Allow a deliberate retry after a native loading failure, without accepting stale media. */
  markEnded(): void { if (this.current?.state === 'delivered') this.current = { ...this.current, state: 'error', result: undefined, requestId: `native-${Date.now()}-${++this.sequence}` }; }
  retryAfterAudioFailure(): void { if (this.current) this.current.state = 'error'; }
  cancel(): void {
    this.current?.abort.abort();
    this.current = undefined;
  }
}

/** A terminal request refusal has no audio owner and must never render playback failure. */
export function selectionFailurePresentation(stage:'stop'|'request'|'delivery'|undefined,status?:number): {kind:'evidence'|'generation'|'playback';playbackState:'idle'|'error'} {
  return stage==='stop' ? {kind:'playback',playbackState:'error'} : {kind:status===422?'evidence':'generation',playbackState:'idle'};
}
