import assert from 'node:assert/strict';
import {
  GuideVoicePreviewController,
  type VoicePreviewDeps,
  type VoicePreviewSound,
} from '../src/features/guides/guideVoicePreviewController';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

async function tick() {
  await Promise.resolve();
  await Promise.resolve();
}

async function run(): Promise<void> {
  const requestCalls: Array<{ guide: string; lang: string; guestId?: string }> = [];
  const stopCalls: string[] = [];
  const unloadCalls: string[] = [];
  const requests: Array<ReturnType<typeof deferred<{ audioUrl: string }>>> = [];
  let failNextProbe = false;

  const makeSound = (id: string): VoicePreviewSound => ({
    async stop() { stopCalls.push(id); },
    async unload() { unloadCalls.push(id); },
  });

  const deps: VoicePreviewDeps = {
    requestSample: async (guide, lang, guestId) => {
      requestCalls.push({ guide, lang, guestId });
      const d = deferred<{ audioUrl: string }>();
      requests.push(d);
      return d.promise;
    },
    resolveUrl: (url) => `resolved:${url}`,
    probe: async () => {
      if (failNextProbe) {
        failNextProbe = false;
        throw new Error('probe failed');
      }
    },
    configureAudio: async () => {},
    createSound: async (url) => makeSound(url),
  };

  const controller = new GuideVoicePreviewController(
    { language: 'en', guestId: 'guest_test_abcdefg' },
    deps,
  );

  // Play survives a parent rerender / context refresh.
  const playDana = controller.play('dana');
  await tick();
  assert.equal(controller.getSnapshot().state, 'loading');
  controller.updateContext({ language: 'en', guestId: 'guest_test_abcdefg' });
  assert.equal(controller.getSnapshot().state, 'loading', 'parent rerender must not cancel pending playback');
  requests[0].resolve({ audioUrl: '/media/dana-en.mp3' });
  await playDana;
  assert.equal(controller.getSnapshot().state, 'playing');
  assert.equal(controller.getSnapshot().activeGuideId, 'dana');

  // Explicit close/stop unloads audio and returns to idle.
  await controller.stop();
  assert.equal(controller.getSnapshot().state, 'idle');
  assert.ok(stopCalls.some((x) => x.includes('dana-en.mp3')));
  assert.ok(unloadCalls.some((x) => x.includes('dana-en.mp3')));

  // Guide switch cancels the previous playback but does not start a new one by itself.
  const playDana2 = controller.play('dana');
  await tick();
  requests[1].resolve({ audioUrl: '/media/dana2.mp3' });
  await playDana2;
  assert.equal(controller.getSnapshot().state, 'playing');
  await controller.switchGuide('arthur');
  assert.equal(controller.getSnapshot().state, 'idle');

  // Retry keeps the guide that failed, and uses the latest language.
  failNextProbe = true;
  const playArthur = controller.play('arthur');
  await tick();
  requests[2].resolve({ audioUrl: '/media/arthur-en.mp3' });
  await playArthur;
  assert.equal(controller.getSnapshot().state, 'error');
  assert.equal(controller.getSnapshot().activeGuideId, 'arthur');
  controller.updateContext({ language: 'ru', guestId: 'guest_test_abcdefg' });
  const retryArthur = controller.retry();
  await tick();
  assert.deepEqual(requestCalls.at(-1), { guide: 'arthur', lang: 'ru', guestId: 'guest_test_abcdefg' });
  requests[3].resolve({ audioUrl: '/media/arthur-ru.mp3' });
  await retryArthur;
  assert.equal(controller.getSnapshot().state, 'playing');
  assert.equal(controller.getSnapshot().activeGuideId, 'arthur');

  // A late response from an earlier generation cannot overwrite the newer play.
  await controller.stop();
  const lateDana = controller.play('dana');
  await tick();
  const lateRequest = requests[4];
  const newArthur = controller.play('arthur');
  await tick();
  const currentRequest = requests[5];
  lateRequest.resolve({ audioUrl: '/media/late-dana.mp3' });
  await tick();
  assert.equal(controller.getSnapshot().state, 'loading');
  assert.equal(controller.getSnapshot().activeGuideId, 'arthur');
  currentRequest.resolve({ audioUrl: '/media/current-arthur.mp3' });
  await Promise.all([lateDana, newArthur]);
  assert.equal(controller.getSnapshot().state, 'playing');
  assert.equal(controller.getSnapshot().activeGuideId, 'arthur');

  await controller.dispose();
  assert.ok(unloadCalls.some((x) => x.includes('current-arthur.mp3')));

  console.log('guide voice preview behavioral lifecycle tests passed');
}

void run();
