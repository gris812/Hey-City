import { randomUUID } from 'node:crypto';
import type { ConversationIntent, ConversationNearbyResult, ConversationToolName, NarrativeLevel, NarrativePlan, ResumeDirective } from '@heycity/shared';
import type { EvidenceBundle } from './evidence';
import type { JourneyState } from './journeyContext';
import { conversationResumeDirective } from '../policies/conversationResumePolicy';

export type ConversationState =
  | 'idle'
  | 'narrating'
  | 'listening'
  | 'understanding'
  | 'tool_execution'
  | 'responding'
  | 'resume_decision';

export interface ActiveStoryContext {
  momentId: string;
  subjectId: string;
  subjectName: string;
  level: NarrativeLevel;
  plan: Pick<NarrativePlan, 'moment' | 'narrativeAngle' | 'evidenceRefs'>;
  evidence: EvidenceBundle;
  guideId: string;
  language: string;
}

export interface ConversationRuntimeSnapshot {
  state: ConversationState;
  activeTurnId?: string;
  suspendedStory?: {
    momentId: string;
    entityId: string;
    entityName: string;
    level: NarrativeLevel;
    listenedSeconds?: number;
  };
  lastIntent?: ConversationIntent;
  lastTool?: ConversationToolName;
}

export interface ConversationInterruption {
  momentId: string;
  listenedSeconds?: number;
}

/**
 * Session-local M3 state. It deliberately references JourneyState instead of
 * mirroring its history or deciding what Discovery should narrate next.
 */
export class ConversationRuntime {
  private state: ConversationState = 'idle';
  private activeStory?: ActiveStoryContext;
  private suspendedStory?: ConversationRuntimeSnapshot['suspendedStory'];
  private activeTurnId?: string;
  private lastIntent?: ConversationIntent;
  private lastTool?: ConversationToolName;
  private turnRequest?: AbortController;
  private validatedNearbyResults: ConversationNearbyResult[] = [];

  constructor(private readonly journeyState: JourneyState) {}

  getSnapshot(): Readonly<ConversationRuntimeSnapshot> {
    return Object.freeze({
      state: this.state,
      activeTurnId: this.activeTurnId,
      suspendedStory: this.suspendedStory ? { ...this.suspendedStory } : undefined,
      lastIntent: this.lastIntent,
      lastTool: this.lastTool,
    });
  }

  getActiveStoryContext(): Readonly<ActiveStoryContext> | undefined {
    return this.activeStory ? structuredClone(this.activeStory) : undefined;
  }

  /** Called only after a narrative moment is created successfully. */
  activateStory(context: ActiveStoryContext): void {
    const activeMoment = this.journeyState.getActiveMoment();
    if (!activeMoment || activeMoment.momentId !== context.momentId) return;
    this.abortTurn();
    this.activeStory = boundedContext(context);
    this.suspendedStory = undefined;
    this.validatedNearbyResults = [];
    this.state = 'narrating';
  }

  /** Idempotent for the same active moment; stale moment ids cannot mutate state. */
  interrupt(input: ConversationInterruption): boolean {
    const activeMoment = this.journeyState.getActiveMoment();
    if (!this.activeStory || !activeMoment || input.momentId !== this.activeStory.momentId ||
        activeMoment.momentId !== input.momentId) return false;
    if (this.suspendedStory?.momentId === input.momentId) return true;
    this.abortTurn();
    this.suspendedStory = {
      momentId: this.activeStory.momentId,
      entityId: this.activeStory.subjectId,
      entityName: this.activeStory.subjectName,
      level: this.activeStory.level,
      listenedSeconds: normalizeListenedSeconds(input.listenedSeconds),
    };
    this.state = 'listening';
    return true;
  }

  /**
   * Begins a latest-wins turn. Later M3 orchestration attaches provider/model
   * work to this signal and must call isCurrentTurn before publishing results.
   */
  beginTurn(): { turnId: string; signal: AbortSignal } {
    this.abortTurn();
    const controller = new AbortController();
    this.turnRequest = controller;
    this.activeTurnId = randomUUID();
    this.state = 'understanding';
    return { turnId: this.activeTurnId, signal: controller.signal };
  }

  isCurrentTurn(turnId: string): boolean {
    return !this.turnRequest?.signal.aborted && this.activeTurnId === turnId;
  }

  setTurnState(turnId: string, state: Extract<ConversationState, 'understanding' | 'tool_execution' | 'responding'>,
    details?: { intent?: ConversationIntent; tool?: ConversationToolName }): boolean {
    if (!this.isCurrentTurn(turnId)) return false;
    this.state = state;
    if (details?.intent) this.lastIntent = details.intent;
    if (details?.tool) this.lastTool = details.tool;
    return true;
  }

  decideResume(intent: ConversationIntent, navigationAccepted = false): ResumeDirective {
    const directive = conversationResumeDirective({
      intent,
      suspendedMomentId: this.suspendedStory?.momentId,
      navigationAccepted,
    });
    this.lastIntent = intent;
    this.state = 'resume_decision';
    this.activeTurnId = undefined;
    this.turnRequest = undefined;
    if (directive.action === 'abandon_previous') {
      this.abandonSuspended();
    } else if (directive.action === 'stay_idle') {
      this.state = this.activeStory ? 'narrating' : 'idle';
    }
    return directive;
  }

  /** Confirms client playback resume without creating or regenerating a story. */
  confirmResume(momentId: string): ResumeDirective {
    const activeMoment = this.journeyState.getActiveMoment();
    if (!this.suspendedStory || this.suspendedStory.momentId !== momentId || activeMoment?.momentId !== momentId) {
      return { action: 'stay_idle' };
    }
    this.suspendedStory = undefined;
    this.state = 'narrating';
    return { action: 'resume_existing', momentId };
  }

  /** Compatibility helper for lifecycle callers that make an immediate decision. */
  resume(intent: ConversationIntent, navigationAccepted = false): ResumeDirective {
    const directive = this.decideResume(intent, navigationAccepted);
    return directive.action === 'resume_existing' ? this.confirmResume(directive.momentId) : directive;
  }

  setValidatedNearbyResults(results: readonly ConversationNearbyResult[]): void {
    this.validatedNearbyResults = results.slice(0, 20).map(result => ({ ...result }));
  }

  getValidatedNearbyResults(): ReadonlyArray<ConversationNearbyResult> {
    return this.validatedNearbyResults.map(result => ({ ...result }));
  }

  cancelTurn(turnId?: string): boolean {
    if (turnId && this.activeTurnId && turnId !== this.activeTurnId) return false;
    this.abortTurn();
    this.activeTurnId = undefined;
    this.state = this.suspendedStory ? 'listening' : this.activeStory ? 'narrating' : 'idle';
    return true;
  }

  /** Conservative non-completed finalization; callbacks are never consumed. */
  abandonSuspended(): boolean {
    const suspended = this.suspendedStory;
    const activeMoment = this.journeyState.getActiveMoment();
    if (!suspended || !activeMoment || activeMoment.momentId !== suspended.momentId) {
      this.clear();
      return false;
    }
    this.journeyState.finishStory({
      momentId: suspended.momentId,
      reason: 'skipped',
      listenedSeconds: suspended.listenedSeconds,
    });
    this.clear();
    return true;
  }

  abandonForContextChange(): void {
    if (this.suspendedStory) {
      this.abandonSuspended();
      return;
    }
    const activeMoment = this.journeyState.getActiveMoment();
    if (activeMoment && this.activeStory?.momentId === activeMoment.momentId) {
      this.journeyState.markSuperseded(activeMoment.momentId);
    }
    this.clear();
  }

  /** Called when existing playback reports completion/skip or a story supersedes it. */
  storyFinished(momentId?: string): void {
    if (!momentId || this.activeStory?.momentId === momentId || this.suspendedStory?.momentId === momentId) this.clear();
  }

  /** Conversation blocks a new automatic narration without changing Discovery selection. */
  blocksNarration(): boolean {
    return this.state !== 'idle';
  }

  clear(): void {
    this.abortTurn();
    this.activeStory = undefined;
    this.suspendedStory = undefined;
    this.activeTurnId = undefined;
    this.lastIntent = undefined;
    this.lastTool = undefined;
    this.validatedNearbyResults = [];
    this.state = 'idle';
  }

  private abortTurn(): void {
    this.turnRequest?.abort();
    this.turnRequest = undefined;
  }
}

function boundedContext(context: ActiveStoryContext): ActiveStoryContext {
  const allowedEvidenceIds = new Set(context.plan.evidenceRefs);
  const evidence = {
    ...context.evidence,
    items: context.evidence.items.filter(item => allowedEvidenceIds.has(item.id)).map(item => ({ ...item })),
    attribution: context.evidence.attribution ? { ...context.evidence.attribution } : undefined,
  };
  return {
    ...context,
    plan: { moment: structuredClone(context.plan.moment), narrativeAngle: context.plan.narrativeAngle,
      evidenceRefs: [...context.plan.evidenceRefs] },
    evidence,
  };
}

function normalizeListenedSeconds(value: number | undefined): number | undefined {
  return Number.isFinite(value) && (value ?? 0) >= 0 ? Math.min(86_400, value!) : undefined;
}
