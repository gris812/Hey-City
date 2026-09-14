import type { Request, Response, NextFunction } from 'express';
import { Readable } from 'node:stream';
import { pendingSpeechAudio } from '../services/narration';

/** GETs can only subscribe to authenticated work already started by the story API.
 * Unknown media paths never initiate a provider request. Completed files fall through
 * to express.static (including native Range support and persistent-cache replay).
 */
export function progressiveSpeech(req: Request, res: Response, next: NextFunction): void {
  const filename = req.path.slice(1);
  if (!/^[a-f0-9]{24}\.mp3$/.test(filename)) { next(); return; }
  const audio = pendingSpeechAudio(filename);
  if (!audio || (req.method !== 'GET' && req.method !== 'HEAD')) { next(); return; }
  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Accel-Buffering', 'no');
  // Length is unknown during generation. A server may ignore Range and return 200.
  res.setHeader('Accept-Ranges', 'none');
  if (req.method === 'HEAD') { res.end(); return; }
  const controller = new AbortController();
  const stream = Readable.from(audio.read(controller.signal));
  res.once('close', () => { controller.abort(); stream.destroy(); });
  stream.once('error', () => {
    if (!res.headersSent) res.status(502).end(); else res.destroy();
  });
  stream.pipe(res);
}
