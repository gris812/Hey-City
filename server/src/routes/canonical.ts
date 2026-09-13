import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import type { AuthRequest } from '../middleware/auth';
import { getGuide } from '../services/guides';
import { getSession } from '../services/driveSession';
import { sessionDiscoveryCandidate } from '../services/aheadDiscovery';
import { discoveryStorySeed } from '../services/discoveryKnowledge';
import { createNarrativePlan } from '../services/narrativePlan';
import { generateNarrationFromPlan } from '../services/narration';
import {
  canonicalStoryEnd,
  canonicalSessionContext,
  canonicalSessionEnd,
  getPoiCandidates,
  startSession,
} from '../controllers/drive';
import { generateNarration, generateVoiceSample } from '../controllers/narration';

export const sessionsRouter = Router();
sessionsRouter.use(requireAuth);
sessionsRouter.post('/start', startSession);
const manualStories = new Set<string>();
sessionsRouter.post('/:sessionId/select', async (req: AuthRequest, res, next) => {
  const id = req.params.sessionId;
  const session = getSession(id);
  if (!session || session.userId !== req.user?.userId) { res.status(404).json({ error: 'Session not found' }); return; }
  const candidate = sessionDiscoveryCandidate(id, String(req.body.poiId));
  if (!candidate) { res.status(404).json({ error: 'Object is no longer available' }); return; }
  if (manualStories.has(id)) { res.status(409).json({ error: 'Story is being prepared' }); return; }
  manualStories.add(id);
  session.alreadyListening = true;
  try {
    const seed = await discoveryStorySeed(candidate);
    if (!seed) { session.alreadyListening = false; res.status(422).json({ error: 'Недостаточно проверенной информации об этом объекте.' }); return; }
    const plan = createNarrativePlan({ poiId: candidate.providerId, placeName: candidate.name, storySeed: seed,
      mode: session.params.mode ?? 'walking', guideId: session.params.voiceId, themeTags: session.params.themeTags, targetDurationSec: session.params.lengthSec });
    const result = await generateNarrationFromPlan(plan, { language: session.params.language, narrationStyle: session.params.narrationStyle, userId: session.userId });
    session.alreadyListening = !!result.audioUrl;
    session.lastStoryStartedAt = Date.now();
    (session.spokenProviderIds ??= new Set()).add(candidate.providerId);
    res.json({ ...result, name: candidate.name });
  } catch (error) { session.alreadyListening = false; next(error); }
  finally { manualStories.delete(id); }
});
sessionsRouter.put('/:sessionId/guide', async (req: AuthRequest, res, next) => {
  try {
    const session = getSession(req.params.sessionId);
    if (!session || session.userId !== req.user?.userId) { res.status(404).json({ error: 'Session not found' }); return; }
    const guide = await getGuide(String(req.body.guideId));
    if (!guide?.active) { res.status(400).json({ error: 'Guide is unavailable' }); return; }
    session.params.voiceId = guide.id;
    res.json({ ok: true });
  } catch (error) { next(error); }
});
sessionsRouter.post('/:sessionId/context', canonicalSessionContext);
sessionsRouter.post('/:sessionId/story/end', canonicalStoryEnd);
sessionsRouter.post('/:sessionId/end', canonicalSessionEnd);

export const discoveryRouter = Router();
discoveryRouter.use(requireAuth);
discoveryRouter.post('/active-poi', getPoiCandidates);

export const storiesRouter = Router();
storiesRouter.use(requireAuth);
storiesRouter.post('/generate', generateNarration);
storiesRouter.post('/voice-sample', generateVoiceSample);

export const poisRouter = Router();
poisRouter.use(requireAuth);
poisRouter.get('/nearby', (req, res, next) => {
  req.body = {
    lat: Number(req.query.lat),
    lng: Number(req.query.lng),
    heading: Number(req.query.heading ?? 0),
    speed: Number(req.query.speed ?? 40),
    themeTags:
      typeof req.query.theme === 'string' && req.query.theme.length > 0
        ? [req.query.theme]
        : ['mixed'],
  };
  void getPoiCandidates(req, res).catch(next);
});
