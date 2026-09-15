import { getSession } from './driveSession';
import { sessionDiscoveryCandidate } from './aheadDiscovery';
import { discoveryStorySeed } from './discoveryKnowledge';
import { createNarrativePlan } from './narrativePlan';
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
  session.alreadyListening = true;
  let succeeded = false;
  const check = () => { request.signal.throwIfAborted(); if (getSession(id) !== session) throw new StorySelectionError(404,'Session not found'); };
  try {
    let result;
    let sourceUrl: string | undefined;
    if (level === 'identify') {
      const category = (categories[candidate.targetType] ?? ['место','place'])[params.language === 'ru' ? 0 : 1];
      const text = params.language === 'ru' ? `${candidate.name} — ${category} рядом с вами. Рассказать об этом месте?` : `${candidate.name}, a ${category} near you. Would you like to hear about it?`;
      result = await generateIdentification(text,params.voiceId,params.language,userId);
    } else {
      const seed = await discoveryStorySeed(candidate); check();
      if (!seed) throw new StorySelectionError(422, params.language === 'ru' ? 'Недостаточно проверенной информации об этом объекте.' : 'Not enough verified information about this place.');
      sourceUrl = seed.match(/https:\/\/en\.wikipedia\.org\/\?curid=\d+/)?.[0];
      const duration = level === 'long' ? narration.detailedSeconds : narration.briefSeconds;
      const plan = createNarrativePlan({poiId,placeName:candidate.name,storySeed:seed,mode:params.mode ?? 'walking',guideId:params.voiceId,themeTags:params.themeTags,targetDurationSec:duration});
      // Explicitly requested detail has its own duration; no change to automatic driving limits.
      plan.targetDurationSec = duration; plan.safety.maxDurationSec = duration;
      result = await generateNarrationFromPlan(plan,{language:params.language,narrationStyle:params.narrationStyle,userId,signal:request.signal});
    }
    check();
    session.alreadyListening = !!result.audioUrl;
    session.lastStoryStartedAt = Date.now();
    (session.spokenProviderIds ??= new Set()).add(poiId);
    succeeded = true;
    return {...result,poiId,name:candidate.name,level,language:params.language,sourceUrl};
  } finally {
    if (session.storyRequest === request) {session.storyRequest = undefined; if (!succeeded) session.alreadyListening = false;}
  }
}
