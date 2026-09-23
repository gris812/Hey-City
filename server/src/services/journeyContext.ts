/**
 * Session-owned, in-memory journey memory. This module deliberately has no
 * persistence, provider, discovery, or generation dependency.
 */

export type JourneyMovementMode = 'walking' | 'vehicle';
export type JourneyStoryLevel = 'auto' | 'short' | 'long';
export type JourneyOutcomeReason = 'completed' | 'skipped' | 'paused' | 'superseded';
export type JourneyCallbackRelationship = 'callback' | 'contrast' | 'continuation' | 'transition';

export interface JourneyMovement {
  mode: JourneyMovementMode;
  latitude: number;
  longitude: number;
  headingDegrees?: number;
  speedKmh?: number;
  observedAt: string;
}

export interface JourneyArea {
  city?: string;
  locality?: string;
  neighborhood?: string;
  region?: string;
  areaType?: string;
  source: 'discovery' | 'local' | 'unknown';
}

export interface JourneyEntityMemory {
  entityId: string;
  name: string;
  category?: string;
  firstSeenAt: string;
  lastDiscussedAt: string;
  discussionCount: number;
  storyLevels: JourneyStoryLevel[];
  guideIds: string[];
  evidenceRefs: string[];
  topics: string[];
  outcome?: JourneyOutcomeReason;
}

export interface JourneyTopicMemory {
  key: string;
  firstAt: string;
  lastAt: string;
  mentions: number;
  entityIds: string[];
}

export interface JourneyOutcomeMemory {
  momentId: string;
  entityId?: string;
  startedAt: string;
  endedAt?: string;
  reason?: JourneyOutcomeReason;
  level?: JourneyStoryLevel;
  listenedSeconds?: number;
}

export interface JourneyQuestionMemory {
  at: string;
  intent?: string;
  subjectId?: string;
  normalizedTopic?: string;
}

export interface JourneyCallback {
  id: string;
  sourceEntityId: string;
  sourceEntityName: string;
  sourceMomentId: string;
  topicKey: string;
  relationship: JourneyCallbackRelationship;
  evidenceRefs: string[];
  createdAt: string;
}

export interface JourneyContext {
  sessionId: string;
  movement?: JourneyMovement;
  area: JourneyArea;
  current: {
    targetId?: string;
    targetName?: string;
    activeStoryLevel?: JourneyStoryLevel;
  };
  recent: {
    entities: JourneyEntityMemory[];
    topics: JourneyTopicMemory[];
    outcomes: JourneyOutcomeMemory[];
    questions: JourneyQuestionMemory[];
    narrativeSignatures: string[];
  };
  callbacks: JourneyCallback[];
  usedEvidenceRefs: string[];
}

export interface JourneyMemoryLimits {
  entities: number;
  topics: number;
  outcomes: number;
  questions: number;
  callbacks: number;
  evidenceRefs: number;
  narrativeSignatures: number;
  areaTtlMs: number;
}

export const JOURNEY_MEMORY_DEFAULT_LIMITS: Readonly<JourneyMemoryLimits> = Object.freeze({
  entities: 20,
  topics: 12,
  outcomes: 20,
  questions: 10,
  callbacks: 8,
  evidenceRefs: 100,
  narrativeSignatures: 12,
  areaTtlMs: 30 * 60 * 1000,
});

export interface JourneyAreaCandidate extends Omit<JourneyArea, 'source'> {
  source: 'discovery' | 'local';
  /** A smaller distance wins after area specificity. */
  distanceMeters?: number;
}

export interface StartJourneyStoryInput {
  momentId: string;
  entityId: string;
  entityName: string;
  category?: string;
  level: JourneyStoryLevel;
  guideId?: string;
  startedAt?: string;
}

export interface RecordJourneyNarrationInput {
  momentId: string;
  evidenceRefs: string[];
  topicKeys: string[];
  narrativeSignature?: string;
  at?: string;
}

export interface FinishJourneyStoryInput {
  momentId: string;
  reason: Exclude<JourneyOutcomeReason, 'superseded'>;
  endedAt?: string;
  listenedSeconds?: number;
}

export interface SelectJourneyCallbackInput {
  entityId: string;
  topicKeys: string[];
  relationship?: JourneyCallbackRelationship;
  at?: string;
}

interface JourneyMoment extends StartJourneyStoryInput {
  startedAt: string;
  delivered: boolean;
  evidenceRefs: string[];
  topicKeys: string[];
  narrativeSignature?: string;
  outcome?: JourneyOutcomeReason;
  endedAt?: string;
  listenedSeconds?: number;
}

const nowIso = (): string => new Date().toISOString();
const unique = (values: string[]): string[] => [...new Set(values.filter(Boolean))];

/** Creates a state instance for exactly one active server session. */
export function createJourneyState(sessionId: string, limits?: Partial<JourneyMemoryLimits>): JourneyState {
  return new JourneyState(sessionId, limits);
}

/** M3-facing convenience helper; it never creates inferred questions. */
export function recordJourneyQuestion(state: JourneyState, question: Omit<JourneyQuestionMemory, 'at'> & { at?: string }): void {
  state.recordQuestion(question);
}

export class JourneyState {
  private readonly limits: JourneyMemoryLimits;
  private movement?: JourneyMovement;
  private area: JourneyArea = { source: 'unknown' };
  private areaUpdatedAt?: number;
  private readonly entities = new Map<string, JourneyEntityMemory>();
  private readonly topics = new Map<string, JourneyTopicMemory>();
  private outcomes: JourneyOutcomeMemory[] = [];
  private questions: JourneyQuestionMemory[] = [];
  private callbacks: JourneyCallback[] = [];
  /** Callback ids confirmed as spoken in this session, ordered by use time. */
  private usedCallbackIds: string[] = [];
  private usedEvidenceRefs: string[] = [];
  private narrativeSignatures: string[] = [];
  private readonly moments = new Map<string, JourneyMoment>();
  private activeMomentId?: string;

  constructor(readonly sessionId: string, limits: Partial<JourneyMemoryLimits> = {}) {
    this.limits = validateLimits({ ...JOURNEY_MEMORY_DEFAULT_LIMITS, ...limits });
  }

  updateMovement(movement: JourneyMovement): void {
    assertFinite(movement.latitude, 'latitude');
    assertFinite(movement.longitude, 'longitude');
    if (movement.headingDegrees !== undefined) assertFinite(movement.headingDegrees, 'headingDegrees');
    if (movement.speedKmh !== undefined) assertFinite(movement.speedKmh, 'speedKmh');
    this.movement = { ...movement };
  }

  updateArea(area: JourneyArea, at = nowIso()): void {
    this.area = { ...area };
    this.areaUpdatedAt = dateMs(at);
  }

  /** Resolves existing discovery/local candidates without a location-provider request. */
  updateAreaFromCandidates(candidates: JourneyAreaCandidate[], at = nowIso()): void {
    const selected = [...candidates]
      .filter(candidate => hasAreaValue(candidate))
      .sort((a, b) => areaSpecificity(b) - areaSpecificity(a) ||
        (a.distanceMeters ?? Number.POSITIVE_INFINITY) - (b.distanceMeters ?? Number.POSITIVE_INFINITY) ||
        areaName(a).localeCompare(areaName(b)))[0];
    if (selected) this.updateArea(selected, at);
  }

  startStory(input: StartJourneyStoryInput): void {
    if (!input.momentId || !input.entityId || !input.entityName) throw new Error('Journey story requires moment and entity identifiers');
    if (this.activeMomentId && this.activeMomentId !== input.momentId) this.markSuperseded(this.activeMomentId, input.startedAt);
    const startedAt = input.startedAt ?? nowIso();
    this.moments.set(input.momentId, { ...input, startedAt, delivered: false, evidenceRefs: [], topicKeys: [] });
    this.activeMomentId = input.momentId;
  }

  /**
   * Stages narration facts for an active moment. Generation/audio availability is
   * deliberately not treated as heard; finishStory decides whether they commit.
   */
  recordNarration(input: RecordJourneyNarrationInput): void {
    const moment = this.moments.get(input.momentId);
    if (!moment || moment.outcome === 'superseded') return;
    moment.delivered = true;
    moment.evidenceRefs = unique([...moment.evidenceRefs, ...input.evidenceRefs]);
    moment.topicKeys = unique([...moment.topicKeys, ...normalizeTopics(input.topicKeys)]);
    moment.narrativeSignature = input.narrativeSignature ?? moment.narrativeSignature;
  }

  finishStory(input: FinishJourneyStoryInput): void {
    this.setOutcome(input.momentId, input.reason, input.endedAt ?? nowIso(), input.listenedSeconds);
  }

  markSuperseded(momentId = this.activeMomentId, at = nowIso()): void {
    if (momentId) this.setOutcome(momentId, 'superseded', at);
  }

  getActiveMoment(): Readonly<JourneyOutcomeMemory & { entityId: string; entityName: string; delivered: boolean; evidenceRefs: string[]; topicKeys: string[] }> | undefined {
    const moment = this.activeMomentId ? this.moments.get(this.activeMomentId) : undefined;
    return moment ? freezeCopy({ momentId: moment.momentId, entityId: moment.entityId, entityName: moment.entityName,
      startedAt: moment.startedAt, level: moment.level, delivered: moment.delivered,
      evidenceRefs: moment.evidenceRefs, topicKeys: moment.topicKeys }) : undefined;
  }

  getUnusedEvidenceRefs(entityId: string, availableEvidenceRefs: string[]): string[] {
    const used = new Set(this.entities.get(entityId)?.evidenceRefs ?? []);
    return unique(availableEvidenceRefs).filter(ref => !used.has(ref));
  }

  selectCallback(input: SelectJourneyCallbackInput): JourneyCallback | undefined {
    const topics = normalizeTopics(input.topicKeys);
    if (!input.entityId || !topics.length) return undefined;
    const source = [...this.moments.values()]
      .filter(moment => moment.entityId !== input.entityId && moment.delivered && moment.outcome === 'completed')
      .sort((a, b) => dateMs(b.endedAt ?? b.startedAt) - dateMs(a.endedAt ?? a.startedAt) || a.momentId.localeCompare(b.momentId))
      .find(moment => topics.some(topic => moment.topicKeys.includes(topic)));
    if (!source) return undefined;
    const topicKey = topics.find(topic => source.topicKeys.includes(topic))!;
    const id = `callback:${source.momentId}:${input.entityId}:${topicKey}`;
    // Selecting/planning a callback does not consume it. Only a completed
    // current story may call recordCallbackUsed after playback succeeds.
    if (this.usedCallbackIds.includes(id)) return undefined;
    const existing = this.callbacks.find(callback => callback.id === id);
    if (existing) return freezeCopy(existing);
    const callback: JourneyCallback = {
      id,
      sourceEntityId: source.entityId,
      sourceEntityName: source.entityName,
      sourceMomentId: source.momentId,
      topicKey,
      relationship: input.relationship ?? 'callback',
      evidenceRefs: [...source.evidenceRefs],
      createdAt: input.at ?? nowIso(),
    };
    this.callbacks = trimNewest([...this.callbacks, callback], this.limits.callbacks);
    return freezeCopy(callback);
  }

  /**
   * Marks a callback as spoken after the consuming story completed. It is kept
   * in session memory only and prevents a mechanical re-use of the same
   * source-target-topic relationship while its source moment remains retained.
   */
  recordCallbackUsed(callbackId: string): void {
    if (!this.callbacks.some(callback => callback.id === callbackId) || this.usedCallbackIds.includes(callbackId)) return;
    this.usedCallbackIds = trimNewest([...this.usedCallbackIds, callbackId], this.limits.outcomes);
  }

  recordQuestion(question: Omit<JourneyQuestionMemory, 'at'> & { at?: string }): void {
    this.questions = trimNewest([...this.questions, { ...question, at: question.at ?? nowIso() }], this.limits.questions);
  }

  getSnapshot(at = nowIso()): Readonly<JourneyContext> {
    this.expireArea(at);
    const active = this.activeMomentId ? this.moments.get(this.activeMomentId) : undefined;
    const snapshot: JourneyContext = {
      sessionId: this.sessionId,
      movement: this.movement ? { ...this.movement } : undefined,
      area: { ...this.area },
      current: active ? { targetId: active.entityId, targetName: active.entityName, activeStoryLevel: active.level } : {},
      recent: {
        entities: sortNewest([...this.entities.values()], value => value.lastDiscussedAt).map(copyEntity),
        topics: sortNewest([...this.topics.values()], value => value.lastAt).map(copyTopic),
        outcomes: this.outcomes.map(outcome => ({ ...outcome })),
        questions: this.questions.map(question => ({ ...question })),
        narrativeSignatures: [...this.narrativeSignatures],
      },
      callbacks: this.callbacks.map(callback => ({ ...callback, evidenceRefs: [...callback.evidenceRefs] })),
      usedEvidenceRefs: [...this.usedEvidenceRefs],
    };
    return freezeCopy(snapshot);
  }

  private setOutcome(momentId: string, reason: JourneyOutcomeReason, endedAt: string, listenedSeconds?: number): void {
    const moment = this.moments.get(momentId);
    if (!moment || moment.outcome === 'superseded' || moment.outcome) return;
    moment.outcome = reason;
    moment.endedAt = endedAt;
    moment.listenedSeconds = listenedSeconds;
    if (this.activeMomentId === momentId) this.activeMomentId = undefined;
    const heard = moment.delivered && (reason === 'completed' || (reason === 'paused' && (listenedSeconds ?? 0) > 0));
    if (heard) {
      this.upsertEntity(moment, endedAt);
      for (const topic of moment.topicKeys) this.upsertTopic(topic, moment.entityId, endedAt);
      this.usedEvidenceRefs = trimNewest(unique([...this.usedEvidenceRefs, ...moment.evidenceRefs]), this.limits.evidenceRefs);
      if (moment.narrativeSignature) this.narrativeSignatures = trimNewest(unique([...this.narrativeSignatures, moment.narrativeSignature]), this.limits.narrativeSignatures);
      const entity = this.entities.get(moment.entityId);
      if (entity) entity.outcome = reason;
    }
    this.outcomes = trimNewest([...this.outcomes, { momentId, entityId: moment.entityId, startedAt: moment.startedAt,
      endedAt, reason, level: moment.level, listenedSeconds }], this.limits.outcomes);
    this.prune();
  }

  private upsertEntity(moment: JourneyMoment, at: string): void {
    const current = this.entities.get(moment.entityId);
    const next: JourneyEntityMemory = current ? {
      ...current, lastDiscussedAt: at, discussionCount: current.discussionCount + 1,
      storyLevels: unique([...current.storyLevels, moment.level]) as JourneyStoryLevel[],
      guideIds: unique([...current.guideIds, ...(moment.guideId ? [moment.guideId] : [])]),
      evidenceRefs: unique([...current.evidenceRefs, ...moment.evidenceRefs]),
      topics: unique([...current.topics, ...moment.topicKeys]),
    } : {
      entityId: moment.entityId, name: moment.entityName, category: moment.category,
      firstSeenAt: at, lastDiscussedAt: at, discussionCount: 1, storyLevels: [moment.level],
      guideIds: moment.guideId ? [moment.guideId] : [],
      evidenceRefs: [...moment.evidenceRefs], topics: [...moment.topicKeys],
    };
    this.entities.set(next.entityId, next);
  }

  private upsertTopic(key: string, entityId: string, at: string): void {
    const current = this.topics.get(key);
    this.topics.set(key, current ? { ...current, lastAt: at, mentions: current.mentions + 1, entityIds: unique([...current.entityIds, entityId]) } :
      { key, firstAt: at, lastAt: at, mentions: 1, entityIds: [entityId] });
  }

  private expireArea(at: string): void {
    if (this.area.source !== 'unknown' && this.areaUpdatedAt !== undefined && dateMs(at) - this.areaUpdatedAt > this.limits.areaTtlMs) {
      this.area = { source: 'unknown' };
      this.areaUpdatedAt = undefined;
    }
  }

  private prune(): void {
    pruneMap(this.entities, this.limits.entities, value => value.lastDiscussedAt);
    pruneMap(this.topics, this.limits.topics, value => value.lastAt);
    const retainedMoments = new Set(this.outcomes.map(outcome => outcome.momentId));
    if (this.activeMomentId) retainedMoments.add(this.activeMomentId);
    for (const id of this.moments.keys()) if (!retainedMoments.has(id)) this.moments.delete(id);
    const retainedCallbackIds = new Set(this.callbacks.map(callback => callback.id));
    this.usedCallbackIds = this.usedCallbackIds.filter(id => retainedCallbackIds.has(id));
  }
}

function validateLimits(limits: JourneyMemoryLimits): JourneyMemoryLimits {
  for (const value of Object.values(limits)) if (!Number.isFinite(value) || value < 1) throw new Error('Journey memory limits must be positive finite numbers');
  return limits;
}
function assertFinite(value: number, name: string): void { if (!Number.isFinite(value)) throw new Error(`Journey movement ${name} must be finite`); }
function dateMs(value: string): number { const result = Date.parse(value); if (!Number.isFinite(result)) throw new Error(`Invalid journey timestamp: ${value}`); return result; }
function normalizeTopics(topics: string[]): string[] { return unique(topics.map(topic => topic.trim().toLowerCase())); }
function trimNewest<T>(values: T[], limit: number): T[] { return values.slice(-limit); }
function sortNewest<T>(values: T[], date: (value: T) => string): T[] { return values.sort((a, b) => dateMs(date(b)) - dateMs(date(a))); }
function pruneMap<T>(map: Map<string, T>, limit: number, date: (value: T) => string): void {
  const removed = sortNewest([...map.entries()], ([, value]) => date(value)).slice(limit);
  for (const [key] of removed) map.delete(key);
}
function hasAreaValue(area: JourneyAreaCandidate): boolean { return Boolean(area.city || area.locality || area.neighborhood || area.region || area.areaType); }
function areaSpecificity(area: JourneyAreaCandidate): number { return area.neighborhood ? 5 : area.locality ? 4 : area.city ? 3 : area.region ? 2 : area.areaType ? 1 : 0; }
function areaName(area: JourneyAreaCandidate): string { return area.neighborhood ?? area.locality ?? area.city ?? area.region ?? area.areaType ?? ''; }
function copyEntity(entity: JourneyEntityMemory): JourneyEntityMemory { return { ...entity, storyLevels: [...entity.storyLevels], guideIds: [...entity.guideIds], evidenceRefs: [...entity.evidenceRefs], topics: [...entity.topics] }; }
function copyTopic(topic: JourneyTopicMemory): JourneyTopicMemory { return { ...topic, entityIds: [...topic.entityIds] }; }
function freezeCopy<T>(value: T): Readonly<T> { return deepFreeze(structuredClone(value)); }
function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
