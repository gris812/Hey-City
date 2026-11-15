import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { jwt as jwtConfig } from '../config';
import { query } from './database';
import type { JwtPayload } from '../middleware/auth';

const accessLifetimeSeconds = 15 * 60;
const idleLifetimeDays = 30;
const replayGraceSeconds = 120;

function digestRefresh(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
function nextRefresh(value: string): string {
  return createHmac('sha256', jwtConfig.secret).update('hey-city-mobile-refresh-v1:').update(value).digest('base64url');
}
const sessionIdPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;

function parse(value: unknown) {
  if (typeof value !== 'string' || !/^[a-f0-9-]{36}\.[\w-]{43}$/.test(value)) return undefined;
  const [id, secret] = value.split('.');
  if (!sessionIdPattern.test(id)) return undefined;
  return { id, secret };
}
function credentials(id: string, secret: string, userId: string, email: string) {
  const payload: JwtPayload = { userId, email, role: 'user', sessionId: id };
  return { token: jwt.sign(payload, jwtConfig.secret, { expiresIn: accessLifetimeSeconds }), refreshToken: `${id}.${secret}` };
}
export async function createMobileSession(userId: string, email: string) {
  const id = randomUUID();
  const secret = randomBytes(32).toString('base64url');
  await query('DELETE FROM mobile_auth_sessions WHERE user_id = $1 AND expires_at <= now()', [userId]);
  await query(`INSERT INTO mobile_auth_sessions (id,user_id,email,current_hash,expires_at)
    VALUES ($1,$2,$3,$4,now() + $5 * interval '1 day')`, [id,userId,email,digestRefresh(secret),idleLifetimeDays]);
  return credentials(id, secret, userId, email);
}
export async function renewMobileSession(value: unknown) {
  const token = parse(value);
  if (!token) return undefined;
  // Repeated delivery shortly after a rotation must return the same token.
  const successor = nextRefresh(token.secret);
  const [row] = await query<{ user_id: string; email: string }>(`
    UPDATE mobile_auth_sessions SET
      previous_hash = CASE WHEN current_hash = $2 THEN current_hash ELSE previous_hash END,
      rotated_at = CASE WHEN current_hash = $2 THEN now() ELSE rotated_at END,
      expires_at = CASE WHEN current_hash = $2 THEN now() + $4 * interval '1 day' ELSE expires_at END,
      current_hash = $3
    WHERE id = $1 AND expires_at > now() AND
      (current_hash = $2 OR (previous_hash = $2 AND current_hash = $3 AND rotated_at > now() - $5 * interval '1 second'))
    RETURNING user_id,email`, [token.id,digestRefresh(token.secret),digestRefresh(successor),idleLifetimeDays,replayGraceSeconds]);
  return row && credentials(token.id, successor, row.user_id, row.email);
}
export async function revokeMobileSession(value: unknown) {
  const token = parse(value);
  if (!token) return;
  await query(`DELETE FROM mobile_auth_sessions WHERE id=$1 AND
    (current_hash=$2 OR (previous_hash=$2 AND rotated_at > now() - $3 * interval '1 second'))`,
    [token.id,digestRefresh(token.secret),replayGraceSeconds]);
}
export async function isMobileSessionActive(id: string, userId: string): Promise<boolean> {
  if (!sessionIdPattern.test(id)) return false;
  return (await query('SELECT 1 FROM mobile_auth_sessions WHERE id=$1 AND user_id=$2 AND expires_at>now()', [id,userId])).length === 1;
}
