import type { ConversationTurnResult } from '@heycity/shared';
import type {
  RealtimeAnswerInput,
  RealtimeProviderSession,
  RealtimeUserTurn,
  SpeechProvider,
} from '../voice/contracts';
import {
  ConversationService,
  type ConversationSessionContext,
} from './conversationService';

export interface RealtimeBridgeResult {
  result: ConversationTurnResult;
  fallbackAudioUrl?: string;
}

/**
 * Thin M4 adapter around the canonical M3 service. It deliberately owns no
 * intent, tool, memory, navigation, or resume policy.
 */
export class RealtimeConversationBridge {
  constructor(
    private readonly service: ConversationService,
    private readonly speechProvider: SpeechProvider,
  ) {}

  cancel(session: ConversationSessionContext): void {
    this.service.cancel(session, {});
  }

  async renderGroundedFallback(session: ConversationSessionContext, answerText: string): Promise<string> {
    const fallback = await this.speechProvider.synthesize({
      text: answerText,
      guideId: session.params.voiceId,
      language: session.params.language,
      userId: session.userId,
    });
    if (!fallback.audioUrl) throw new Error('SpeechProvider fallback did not return an audio URL');
    return fallback.audioUrl;
  }

  async handleFinalTurn(
    session: ConversationSessionContext,
    providerSession: RealtimeProviderSession,
    turn: RealtimeUserTurn,
    renderingInstructions: string,
    assertCurrent: () => void,
  ): Promise<RealtimeBridgeResult> {
    if (!turn.isFinal) throw new Error('Only final realtime turns may enter M3');
    const text = turn.text.trim().slice(0, 1000);
    if (!text) throw new Error('Realtime turn text is required');

    // `renderAudio: false` is the only M4 variation: all business decisions
    // and grounded content still come from the canonical M3 path.
    const result = await this.service.turn(session, {
      text,
      clientTurnId: turn.voiceTurnId,
    }, { renderAudio: false });
    assertCurrent();

    const answer: RealtimeAnswerInput = {
      voiceTurnId: turn.voiceTurnId,
      text: result.answerText,
      renderingInstructions,
    };
    try {
      await providerSession.submitAnswer(answer);
      assertCurrent();
      return { result };
    } catch (error) {
      assertCurrent();
      // Render the already-grounded answer only. Never re-run M3/tools.
      const fallbackAudioUrl = await this.renderGroundedFallback(session, result.answerText);
      assertCurrent();
      return { result, fallbackAudioUrl };
    }
  }
}
