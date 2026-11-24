import { getSession, recordSessionStoryStarted, recordSessionSuperseded } from './driveSession';
import { resolveStoryDiscoveries } from './storyDiscoveries';
import { aheadDiscovery as discoveryLimits } from '../config';
import { sessionStoryDiscoveryCandidates, sessionDiscoveryCandidate } from './aheadDiscovery';
import { retrieveDiscoveryKnowledge, unavailableEvidenceTtl, type KnowledgeResult } from './discoveryKnowledge';
import { selectedStoryPlan } from './selectedStoryPlan';
import { invalidateStoryPreparation, reuseStoryPreparation, storyPreparationEnabledFor } from './storyPreparation';
import { requestContext } from './requestContext';
import { EvidenceBundle, publicAttribution, specificCallbackTopics, storyAvailability } from './evidence';
import { canonicalGuideId } from './guidePolicy';
import { isCircuitOpen } from './budget';
import type { SelectedStoryResult, StoryAvailability, StoryFailureClass } from '@heycity/shared';
import { generateIdentification, generateNarrationFromPlan, resolveCompletedNarrationAudio, isStoryTimeout } from './narration';
import { recordNarrativeStage } from './usage';

let selectedMomentSequence = 0;

export class StorySelectionError extends Error {
  constructor(public status: number, message: string, public evidenceTtlMs?: number, public failureClass?: StoryFailureClass, public retryableBeforeGeneration = false) { super(message); }
}

export function classifyKnowledgeRefusal(knowledge: KnowledgeResult): StoryFailureClass {
  if (knowledge.attempts.some(attempt => attempt.status === 'error')) return 'transient';
  if (knowledge.definitive) return 'insufficient_evidence';
  return knowledge.entity ? 'transient' : 'entity_resolution';
}

const categories: Record<string, [string,string]> = {city:['город','city'],museum:['музей','museum'],park:['парк','park'],national_park:['национальный парк','national park'],historical_landmark:['историческое место','historic landmark'],cultural_landmark:['достопримечательность','landmark'],monument:['памятник','monument'],university:['университет','university'],region:['регион','region']};

/** Latest explicit choice supersedes previous work; discovery never waits for this pipeline. */
export function selectStory(id: string, userId: string, poiId: string, level: string, language?: string, clientRequestId?: string, expectedGuideId?: unknown): Promise<SelectedStoryResult> {
  const session = getSession(id);
  if (!session || session.userId !== userId) return Promise.reject(new StorySelectionError(404, 'Session not found'));
  if (expectedGuideId !== undefined && expectedGuideId !== canonicalGuideId(session.params.voiceId)) {
    return Promise.reject(new StorySelectionError(409, 'Session guide changed'));
  }
  if (!clientRequestId) return prepareSelectedStory(id, userId, poiId, level, language, clientRequestId);
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(clientRequestId)) return Promise.reject(new StorySelectionError(400, 'Invalid request identity'));
  const key = JSON.stringify([poiId, level, language ?? session.params.language, session.params.voiceId]);
  const requests = session.selectionRequests ??= new Map();
  const existing = requests.get(clientRequestId);
  if (existing) return existing.key === key ? existing.result : Promise.reject(new StorySelectionError(409, 'Request identity already used'));
  const result = prepareSelectedStory(id, userId, poiId, level, language, clientRequestId).catch(error => {
    // Only a deterministic pre-generation evidence refusal is safely retryable. Ambiguous
    // provider failures and delivered audio keep their request identity/result to avoid charges.
    if (error instanceof StorySelectionError && (error.status === 422 || error.retryableBeforeGeneration) && requests.get(clientRequestId)?.result === result) requests.delete(clientRequestId);
    throw error;
  });
  requests.set(clientRequestId, { key, result });
  if (requests.size > 32) requests.delete(requests.keys().next().value!);
  return result;
}

async function prepareSelectedStory(id: string, userId: string, poiId: string, level: string, language?: string, clientRequestId?: string): Promise<SelectedStoryResult> {
  const session = getSession(id);
  if (!session || session.userId !== userId) throw new StorySelectionError(404,'Session not found');
  const candidate = sessionDiscoveryCandidate(id,poiId);
  if (!candidate) throw new StorySelectionError(404,'Object is no longer available', undefined, 'entity_resolution');
  if (!['identify','short','long'].includes(level)) throw new StorySelectionError(400,'Invalid story level');
  if (language !== undefined && !['ru','en'].includes(language)) throw new StorySelectionError(400,'Invalid language');
  if (isCircuitOpen(userId)) throw new StorySelectionError(429, 'Story budget temporarily unavailable', undefined, 'transient');
  invalidateStoryPreparation(session, level === 'short' ? poiId : undefined);
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
  let artifactId = momentId;
  const check = () => { request.signal.throwIfAborted(); if (getSession(id) !== session) throw new StorySelectionError(404,'Session not found'); };
  const trace = {sessionId:id,momentId,requestId:clientRequestId,poiId,objectType:candidate.targetType};
  const requestedAt = Date.now();
  let phase: 'retrieval' | 'planning' | 'generation' = 'generation';
  try {
    await recordNarrativeStage({...trace,stage:'request',status:'started'},userId);
    if (activeMoment) await recordSessionSuperseded(session, activeMoment.entityId, activeMoment.momentId);
    check();
    let result;
    let evidence: EvidenceBundle | null = null;
    let availability: StoryAvailability = { short: false, long: false };
    let planned: ReturnType<typeof selectedStoryPlan> | undefined;
    if (level === 'identify') {
      const category = (categories[candidate.targetType] ?? ['место','place'])[params.language === 'ru' ? 0 : 1];
      const text = params.language === 'ru' ? `${candidate.name} — ${category}.` : `${candidate.name}, a ${category}.`;
      result = await generateIdentification(text,params.voiceId,params.language,userId);
      // Availability is resolved separately so identifying a place never waits for knowledge lookup.
    } else {
      phase = 'retrieval';
      const retrievalStarted = Date.now();
      const knowledge = await retrieveDiscoveryKnowledge(candidate, level === 'short' && storyPreparationEnabledFor(userId));
      evidence = knowledge.evidence; check();
      if (evidence) {
        const previous = matchingContinuation(session.storyContinuation, poiId, params.voiceId, params.language);
        availability = storyAvailability(evidence, previous?.guideId, previous?.selectedEvidenceRefs);
      }
      const enough = level === 'long' ? availability.long : availability.short;
      const failureClass = enough ? undefined : classifyKnowledgeRefusal(knowledge);
      await recordNarrativeStage({ ...trace, stage: 'retrieval', status: enough ? 'ready' : failureClass === 'insufficient_evidence' ? 'unavailable' : 'failed',
        failureClass, latencyMs: Date.now() - retrievalStarted }, userId);
      if (!evidence || !enough) {
        if (failureClass === 'transient') throw new StorySelectionError(503, 'Story retrieval temporarily unavailable', undefined, failureClass, true);
        throw new StorySelectionError(422, params.language === 'ru' ? 'Недостаточно проверенной информации об этом объекте.' : 'Not enough verified information about this place.',
          failureClass === 'insufficient_evidence' ? unavailableEvidenceTtl(knowledge) || undefined : undefined, failureClass);
      }
      phase = 'planning';
      const planningStarted = Date.now();
      planned = selectedStoryPlan(session, params, candidate, evidence, level as 'short' | 'long', true);
      await recordNarrativeStage({ ...trace, stage: 'planning', status: 'ready', latencyMs: Date.now() - planningStarted }, userId);
      phase = 'generation';
      const prepared = level === 'short' ? await reuseStoryPreparation(session, candidate, planned,
        params.language, params.narrationStyle, request.signal, momentId) : undefined;
      if (prepared) artifactId = prepared.id;
      const options = { ...planned, language: params.language, narrationStyle: params.narrationStyle,
        userId, signal: request.signal, completeAudio: true, trace };
      const readyAudio = prepared?.result.audioUrl ? await resolveCompletedNarrationAudio(prepared.result.audioUrl) : undefined;
      check();
      const textOnlyFallback = prepared?.audioAttempted && !prepared.result.audioUrl;
      result = prepared && (readyAudio || textOnlyFallback) ? { ...prepared.result, audioUrl: readyAudio ?? '' } : await requestContext.run({ userId, storyCorrelationId: momentId },
        () => generateNarrationFromPlan(planned!.plan, { ...options, preparedText: prepared?.result.transcriptText }));
      check();
      invalidateStoryPreparation(session);
    }
    check();
    if (level === 'short') {
      session.storyContinuation = { poiId, guideId: canonicalGuideId(params.voiceId), language: params.language, previousLevel: 'short', previousTranscript: result.transcriptText, selectedEvidenceRefs: planned?.brief.selectedEvidenceRefs };
      if (evidence) availability = storyAvailability(evidence, session.storyContinuation.guideId, session.storyContinuation.selectedEvidenceRefs);
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
      session.deliveredArtifact = result.audioUrl ? { momentId, artifactId, guideId: canonicalGuideId(params.voiceId) } : undefined;
      await recordSessionStoryStarted(session, poiId, momentId);
      check();
    }
    // This is delivery ownership, not proof of audible start. Text-only explicit choices
    // retain the session until skip/completion and cannot be displaced by an automatic ping.
    session.alreadyListening = level !== 'identify' || !!result.audioUrl;
    session.lastStoryStartedAt = Date.now();
    (session.spokenProviderIds ??= new Set()).add(poiId);
    succeeded = true;
    const attribution = evidence ? publicAttribution(evidence) : undefined;
    return {...result,poiId,name:candidate.name,guideId:canonicalGuideId(params.voiceId),level:level as SelectedStoryResult['level'],language:params.language,momentId:level === 'identify' ? undefined : momentId,sourceUrl:attribution?.url,attribution,availability,
      storyDiscoveries: planned ? resolveStoryDiscoveries(planned.brief, result.transcriptText, candidate, sessionStoryDiscoveryCandidates(id), discoveryLimits.cityContextRadiusMeters) : undefined };
  } catch (error) {
    const failureClass = error instanceof StorySelectionError ? error.failureClass
      : isStoryTimeout(error) || phase === 'retrieval' ? 'transient' : phase;
    await recordNarrativeStage({ ...trace, stage: 'request',
      status: request.signal.aborted ? 'superseded' : failureClass === 'insufficient_evidence' ? 'unavailable' : 'failed',
      failureClass: request.signal.aborted ? undefined : failureClass, latencyMs: Date.now() - requestedAt }, userId);
    if (request.signal.aborted || error instanceof StorySelectionError) throw error;
    throw new StorySelectionError(503, 'Story temporarily unavailable', undefined, failureClass, phase !== 'generation');
  } finally {
    if (session.storyRequest === request) {session.storyRequest = undefined; session.selectedRequestId = undefined; if (!succeeded) session.alreadyListening = false;}
  }
}

export async function selectedStoryAvailability(id: string, userId: string, poiId: string): Promise<StoryAvailability> {
  const session = getSession(id);
  if (!session || session.userId !== userId) throw new StorySelectionError(404, 'Session not found');
  const candidate = sessionDiscoveryCandidate(id, poiId);
  if (!candidate) throw new StorySelectionError(404, 'Object is no longer available');
  const knowledge = await retrieveDiscoveryKnowledge(candidate);
  const evidence = knowledge.evidence;
  if (getSession(id) !== session) throw new StorySelectionError(404, 'Session not found');
  const previous = matchingContinuation(session.storyContinuation, poiId, session.params.voiceId, session.params.language);
  const availability = evidence ? storyAvailability(evidence, previous?.guideId, previous?.selectedEvidenceRefs) : { short: false, long: false };
  return { ...availability, evidenceStatus: availability.short ? 'ready' : unavailableEvidenceTtl(knowledge) ? 'unavailable' : 'unknown' };
}

function matchingContinuation(continuation: NonNullable<ReturnType<typeof getSession>>['storyContinuation'], poiId: string, guideId: string, language: string) {
  const canonical = canonicalGuideId(guideId);
  return continuation?.poiId === poiId && continuation.guideId === canonical && continuation.language === language
    ? continuation
    : undefined;
}
