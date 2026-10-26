import { getSession, recordSessionStoryStarted, recordSessionSuperseded } from './driveSession';
import { sessionDiscoveryCandidate } from './aheadDiscovery';
import { discoveryEvidence } from './discoveryKnowledge';
import { prepareNarrative } from './narrativePlan';
import { EvidenceBundle, publicAttribution, specificCallbackTopics, storyAvailability } from './evidence';
import { canonicalGuideId } from './guidePolicy';
import { isCircuitOpen } from './budget';
import type { SelectedStoryResult, StoryAvailability } from '@heycity/shared';
import { generateIdentification, generateNarrationFromPlan } from './narration';
import { narration, driveDiscovery } from '../config';

let selectedMomentSequence = 0;

export class StorySelectionError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const categories: Record<string, [string,string]> = {city:['город','city'],museum:['музей','museum'],park:['парк','park'],national_park:['национальный парк','national park'],historical_landmark:['историческое место','historic landmark'],cultural_landmark:['достопримечательность','landmark'],monument:['памятник','monument'],university:['университет','university'],region:['регион','region']};

/** Latest explicit choice supersedes previous work; discovery never waits for this pipeline. */
export function selectStory(id: string, userId: string, poiId: string, level: string, language?: string, clientRequestId?: string): Promise<SelectedStoryResult> {
  const session = getSession(id);
  if (!session || session.userId !== userId) return Promise.reject(new StorySelectionError(404, 'Session not found'));
  if (!clientRequestId) return prepareSelectedStory(id, userId, poiId, level, language, clientRequestId);
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(clientRequestId)) return Promise.reject(new StorySelectionError(400, 'Invalid request identity'));
  const key = JSON.stringify([poiId, level, language ?? session.params.language, session.params.voiceId]);
  const requests = session.selectionRequests ??= new Map();
  const existing = requests.get(clientRequestId);
  if (existing) return existing.key === key ? existing.result : Promise.reject(new StorySelectionError(409, 'Request identity already used'));
  const result = prepareSelectedStory(id, userId, poiId, level, language, clientRequestId);
  requests.set(clientRequestId, { key, result });
  if (requests.size > 32) requests.delete(requests.keys().next().value!);
  return result;
}

async function prepareSelectedStory(id: string, userId: string, poiId: string, level: string, language?: string, clientRequestId?: string): Promise<SelectedStoryResult> {
  const session = getSession(id);
  if (!session || session.userId !== userId) throw new StorySelectionError(404,'Session not found');
  const candidate = sessionDiscoveryCandidate(id,poiId);
  if (!candidate) throw new StorySelectionError(404,'Object is no longer available');
  if (!['identify','short','long'].includes(level)) throw new StorySelectionError(400,'Invalid story level');
  if (language !== undefined && !['ru','en'].includes(language)) throw new StorySelectionError(400,'Invalid language');
  if (isCircuitOpen(userId)) throw new StorySelectionError(429, 'Story budget temporarily unavailable');
  session.selectionRevision = (session.selectionRevision ?? 0) + 1;
  // A new explicit choice invalidates any unfinished delivered moment before work begins.
  // A superseded short segment was never confirmed as heard, so it cannot feed M1 continuation.
  const activeMoment = session.journeyState?.getActiveMoment();
  if (activeMoment?.level === 'short' && session.storyContinuation?.poiId === activeMoment.entityId) session.storyContinuation = undefined;
  // Requests which have not generated narration never receive a moment record.
  session.conversationRuntime.storyFinished(activeMoment?.momentId);
  session.journeyState?.markSuperseded();
  session.storyRequest?.abort();
  const request = new AbortController(); session.storyRequest = request;
  session.selectedRequestId = clientRequestId;
  const momentId = `selected:${poiId}:${Date.now()}:${++selectedMomentSequence}`;
  const params = {...session.params, language: language ?? session.params.language};
  session.params.language = params.language;
  const prior = session.storyContinuation;
  if (prior && (prior.poiId !== poiId || prior.guideId !== canonicalGuideId(params.voiceId) || prior.language !== params.language)) session.storyContinuation = undefined;
  session.alreadyListening = true;
  let succeeded = false;
  const check = () => { request.signal.throwIfAborted(); if (getSession(id) !== session) throw new StorySelectionError(404,'Session not found'); };
  try {
    if (activeMoment) await recordSessionSuperseded(session, activeMoment.entityId);
    check();
    let result;
    let evidence: EvidenceBundle | null = null;
    let availability: StoryAvailability = { short: false, long: false };
    let planned: ReturnType<typeof prepareNarrative> | undefined;
    if (level === 'identify') {
      const category = (categories[candidate.targetType] ?? ['место','place'])[params.language === 'ru' ? 0 : 1];
      const text = params.language === 'ru' ? `${candidate.name} — ${category}.` : `${candidate.name}, a ${category}.`;
      result = await generateIdentification(text,params.voiceId,params.language,userId);
      // Availability is resolved separately so identifying a place never waits for knowledge lookup.
    } else {
      evidence = await discoveryEvidence(candidate); check();
      if (evidence) availability = storyAvailability(evidence, matchingContinuationGuide(session.storyContinuation, poiId, params.voiceId, params.language));
      if (!evidence || !(level === 'long' ? availability.long : availability.short)) throw new StorySelectionError(422, params.language === 'ru' ? 'Недостаточно проверенной информации об этом объекте.' : 'Not enough verified information about this place.');
      const duration = level === 'long' ? narration.detailedSeconds : narration.briefSeconds;
      const journey = session.journeyState;
      const topicKeys = [...params.themeTags, evidence.category, ...specificCallbackTopics(evidence)];
      // Callbacks are validated only against previously completed moments.
      journey?.selectCallback({ entityId: poiId, topicKeys });
      planned = prepareNarrative({poiId,placeName:candidate.name,mode:params.mode ?? 'walking',guideId:params.voiceId,themeTags:params.themeTags,targetDurationSec:duration}, evidence,
        { level: level as 'short' | 'long', language: params.language, continuation: session.storyContinuation, journey: journey?.getSnapshot() });
      planned.plan.selectionContext = { distanceMeters: candidate.distanceMeters, isAhead: candidate.isAhead };
      if (candidate.distanceMeters > driveDiscovery.fallbackDistanceM) {
        const forbidden = [...planned.plan.mustAvoid,
          'right (?:here|in front of (?:us|you))|прямо (?:перед (?:нами|вами)|здесь)|мы (?:стоим|находимся) (?:у|около)'];
        planned.plan.mustAvoid = forbidden;
        planned.brief.constraints.forbiddenPatterns = forbidden;
      }
      result = await generateNarrationFromPlan(planned.plan,{brief:planned.brief,policy:planned.policy,language:params.language,narrationStyle:params.narrationStyle,userId,signal:request.signal});
    }
    check();
    if (level === 'short') {
      session.storyContinuation = { poiId, guideId: canonicalGuideId(params.voiceId), language: params.language, previousLevel: 'short', previousTranscript: result.transcriptText };
      if (evidence) availability = storyAvailability(evidence, session.storyContinuation.guideId);
    }
    // Generation succeeding starts an active factual moment; completion remains the finish endpoint's responsibility.
    // Identification is an orientation utterance, without evidence or callback memory.
    if (level !== 'identify') {
      const topicKeys = [...params.themeTags, evidence?.category ?? candidate.targetType, ...(evidence ? specificCallbackTopics(evidence) : [])];
      const selectedEvidenceRefs = planned?.brief.selectedEvidenceRefs ?? [];
      session.journeyState?.startStory({
        momentId, entityId: poiId, entityName: candidate.name, category: evidence?.category ?? candidate.targetType,
        level: level as 'short' | 'long', guideId: canonicalGuideId(params.voiceId), callbackId: planned?.brief.journey?.callback?.id,
      });
      session.journeyState?.recordNarration({
        momentId, evidenceRefs: selectedEvidenceRefs, topicKeys,
        narrativeSignature: planned ? `${planned.policy.id}:${planned.plan.moment.relationship}:${planned.plan.moment.intent}:${planned.brief.beats.map(beat => beat.kind).join(',')}` : undefined,
      });
      if (planned && evidence) {
        session.conversationRuntime.activateStory({
          momentId, subjectId: poiId, subjectName: candidate.name, level: level as 'short' | 'long',
          plan: { moment: planned.plan.moment, narrativeAngle: planned.plan.narrativeAngle, evidenceRefs: planned.plan.evidenceRefs },
          evidence, guideId: canonicalGuideId(params.voiceId), language: params.language,
        });
      }
      await recordSessionStoryStarted(session, poiId);
      check();
    }
    // This is delivery ownership, not proof of audible start. Text-only explicit choices
    // retain the session until skip/completion and cannot be displaced by an automatic ping.
    session.alreadyListening = level !== 'identify' || !!result.audioUrl;
    session.lastStoryStartedAt = Date.now();
    (session.spokenProviderIds ??= new Set()).add(poiId);
    succeeded = true;
    const attribution = evidence ? publicAttribution(evidence) : undefined;
    return {...result,poiId,name:candidate.name,guideId:canonicalGuideId(params.voiceId),level:level as SelectedStoryResult['level'],language:params.language,momentId:level === 'identify' ? undefined : momentId,sourceUrl:attribution?.url,attribution,availability};
  } finally {
    if (session.storyRequest === request) {session.storyRequest = undefined; session.selectedRequestId = undefined; if (!succeeded) session.alreadyListening = false;}
  }
}

export async function selectedStoryAvailability(id: string, userId: string, poiId: string): Promise<StoryAvailability> {
  const session = getSession(id);
  if (!session || session.userId !== userId) throw new StorySelectionError(404, 'Session not found');
  const candidate = sessionDiscoveryCandidate(id, poiId);
  if (!candidate) throw new StorySelectionError(404, 'Object is no longer available');
  const evidence = await discoveryEvidence(candidate);
  if (getSession(id) !== session) throw new StorySelectionError(404, 'Session not found');
  return evidence ? storyAvailability(evidence, matchingContinuationGuide(session.storyContinuation, poiId, session.params.voiceId, session.params.language)) : { short: false, long: false };
}

function matchingContinuationGuide(continuation: NonNullable<ReturnType<typeof getSession>>['storyContinuation'], poiId: string, guideId: string, language: string): string | undefined {
  const canonical = canonicalGuideId(guideId);
  return continuation?.poiId === poiId && continuation.guideId === canonical && continuation.language === language
    ? canonical
    : undefined;
}
