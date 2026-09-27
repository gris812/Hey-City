import type { ConversationIntent, ResumeDirective } from '@heycity/shared';

/**
 * Deterministic M3 resume policy.  The model may phrase a transition, but it
 * never chooses whether an interrupted story resumes or is abandoned.
 */
export function conversationResumeDirective(input: {
  intent: ConversationIntent;
  suspendedMomentId?: string;
  navigationAccepted?: boolean;
}): ResumeDirective {
  const { intent, suspendedMomentId, navigationAccepted = false } = input;
  if (!suspendedMomentId) return { action: 'stay_idle' };

  if (intent === 'stop_story' || intent === 'change_topic' ||
      (intent === 'navigation_request' && navigationAccepted)) {
    return { action: 'abandon_previous', momentId: suspendedMomentId };
  }

  if (intent === 'resume_story' || intent === 'ask_about_current_story' ||
      intent === 'ask_about_area' || intent === 'nearby_search' ||
      intent === 'recommendation_request' || intent === 'go_deeper' ||
      intent === 'repeat' || intent === 'general_contextual_question' ||
      intent === 'ask_about_visible_object' ||
      (intent === 'navigation_request' && !navigationAccepted)) {
    return { action: 'resume_existing', momentId: suspendedMomentId };
  }

  return { action: 'stay_idle' };
}
