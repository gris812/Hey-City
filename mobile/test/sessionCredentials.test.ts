import assert from 'node:assert/strict';
import { SessionCredentials, type Credentials } from '../src/api/sessionCredentials';

async function run() {
  let stored: string | null = 'legacy-token';
  const storage = {
    read: async () => stored,
    write: async (value: string | null) => { stored = value; },
  };
  const session = new SessionCredentials(storage);
  assert.deepEqual((await session.read()).credentials, { token: 'legacy-token' });
  const pair = { token: 'first', refreshToken: 'first-refresh' };
  await session.replace(pair);
  const reopened = new SessionCredentials(storage);
  const original = await reopened.read();
  assert.deepEqual(original.credentials, pair);

  let invalidations = 0;
  const invalidate = () => { invalidations += 1; };
  await assert.rejects(reopened.recover(original, async () => { throw new Error('offline'); }, invalidate), /offline/);
  assert.equal(await reopened.read(), original);
  assert.equal(invalidations, 0);

  let renewals = 0;
  const renewed = { token: 'second', refreshToken: 'second-refresh' };
  const renew = async (value: string) => {
    assert.equal(value, pair.refreshToken);
    renewals += 1;
    return renewed;
  };
  assert.deepEqual(
    (await Promise.all(Array.from({ length: 8 }, () => reopened.recover(original, renew, invalidate))))
      .map(state => state?.credentials),
    Array(8).fill(renewed),
  );
  assert.equal(renewals, 1);
  assert.deepEqual((await new SessionCredentials(storage).read()).credentials, renewed);
  assert.deepEqual((await reopened.recover(original, renew, invalidate))?.credentials, renewed);
  assert.equal(renewals, 1);

  const expired = await reopened.read();
  let release!: (credentials: Credentials | null) => void;
  let started!: () => void;
  const start = new Promise<void>(resolve => { started = resolve; });
  const lateRefresh = reopened.recover(expired, () => new Promise(resolve => {
    release = resolve;
    started();
  }), invalidate);
  await start;
  assert.deepEqual((await reopened.replace(null)).credentials, renewed);
  assert.equal((await new SessionCredentials(storage).read()).credentials, null);
  await reopened.replace(pair);
  release(null);
  assert.equal(await lateRefresh, undefined);
  assert.equal(invalidations, 0);
  assert.deepEqual((await reopened.read()).credentials, pair);

  assert.equal(await reopened.recover(await reopened.read(), async () => null, invalidate), undefined);
  assert.equal((await reopened.read()).credentials, null);
  assert.equal(invalidations, 1);
  assert.equal(await reopened.recover(expired, renew, invalidate), undefined);
}

run().then(() => console.log('session credentials tests passed')).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
