import assert from 'node:assert/strict';
import type { NarrativePlan } from '@heycity/shared';
import { createSession, stopSession } from '../src/services/driveSession';
import { ConversationRuntime } from '../src/services/conversationRuntime';
import { createJourneyState } from '../src/services/journeyContext';
import type { EvidenceBundle } from '../src/services/evidence';

const evidence: EvidenceBundle = {
  subjectId: 'federal-hall', subjectName: 'Federal Hall', category: 'historical_landmark', sourceVersion: 'test',
  items: [{ id: 'evidence-federal-hall', claim: 'Federal Hall served as the first United States Congress.', sourceType: 'test', confidence: 1 }],
};

const plan = {
  moment: { relationship: 'new_topic', intent: 'explain', delivery: 'brief_story' },
  narrativeAngle: 'civic history',
  evidenceRefs: ['evidence-federal-hall'],
} as Pick<NarrativePlan, 'moment' | 'narrativeAngle' | 'evidenceRefs'>;

function beginStory(runtime: ConversationRuntime, journey = createJourneyState('conversation-test')) {
  const momentId = 'moment-federal-hall';
  journey.startStory({ momentId, entityId: evidence.subjectId, entityName: evidence.subjectName,
    category: evidence.category, level: 'auto', guideId: 'dana' });
  journey.recordNarration({ momentId, evidenceRefs: plan.evidenceRefs, topicKeys: ['civic_history'] });
  runtime.activateStory({ momentId, subjectId: evidence.subjectId, subjectName: evidence.subjectName,
    level: 'auto', plan, evidence, guideId: 'dana', language: 'en' });
  return momentId;
}

async function run(): Promise<void> {
  // T1: exactly one runtime is constructed with every active DriveSession.
  const session = createSession('conversation-runtime-user', {
    mode: 'vehicle', themeTags: ['history'], narrationStyle: 'conversational', lengthSec: 30,
    leadTimeMin: 2, voiceId: 'dana', language: 'en', autoplay: true,
  });
  try {
    assert.equal(session.conversationRuntime.getSnapshot().state, 'idle');
    assert.strictEqual(session.conversationRuntime, session.conversationRuntime, 'session owns one stable runtime instance');
  } finally { stopSession(session.id); }

  // T2: a valid interruption suspends the original moment without completion.
  const journey = createJourneyState('conversation-lifecycle');
  const runtime = new ConversationRuntime(journey);
  const momentId = beginStory(runtime, journey);
  assert.equal(runtime.interrupt({ momentId, listenedSeconds: 7 }), true);
  assert.equal(runtime.getSnapshot().state, 'listening');
  assert.equal(runtime.getSnapshot().suspendedStory?.momentId, momentId);
  assert.equal(journey.getSnapshot().recent.outcomes.some(outcome => outcome.reason === 'completed'), false);
  assert.equal(runtime.blocksNarration(), true, 'conversation gates automatic narration without changing Discovery ranking');

  // T3: an obsolete audio callback cannot suspend or mutate the active story.
  assert.equal(runtime.interrupt({ momentId: 'old-moment', listenedSeconds: 99 }), false);
  assert.equal(runtime.getSnapshot().suspendedStory?.momentId, momentId);
  assert.equal(journey.getActiveMoment()?.momentId, momentId);

  // T4: resume names the same moment so the client can resume its original audio position.
  const resumed = runtime.resume('ask_about_current_story');
  assert.deepEqual(resumed, { action: 'resume_existing', momentId });
  assert.equal(journey.getActiveMoment()?.momentId, momentId);
  assert.equal(runtime.getSnapshot().state, 'narrating');
  assert.equal(journey.getSnapshot().recent.outcomes.length, 0, 'resume does not create or finish a second moment');

  // T5: explicit stop finalizes conservatively, never as completed or a callback source.
  assert.equal(runtime.interrupt({ momentId, listenedSeconds: 9 }), true);
  const abandoned = runtime.resume('stop_story');
  assert.deepEqual(abandoned, { action: 'abandon_previous', momentId });
  const outcome = journey.getSnapshot().recent.outcomes.at(-1);
  assert.equal(outcome?.momentId, momentId);
  assert.equal(outcome?.reason, 'skipped');
  assert.notEqual(outcome?.reason, 'completed');
  assert.equal(journey.getSnapshot().recent.entities.length, 0,
    'abandonment does not mark the complete evidence set as heard');
  assert.equal(journey.selectCallback({ entityId: 'new-target', topicKeys: ['civic_history'] }), undefined,
    'partially heard, abandoned narration cannot become a callback source');
  assert.equal(runtime.getSnapshot().state, 'idle');

  // A late turn cannot reassert itself after a newer turn supersedes it.
  const raceJourney = createJourneyState('conversation-race');
  const raceRuntime = new ConversationRuntime(raceJourney);
  beginStory(raceRuntime, raceJourney);
  const first = raceRuntime.beginTurn();
  const second = raceRuntime.beginTurn();
  assert.equal(raceRuntime.setTurnState(first.turnId, 'responding'), false);
  assert.equal(raceRuntime.setTurnState(second.turnId, 'responding', { intent: 'ask_about_current_story' }), true);
  assert.equal(raceRuntime.getSnapshot().activeTurnId, second.turnId);

  console.log('conversation runtime lifecycle tests passed');
}

void run().catch(error => { console.error(error); process.exitCode = 1; });
