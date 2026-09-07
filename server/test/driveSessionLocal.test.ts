import assert from 'node:assert/strict';
import { createSession, finishActiveStory, pingSession } from '../src/services/driveSession';

async function run(): Promise<void> {
  const session = createSession('gris', {
    themeTags: ['government'],
    narrationStyle: 'documentary',
    lengthSec: 40,
    leadTimeMin: 2,
    voiceId: 'artur',
    language: 'en',
    autoplay: true,
  });

  const first = await pingSession(
    session.id,
    40.7074,
    -74.0104,
    180,
    35,
    10_000
  );

  assert.equal(first.nextAction, 'PLAY');
  assert.equal(first.decision?.type, 'trigger_story');
  assert.ok(first.poi);
  assert.match(first.audioUrl ?? '', /^https:\/\/example\.com\/tts\/artur\//);
  assert.ok(first.narrativePlan);
  assert.ok(first.transcriptText);
  assert.ok(first.estimatedDurationSec);
  assert.ok(first.estimatedDurationSec >= 30);
  assert.ok(first.estimatedDurationSec <= 45);

  const second = await pingSession(
    session.id,
    40.7073,
    -74.0105,
    92,
    35,
    20_000
  );

  assert.equal(second.nextAction, 'NONE');
  assert.equal(second.decision?.type, 'hold');
  assert.equal(second.decision?.reason, 'already_listening');

  const finished = finishActiveStory(session.id, 'skipped');
  assert.equal(finished?.ok, true);
  assert.equal(finished?.activeStoryWasPlaying, true);
  assert.equal(finished?.reason, 'skipped');

  const third = await pingSession(
    session.id,
    40.7073,
    -74.0105,
    92,
    35,
    30_000
  );

  assert.equal(third.nextAction, 'NONE');
  assert.equal(third.decision?.type, 'hold');
  assert.equal(third.decision?.reason, 'cooldown_active');

  const walking = createSession('walker', {
    mode: 'walking',
    themeTags: ['government'],
    narrationStyle: 'documentary',
    lengthSec: 90,
    leadTimeMin: 2,
    voiceId: 'dana',
    language: 'ru',
    autoplay: true,
  });
  const walkingResult = await pingSession(
    walking.id,
    40.7074,
    -74.0104,
    null,
    4.5,
    40_000
  );
  assert.equal(walkingResult.nextAction, 'PLAY');
  assert.equal(walkingResult.decision?.type, 'trigger_story');
  assert.equal(walkingResult.decision?.type === 'trigger_story' && walkingResult.decision.mode, 'walking');
  assert.equal(walkingResult.narrativePlan?.safety.vehicleSafe, false);
  assert.match(walkingResult.audioUrl ?? '', /^https:\/\/example\.com\/tts\/dana\//);

  console.log('driveSessionLocal tests passed');
}

void run();
