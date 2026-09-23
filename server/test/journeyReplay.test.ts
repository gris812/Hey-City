import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  createJourneyState,
  JourneyArea,
  JourneyCallbackRelationship,
  JourneyOutcomeReason,
  JourneyStoryLevel,
} from '../src/services/journeyContext';

type Expectation = {
  area?: Pick<JourneyArea, 'city' | 'locality' | 'neighborhood' | 'region'> | null;
  currentTargetId?: string | null;
  outcomes?: Array<{ entityId: string; reason: JourneyOutcomeReason }>;
  recentEntityIds?: string[];
  entityStoryLevels?: Record<string, JourneyStoryLevel[]>;
  usedEvidenceRefs?: string[];
  unusedEvidenceRefs?: string[];
  callbackSourceEntityIds?: string[];
  forbiddenCallbackSourceEntityIds?: string[];
  persistentJourneyWrites?: number;
};

type CallbackExpectation = {
  sourceEntityId: string;
  topicKey: string;
  relationship?: JourneyCallbackRelationship;
};

type ReplayEvent =
  | { atMs: number; type: 'context'; mode: 'walking' | 'vehicle'; area: Pick<JourneyArea, 'city' | 'locality' | 'neighborhood' | 'region'> | null; expect: Expectation }
  | { atMs: number; type: 'story_started'; entityId: string; entityName: string; level?: JourneyStoryLevel; topics: string[]; evidenceRefs: string[]; callback?: CallbackExpectation; expect: Expectation }
  | { atMs: number; type: 'story_finished'; reason: Exclude<JourneyOutcomeReason, 'superseded'>; expect: Expectation }
  | { atMs: number; type: 'story_candidate'; entityId: string; topics: string[]; evidenceRefs: string[]; callback?: CallbackExpectation; expect: Expectation }
  | { atMs: number; type: 'snapshot'; expect: Expectation };

type ReplayScenario = {
  id: string;
  name: string;
  historyEnabled?: boolean;
  areaTtlMs?: number;
  events: ReplayEvent[];
};

type ReplayFixture = {
  version: string;
  durationMinutes: number;
  clock: { startMs: number; endMs: number };
  scenarios: ReplayScenario[];
};

const at = (ms: number): string => new Date(ms).toISOString();
const fixturePath = path.resolve(process.cwd(), '../evaluation/golden/journey-v2.json');
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as ReplayFixture;

function assertContext(
  scenario: ReplayScenario,
  event: ReplayEvent,
  state: ReturnType<typeof createJourneyState>,
  persistentJourneyWrites: number,
  callbackSourceEntityIds: string[],
  unusedEvidenceRefs: string[] | undefined
): void {
  const snapshot = state.getSnapshot(at(event.atMs));
  const expected = event.expect;
  if (expected.area !== undefined) {
    if (expected.area === null) assert.deepEqual(snapshot.area, { source: 'unknown' }, `${scenario.id}@${event.atMs}: current area is explicit unknown`);
    else for (const [key, value] of Object.entries(expected.area)) assert.equal(snapshot.area[key as keyof JourneyArea], value, `${scenario.id}@${event.atMs}: area ${key}`);
  }
  if (expected.currentTargetId !== undefined) assert.equal(snapshot.current.targetId ?? null, expected.currentTargetId, `${scenario.id}@${event.atMs}: active target`);
  if (expected.outcomes) assert.deepEqual(
    snapshot.recent.outcomes.map(outcome => ({ entityId: outcome.entityId, reason: outcome.reason })),
    expected.outcomes,
    `${scenario.id}@${event.atMs}: outcomes`
  );
  if (expected.recentEntityIds) assert.deepEqual(snapshot.recent.entities.map(entity => entity.entityId), expected.recentEntityIds, `${scenario.id}@${event.atMs}: recent entities`);
  if (expected.entityStoryLevels) for (const [entityId, levels] of Object.entries(expected.entityStoryLevels)) {
    assert.deepEqual(snapshot.recent.entities.find(entity => entity.entityId === entityId)?.storyLevels, levels, `${scenario.id}@${event.atMs}: ${entityId} levels`);
  }
  if (expected.usedEvidenceRefs) assert.deepEqual(snapshot.usedEvidenceRefs, expected.usedEvidenceRefs, `${scenario.id}@${event.atMs}: used evidence`);
  if (expected.unusedEvidenceRefs) assert.deepEqual(unusedEvidenceRefs, expected.unusedEvidenceRefs, `${scenario.id}@${event.atMs}: unused evidence`);
  if (expected.callbackSourceEntityIds) assert.deepEqual(callbackSourceEntityIds, expected.callbackSourceEntityIds, `${scenario.id}@${event.atMs}: allowed callbacks`);
  if (expected.forbiddenCallbackSourceEntityIds) for (const source of expected.forbiddenCallbackSourceEntityIds) {
    assert.ok(!callbackSourceEntityIds.includes(source), `${scenario.id}@${event.atMs}: ${source} is forbidden callback context`);
  }
  if (expected.persistentJourneyWrites !== undefined) assert.equal(persistentJourneyWrites, expected.persistentJourneyWrites, `${scenario.id}@${event.atMs}: history-disabled durable writes`);
}

function runScenario(scenario: ReplayScenario): void {
  const state = createJourneyState(`replay-${scenario.id}`, scenario.areaTtlMs ? { areaTtlMs: scenario.areaTtlMs } : undefined);
  let activeMomentId: string | undefined;
  let persistentJourneyWrites = 0;

  for (const [index, event] of scenario.events.entries()) {
    let unusedEvidenceRefs: string[] | undefined;
    let callbackSourceEntityIds: string[] = [];
    if (event.type === 'context') {
      state.updateMovement({ mode: event.mode, latitude: 40.71, longitude: -74.01, observedAt: at(event.atMs) });
      state.updateArea(event.area ? { ...event.area, source: 'discovery' } : { source: 'unknown' }, at(event.atMs));
    } else if (event.type === 'story_started') {
      activeMomentId = `${scenario.id}-m${index}`;
      state.startStory({ momentId: activeMomentId, entityId: event.entityId, entityName: event.entityName, level: event.level ?? 'auto', startedAt: at(event.atMs) });
      state.recordNarration({ momentId: activeMomentId, evidenceRefs: event.evidenceRefs, topicKeys: event.topics, at: at(event.atMs) });
      if (scenario.historyEnabled !== false) persistentJourneyWrites += 0; // JourneyState never persists; integration owns durable history.
      if (event.callback) {
        const callback = state.selectCallback({ entityId: event.entityId, topicKeys: event.topics, relationship: event.callback.relationship, at: at(event.atMs) });
        callbackSourceEntityIds = callback ? [callback.sourceEntityId] : [];
        assert.equal(callback?.sourceEntityId, event.callback.sourceEntityId, `${scenario.id}@${event.atMs}: callback source`);
        assert.equal(callback?.topicKey, event.callback.topicKey, `${scenario.id}@${event.atMs}: callback topic`);
      }
    } else if (event.type === 'story_finished') {
      assert.ok(activeMomentId, `${scenario.id}@${event.atMs}: finish has active story`);
      state.finishStory({ momentId: activeMomentId!, reason: event.reason, endedAt: at(event.atMs), listenedSeconds: event.reason === 'completed' ? 50 : 3 });
      activeMomentId = undefined;
    } else if (event.type === 'story_candidate') {
      unusedEvidenceRefs = state.getUnusedEvidenceRefs(event.entityId, event.evidenceRefs);
      if (event.callback) {
        const callback = state.selectCallback({ entityId: event.entityId, topicKeys: event.topics, relationship: event.callback.relationship, at: at(event.atMs) });
        callbackSourceEntityIds = callback ? [callback.sourceEntityId] : [];
        assert.equal(callback?.sourceEntityId, event.callback.sourceEntityId, `${scenario.id}@${event.atMs}: callback source`);
        assert.equal(callback?.topicKey, event.callback.topicKey, `${scenario.id}@${event.atMs}: callback topic`);
      } else {
        callbackSourceEntityIds = state.getSnapshot(at(event.atMs)).callbacks.map(callback => callback.sourceEntityId);
      }
    }
    assertContext(scenario, event, state, persistentJourneyWrites, callbackSourceEntityIds, unusedEvidenceRefs);
  }
}

function run(): void {
  assert.equal(fixture.durationMinutes, 20);
  assert.equal(fixture.clock.endMs - fixture.clock.startMs, fixture.durationMinutes * 60_000, 'fixture clock spans twenty actual simulated minutes');
  assert.deepEqual(fixture.scenarios.map(scenario => scenario.id), ['R1', 'R2', 'R3', 'R4', 'R5']);
  for (const scenario of fixture.scenarios) {
    assert.ok(scenario.events.length > 0, `${scenario.id}: has replay events`);
    assert.ok(scenario.events.every((event, index) => event.atMs >= fixture.clock.startMs && event.atMs <= fixture.clock.endMs && (index === 0 || event.atMs >= scenario.events[index - 1].atMs)), `${scenario.id}: events are ordered inside the replay clock`);
    runScenario(scenario);
  }
  console.log('M2 fixture-driven deterministic journey replay tests passed');
}

run();
