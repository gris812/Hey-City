import type { ConversationControlResult, ConversationInterruptResult, ConversationTurnRequest, ConversationTurnResult } from '@heycity/shared';
import { apiFetch } from './client';

function guestHeaders(guestId?: string): Record<string, string> | undefined {
  return guestId ? { 'x-hey-city-guest-id': guestId } : undefined;
}

export type ConversationInterruptInput = {
  momentId: string;
  listenedSeconds?: number;
};

export async function interruptConversation(
  sessionId: string,
  input: ConversationInterruptInput,
  guestId?: string,
): Promise<ConversationInterruptResult> {
  return apiFetch('/drive/session/conversation/interrupt', {
    method: 'POST', headers: guestHeaders(guestId), body: { sessionId, ...input },
  });
}

export async function sendConversationTurn(
  sessionId: string,
  input: ConversationTurnRequest,
  guestId?: string,
): Promise<ConversationTurnResult> {
  return apiFetch('/drive/session/conversation/turn', {
    method: 'POST', headers: guestHeaders(guestId), body: { sessionId, ...input },
  });
}

export async function resumeConversation(
  sessionId: string,
  momentId: string,
  guestId?: string,
): Promise<ConversationControlResult> {
  return apiFetch('/drive/session/conversation/resume', {
    method: 'POST', headers: guestHeaders(guestId), body: { sessionId, momentId },
  });
}

export async function cancelConversation(sessionId: string, turnId?: string, guestId?: string): Promise<ConversationControlResult> {
  return apiFetch('/drive/session/conversation/cancel', {
    method: 'POST', headers: guestHeaders(guestId), body: { sessionId, turnId },
  });
}
