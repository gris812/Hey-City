import { getSession } from './driveSession';
import { sessionDiscoveryCandidate } from './aheadDiscovery';
import { discoveryEvidence } from './discoveryKnowledge';
import { prepareNarrative } from './narrativePlan';
import { storyAvailability } from './evidence';
import { canonicalGuideId } from './guidePolicy';
import type { StoryAvailability } from '@heycity/shared';
import { generateIdentification, generateNarrationFromPlan } from './narration';
import { narration } from '../config';

export class StorySelectionError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const categories: Record<string, [string,string]> = {city:['город','city'],museum:['музей','museum'],park:['парк','park'],national_park:['национальный парк','national park'],historical_landmark:['историческое место','historic landmark'],cultural_landmark:['достопримечательность','landmark'],monument:['памятник','monument'],university:['университет','university'],region:['регион','region']};

/** Latest explicit choice supersedes previous work; discovery never waits for this pipeline. */
export async function selectStory(id: string, userId: string, poiId: string, level: string, language?: string) {
  const session = getSession(id);
  if (!session || session.userId !== userId) throw new StorySelectionError(404,'Session not found');
  const candidate = sessionDiscoveryCandidate(id,poiId);
  if (!candidate) throw new StorySelectionError(404,'Object is no longer available');
  if (!['identify','short','long'].includes(level)) throw new StorySelectionError(400,'Invalid story level');
  if (language !== undefined && !['ru','en'].includes(language)) throw new StorySelectionError(400,'Invalid language');
  session.storyRequest?.abort();
  const request = new AbortController(); session.storyRequest = request;
  const params = {...session.params, language: language ?? session.params.language};
  session.params.language = params.language;
  const prior = session.storyContinuation;
  if (prior && (prior.poiId !== poiId || prior.guideId !== canonicalGuideId(params.voiceId) || prior.language !== params.language)) session.storyContinuation = undefined;
  session.alreadyListening = true;
  let succeeded = false;
  const check = () => { request.signal.throwIfAborted(); if (getSession(id) !== session) throw new StorySelectionError(404,'Session not found'); };
  try {
    let result;
    let sourceUrl: string | undefined;
    let availability: StoryAvailability = { short: false, long: false };
    if (level === 'identify') {
      const category = (categories[candidate.targetType] ?? ['место','place'])[params.language === 'ru' ? 0 : 1];
      const text = params.language === 'ru' ? `${candidate.name} — ${category} рядом с вами.` : `${candidate.name}, a ${category} near you.`;
      result = await generateIdentification(text,params.voiceId,params.language,userId);
      // Availability is resolved separately so identifying a place never waits for knowledge lookup.
    } else {
      const evidence = await discoveryEvidence(candidate); check();
      if (evidence) availability = storyAvailability(evidence);
      if (!evidence || !(level === 'long' ? availability.long : availability.short)) throw new StorySelectionError(422, params.language === 'ru' ? 'Недостаточно проверенной информации об этом объекте.' : 'Not enough verified information about this place.');
      sourceUrl = evidence.attribution?.url;
      const duration = level === 'long' ? narration.detailedSeconds : narration.briefSeconds;
      const { plan, brief, policy } = prepareNarrative({poiId,placeName:candidate.name,mode:params.mode ?? 'walking',guideId:params.voiceId,themeTags:params.themeTags,targetDurationSec:duration}, evidence,
        { level: level as 'short' | 'long', language: params.language, continuation: session.storyContinuation });
      result = await generateNarrationFromPlan(plan,{brief,policy,language:params.language,narrationStyle:params.narrationStyle,userId,signal:request.signal});
    }
    check();
    if (level === 'short') session.storyContinuation = { poiId, guideId: canonicalGuideId(params.voiceId), language: params.language, previousLevel: 'short', previousTranscript: result.transcriptText };
    session.alreadyListening = !!result.audioUrl;
    session.lastStoryStartedAt = Date.now();
    (session.spokenProviderIds ??= new Set()).add(poiId);
    succeeded = true;
    return {...result,poiId,name:candidate.name,level,language:params.language,sourceUrl,availability};
  } finally {
    if (session.storyRequest === request) {session.storyRequest = undefined; if (!succeeded) session.alreadyListening = false;}
  }
}

export async function selectedStoryAvailability(id: string, userId: string, poiId: string): Promise<StoryAvailability> {
  const session = getSession(id);
  if (!session || session.userId !== userId) throw new StorySelectionError(404, 'Session not found');
  const candidate = sessionDiscoveryCandidate(id, poiId);
  if (!candidate) throw new StorySelectionError(404, 'Object is no longer available');
  const evidence = await discoveryEvidence(candidate);
  if (getSession(id) !== session) throw new StorySelectionError(404, 'Session not found');
  return evidence ? storyAvailability(evidence) : { short: false, long: false };
}
