import assert from 'node:assert/strict';
import {
  createJourneyState,
  recordJourneyQuestion,
} from '../src/services/journeyContext';

const at = (seconds: number) => new Date(seconds * 1000).toISOString();

function delivered(state: ReturnType<typeof createJourneyState>, input: {
  id: string; entityId: string; name: string; topics: string[]; refs: string[]; seconds: number;
}): void {
  state.startStory({ momentId: input.id, entityId: input.entityId, entityName: input.name, category: 'landmark', level: 'short', guideId: 'arthur', startedAt: at(input.seconds) });
  state.recordNarration({ momentId: input.id, topicKeys: input.topics, evidenceRefs: input.refs, narrativeSignature: `arthur:new_topic:${input.id}`, at: at(input.seconds + 1) });
}

function run(): void {
  const state = createJourneyState('session-1', { entities: 2, topics: 2, outcomes: 2, questions: 2, callbacks: 2, evidenceRefs: 3, narrativeSignatures: 2, areaTtlMs: 100 });
  const initial = state.getSnapshot(at(0));
  assert.equal(initial.movement, undefined);
  assert.deepEqual(initial.area, { source: 'unknown' });
  assert.deepEqual(initial.recent.entities, []);
  assert.deepEqual(initial.callbacks, []);

  state.updateMovement({ mode: 'walking', latitude: 40.7, longitude: -74.0, headingDegrees: 90, speedKmh: 4.5, observedAt: at(1) });
  state.updateAreaFromCandidates([
    { source: 'discovery', city: 'New York', distanceMeters: 30 },
    { source: 'local', neighborhood: 'Financial District', city: 'New York', distanceMeters: 200 },
  ], at(2));
  const moved = state.getSnapshot(at(2));
  assert.equal(moved.movement?.mode, 'walking');
  assert.equal(moved.area.neighborhood, 'Financial District');
  assert.equal(moved.area.source, 'local');
  assert.equal(state.getSnapshot(at(3)).area.source, 'unknown', 'stale area expires without a provider lookup');

  delivered(state, { id: 'wall-street', entityId: 'wall-street', name: 'Wall Street', topics: ['Finance', 'history'], refs: ['e1', 'e2'], seconds: 10 });
  assert.equal(state.getSnapshot(at(11)).recent.outcomes.length, 0, 'generation/audio availability is not completion');
  assert.deepEqual(state.getSnapshot(at(11)).recent.entities, [], 'unheard narration is not remembered as discussed');
  assert.deepEqual(state.getSnapshot(at(11)).usedEvidenceRefs, [], 'unheard narration does not consume evidence');
  state.finishStory({ momentId: 'wall-street', reason: 'completed', endedAt: at(20), listenedSeconds: 10 });
  const heard = state.getSnapshot(at(20));
  assert.equal(heard.recent.entities[0].discussionCount, 1);
  assert.deepEqual(heard.recent.entities[0].guideIds, ['arthur']);
  assert.deepEqual(heard.usedEvidenceRefs, ['e1', 'e2']);
  assert.equal(heard.recent.outcomes[0].reason, 'completed');
  assert.deepEqual(state.getUnusedEvidenceRefs('wall-street', ['e1', 'e2', 'e3']), ['e3']);

  delivered(state, { id: 'federal-hall', entityId: 'federal-hall', name: 'Federal Hall', topics: ['finance', 'politics'], refs: ['e3'], seconds: 30 });
  const callback = state.selectCallback({ entityId: 'federal-hall', topicKeys: ['finance'], relationship: 'contrast', at: at(31) });
  assert.equal(callback?.sourceMomentId, 'wall-street');
  assert.equal(callback?.sourceEntityName, 'Wall Street');
  assert.equal(callback?.relationship, 'contrast');
  assert.equal(state.selectCallback({ entityId: 'federal-hall', topicKeys: ['architecture'] }), undefined, 'callbacks require a shared deterministic topic');
  assert.equal(state.selectCallback({ entityId: 'federal-hall', topicKeys: ['finance'] })?.id, callback?.id, 'an unplayed callback remains available after planning fails');
  state.finishStory({ momentId: 'federal-hall', reason: 'completed', endedAt: at(32), listenedSeconds: 2 });
  state.recordCallbackUsed(callback!.id);
  assert.equal(state.selectCallback({ entityId: 'federal-hall', topicKeys: ['finance'] }), undefined, 'a completed callback cannot be mechanically reused');
  assert.equal(state.getSnapshot(at(32)).callbacks.some(item => item.id === callback.id), false,
    'consumed callbacks are absent from the planning snapshot');

  delivered(state, { id: 'skipped', entityId: 'skipped', name: 'Skipped place', topics: ['architecture'], refs: ['skip-1'], seconds: 35 });
  state.finishStory({ momentId: 'skipped', reason: 'skipped', endedAt: at(36) });
  assert.equal(state.getSnapshot(at(36)).recent.entities.some(entity => entity.entityId === 'skipped'), false, 'skipped narration is not remembered as heard');
  delivered(state, { id: 'trinity', entityId: 'trinity', name: 'Trinity Church', topics: ['architecture'], refs: ['e4'], seconds: 40 });
  state.markSuperseded('trinity', at(41));
  state.finishStory({ momentId: 'trinity', reason: 'completed', endedAt: at(42) });
  assert.equal(state.selectCallback({ entityId: 'new-place', topicKeys: ['architecture'] }), undefined, 'superseded narration can never become a callback source');

  const paused = createJourneyState('paused');
  delivered(paused, { id: 'silent-pause', entityId: 'silent-pause', name: 'Silent pause', topics: ['art'], refs: ['p1'], seconds: 1 });
  paused.finishStory({ momentId: 'silent-pause', reason: 'paused', endedAt: at(2) });
  assert.equal(paused.getSnapshot(at(2)).recent.entities.length, 0, 'a pause without listening time is not heard');
  delivered(paused, { id: 'heard-pause', entityId: 'heard-pause', name: 'Heard pause', topics: ['art'], refs: ['p2'], seconds: 3 });
  paused.finishStory({ momentId: 'heard-pause', reason: 'paused', endedAt: at(4), listenedSeconds: 1 });
  assert.equal(paused.getSnapshot(at(4)).recent.entities[0].entityId, 'heard-pause');

  recordJourneyQuestion(state, { intent: 'current_story', subjectId: 'federal-hall', normalizedTopic: 'finance', at: at(50) });
  assert.equal(state.getSnapshot(at(50)).recent.questions[0].intent, 'current_story');

  const snapshot = state.getSnapshot(at(50));
  assert.throws(() => (snapshot.recent.entities as unknown as Array<unknown>).push({}), TypeError, 'snapshot arrays are immutable copies');

  const restored = createJourneyState('restored', {entities: 2});
  restored.hydrateRecentHistory([{entityId:'prior',at:at(45),level:'short',topicKeys:['Finance'],evidenceRefs:['old-ref']}]);
  assert.equal(restored.getSnapshot(at(50)).recent.entities[0].entityId, 'prior');
  assert.deepEqual(restored.getUnusedEvidenceRefs('prior',['old-ref','new-ref']),['new-ref']);
  assert.equal(restored.selectCallback({entityId:'another',topicKeys:['finance']}), undefined,
    'persisted history cannot invent a callback heard in the active session');

  // More than each configured cap retains only the newest deterministic entries.
  delivered(state, { id: 'four', entityId: 'four', name: 'Four', topics: ['four'], refs: ['e5'], seconds: 60 });
  state.finishStory({ momentId: 'four', reason: 'completed', endedAt: at(61) });
  const bounded = state.getSnapshot(at(62));
  assert.ok(bounded.recent.entities.length <= 2);
  assert.ok(bounded.recent.topics.length <= 2);
  assert.ok(bounded.recent.outcomes.length <= 2);
  assert.ok(bounded.usedEvidenceRefs.length <= 3);
  assert.ok(bounded.recent.narrativeSignatures.length <= 2);

  console.log('journeyContext tests passed');
}

run();
