import assert from 'node:assert/strict';
import type { NarrativePlan } from '@heycity/shared';
import { createApp } from '../src/app';
import { createSession, stopSession } from '../src/services/driveSession';
import type { EvidenceBundle } from '../src/services/evidence';

process.env.AUTH_DISABLED = 'true';

const evidence: EvidenceBundle = {
  subjectId: 'federal-hall', subjectName: 'Federal Hall', category: 'historical_landmark', sourceVersion: 'route-test',
  items: [{ id: 'civic-fact', claim: 'Federal Hall hosted the first United States Congress.', sourceType: 'test', confidence: 1 }],
};
const plan = {
  moment: { relationship: 'new_topic', intent: 'explain', delivery: 'brief_story' },
  narrativeAngle: 'civic importance', evidenceRefs: ['civic-fact'],
} as Pick<NarrativePlan, 'moment' | 'narrativeAngle' | 'evidenceRefs'>;

function activate(session: ReturnType<typeof createSession>, momentId: string): void {
  session.journeyState.startStory({ momentId, entityId: evidence.subjectId, entityName: evidence.subjectName,
    category: evidence.category, level: 'auto', guideId: 'dana' });
  session.journeyState.recordNarration({ momentId, evidenceRefs: plan.evidenceRefs, topicKeys: ['civic_history'] });
  session.conversationRuntime.activateStory({ momentId, subjectId: evidence.subjectId, subjectName: evidence.subjectName,
    level: 'auto', plan, evidence, guideId: 'dana', language: 'en' });
  session.alreadyListening = true;
}

async function run(): Promise<void> {
  const session = createSession('gris', { mode: 'vehicle', themeTags: ['history'], narrationStyle: 'conversational',
    lengthSec: 30, leadTimeMin: 2, voiceId: 'dana', language: 'en', autoplay: true });
  const app = createApp();
  const listener = app.listen(0);
  try {
    const port = (listener.address() as { port: number }).port;
    const post = async (path: string, body: object) => {
      const response = await fetch(`http://127.0.0.1:${port}${path}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() as Record<string, unknown> };
    };

    activate(session, 'route-moment-1');
    const interrupted = await post(`/sessions/${session.id}/conversation/interrupt`, { momentId: 'route-moment-1', listenedSeconds: 4 });
    assert.equal(interrupted.status, 200);
    assert.equal(session.journeyState.getSnapshot().recent.outcomes.length, 0, 'interrupt endpoint cannot finish a story');

    const followUp = await post(`/sessions/${session.id}/conversation/turn`, { text: 'Why is that important?' });
    assert.equal(followUp.status, 200);
    assert.equal(followUp.body.intent, 'ask_about_current_story');
    assert.deepEqual(followUp.body.resume, { action: 'resume_existing', momentId: 'route-moment-1' });
    const resumed = await post(`/sessions/${session.id}/conversation/resume`, { momentId: 'route-moment-1' });
    assert.equal(resumed.status, 200);
    assert.deepEqual(resumed.body.resume, { action: 'resume_existing', momentId: 'route-moment-1' });
    assert.equal(session.journeyState.getActiveMoment()?.momentId, 'route-moment-1');

    assert.equal((await post(`/sessions/${session.id}/conversation/interrupt`, { momentId: 'obsolete' })).status, 409);
    await post(`/sessions/${session.id}/conversation/interrupt`, { momentId: 'route-moment-1', listenedSeconds: 9 });
    const stopped = await post(`/sessions/${session.id}/conversation/turn`, { text: 'Stop the story.' });
    assert.equal(stopped.body.intent, 'stop_story');
    assert.deepEqual(stopped.body.resume, { action: 'abandon_previous', momentId: 'route-moment-1' });
    const outcome = session.journeyState.getSnapshot().recent.outcomes.at(-1);
    assert.equal(outcome?.reason, 'skipped');
    assert.equal(session.journeyState.getSnapshot().recent.entities.length, 0, 'stop cannot create heard evidence or callback eligibility');
  } finally {
    stopSession(session.id);
    await new Promise<void>((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
  }
  console.log('conversation route tests passed');
}

void run().catch(error => { console.error(error); process.exitCode = 1; });
