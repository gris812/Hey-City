import type { DiscoveryCandidate } from '@heycity/shared';
import { driveDiscovery, narration } from '../config';
import type { DriveSession, DriveSessionParams } from './driveSession';
import { specificCallbackTopics, type EvidenceBundle } from './evidence';
import { prepareNarrative } from './narrativePlan';

export function selectedStoryPlan(session: DriveSession, params: DriveSessionParams, candidate: DiscoveryCandidate,
  evidence: EvidenceBundle, level: 'short' | 'long', commitCallback: boolean) {
  const journey = session.journeyState;
  const options = { entityId: candidate.providerId,
    topicKeys: [...params.themeTags, evidence.category, ...specificCallbackTopics(evidence)] };
  const callback = commitCallback ? journey.selectCallback(options) : journey.previewCallback(options);
  const snapshot = journey.getSnapshot();
  const plan = prepareNarrative({
    poiId: candidate.providerId, placeName: candidate.name, mode: params.mode ?? 'walking',
    guideId: params.voiceId, themeTags: params.themeTags,
    targetDurationSec: level === 'long' ? narration.detailedSeconds : narration.briefSeconds,
  }, evidence, { level, language: params.language, continuation: session.storyContinuation,
    journey: callback && !snapshot.callbacks.some(item => item.id === callback.id)
      ? { ...snapshot, callbacks: [...snapshot.callbacks, callback] } : snapshot });
  plan.plan.selectionContext = level === 'short' ? { proximity: 'unspecified' }
    : { distanceMeters: candidate.distanceMeters, isAhead: candidate.isAhead };
  if (level === 'short' || candidate.distanceMeters > driveDiscovery.fallbackDistanceM) {
    const forbidden = [...plan.plan.mustAvoid,
      'right (?:here|in front of (?:us|you))|прямо (?:перед (?:нами|вами)|здесь)|мы (?:стоим|находимся) (?:у|около)'];
    plan.plan.mustAvoid = forbidden;
    plan.brief.constraints.forbiddenPatterns = forbidden;
  }
  return plan;
}
