import { selectStory, selectedStoryAvailability, StorySelectionError } from '../services/selectedStory';
import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import type { AuthRequest } from '../middleware/auth';
import { getGuide } from '../services/guides';
import { getSession } from '../services/driveSession';
import {
  canonicalStoryEnd,
  canonicalSessionContext,
  canonicalSessionEnd,
  getPoiCandidates,
  startSession,
} from '../controllers/drive';
import { generateNarration, generateVoiceSample } from '../controllers/narration';
import {
  conversationCancelHandler,
  conversationInterruptHandler,
  conversationResumeHandler,
  conversationTurnHandler,
} from '../controllers/conversation';
import {
  realtimeVoiceBargeInHandler,
  realtimeVoiceCloseHandler,
  realtimeVoiceConnectHandler,
  realtimeVoiceFallbackHandler,
  realtimeVoiceTurnHandler,
  realtimeVoiceUsageHandler,
} from '../controllers/realtimeVoice';

export const sessionsRouter = Router();
sessionsRouter.use(requireAuth);
sessionsRouter.post('/start', startSession);
sessionsRouter.get('/:sessionId/objects/:poiId/availability', async (req: AuthRequest, res, next) => {
  try { res.json(await selectedStoryAvailability(req.params.sessionId, req.user!.userId, req.params.poiId)); }
  catch (error) {
    if (error instanceof StorySelectionError) { res.status(error.status).json({ error: error.message }); return; }
    next(error);
  }
});
sessionsRouter.post('/:sessionId/select', async (req: AuthRequest, res, next) => {
  try { res.json(await selectStory(req.params.sessionId,req.user!.userId,String(req.body.poiId),req.body.level ?? 'short',req.body.language)); }
  catch (error) {
    if (error instanceof StorySelectionError) {res.status(error.status).json({error:error.message});return;}
    if (error instanceof Error && error.name === 'AbortError') {res.status(409).json({error:'Selection superseded'});return;}
    res.status(503).json({error:req.body.language === 'en' ? 'Story is temporarily unavailable. Try again.' : 'Рассказ временно недоступен. Попробуйте ещё раз.'});
  }
});
sessionsRouter.put('/:sessionId/guide', async (req: AuthRequest, res, next) => {
  try {
    const session = getSession(req.params.sessionId);
    if (!session || session.userId !== req.user?.userId) { res.status(404).json({ error: 'Session not found' }); return; }
    const guide = await getGuide(String(req.body.guideId));
    if (!guide?.active) { res.status(400).json({ error: 'Guide is unavailable' }); return; }
    const nextLanguage = req.body.language === 'ru' || req.body.language === 'en' ? req.body.language : session.params.language;
    if (session.realtimeVoiceSession && (guide.id !== session.params.voiceId || nextLanguage !== session.params.language)) {
      await session.realtimeVoiceSession.close(guide.id !== session.params.voiceId ? 'guide_changed' : 'language_changed');
    }
    session.storyRequest?.abort();
    session.conversationRuntime.abandonForContextChange();
    session.storyContinuation = undefined;
    session.alreadyListening = false;
    session.params.voiceId = guide.id;
    if (req.body.language === 'ru' || req.body.language === 'en') {
      session.storyRequest?.abort();session.params.language=req.body.language;session.alreadyListening=false;
    }
    res.json({ ok: true });
  } catch (error) { next(error); }
});
sessionsRouter.post('/:sessionId/context', canonicalSessionContext);
sessionsRouter.post('/:sessionId/conversation/interrupt', conversationInterruptHandler);
sessionsRouter.post('/:sessionId/conversation/turn', conversationTurnHandler);
sessionsRouter.post('/:sessionId/conversation/resume', conversationResumeHandler);
sessionsRouter.post('/:sessionId/conversation/cancel', conversationCancelHandler);
sessionsRouter.post('/:sessionId/realtime-voice/connect', realtimeVoiceConnectHandler);
sessionsRouter.post('/:sessionId/realtime-voice/turn', realtimeVoiceTurnHandler);
sessionsRouter.post('/:sessionId/realtime-voice/barge-in', realtimeVoiceBargeInHandler);
sessionsRouter.post('/:sessionId/realtime-voice/close', realtimeVoiceCloseHandler);
sessionsRouter.post('/:sessionId/realtime-voice/fallback', realtimeVoiceFallbackHandler);
sessionsRouter.post('/:sessionId/realtime-voice/usage', realtimeVoiceUsageHandler);
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
