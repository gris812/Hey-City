import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';

async function run(): Promise<void> {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgresql://test/test';
  const pg = new PGlite();
  Pool.prototype.query = (async (sql: string, values?: unknown[]) => {
    if (!values?.length && sql.includes('CREATE TABLE')) {
      await pg.exec(sql);
      return { rows: [] };
    }
    return pg.query(sql, values);
  }) as never;
  try {
    const { initializeDatabase, query } = await import('../src/services/database');
    const { createMobileSession, isMobileSessionActive, renewMobileSession, revokeMobileSession } = await import('../src/services/mobileAuthSession');
    await initializeDatabase();
    await query("INSERT INTO users(id,email) VALUES('user-a','a@example.com')");
    const original = await createMobileSession('user-a', 'a@example.com');
    const access = jwt.decode(original.token) as jwt.JwtPayload;
    assert.equal(access.exp! - access.iat!, 900);
    assert.equal(access.role, 'user');
    assert.equal(await isMobileSessionActive(access.sessionId, 'user-a'), true);
    assert.equal(await isMobileSessionActive(access.sessionId, 'user-b'), false);

    const initial = await query('SELECT current_hash FROM mobile_auth_sessions WHERE id=$1', [access.sessionId]);
    assert.notEqual(initial[0].current_hash, original.refreshToken.split('.')[1]);
    const concurrent = await Promise.all(Array.from({ length: 5 }, () => renewMobileSession(original.refreshToken)));
    const replacement = concurrent[0];
    assert(replacement);
    assert.notEqual(replacement.refreshToken, original.refreshToken);
    assert(concurrent.every(entry => entry?.refreshToken === replacement.refreshToken));
    await query("UPDATE mobile_auth_sessions SET rotated_at=now()-interval '3 minutes' WHERE id=$1", [access.sessionId]);
    assert.equal(await renewMobileSession(original.refreshToken), undefined);
    await revokeMobileSession(original.refreshToken);
    assert.equal(await isMobileSessionActive(access.sessionId, 'user-a'), true);
    const latest = await renewMobileSession(replacement.refreshToken);
    assert(latest);
    await revokeMobileSession(replacement.refreshToken);
    assert.equal(await isMobileSessionActive(access.sessionId, 'user-a'), false);
    assert.equal(await renewMobileSession(latest.refreshToken), undefined);
    assert.equal(await renewMobileSession('invalid'), undefined);

    const idle = await createMobileSession('user-a', 'a@example.com');
    const idleId = idle.refreshToken.split('.')[0];
    await query("UPDATE mobile_auth_sessions SET expires_at=now()-interval '1 day' WHERE id=$1", [idleId]);
    assert.equal(await isMobileSessionActive(idleId, 'user-a'), false);
    assert.equal(await renewMobileSession(idle.refreshToken), undefined);
  } finally {
    await pg.close();
  }
}
run().then(() => console.log('mobile auth session tests passed')).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
