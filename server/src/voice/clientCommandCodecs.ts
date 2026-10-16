import type { RealtimeClientCommand } from './contracts';

/**
 * Translate server-approved commands at the client transport edge. These payloads are
 * transport-only and must never be copied into product telemetry.
 */
export function encodeOpenAIRealtimeCommands(commands: RealtimeClientCommand[]): Record<string, unknown>[] {
  return commands.flatMap((command): Record<string, unknown>[] => {
    if (command.type === 'cancel_response') {
      return [
        { type: 'response.cancel' },
        // Required after cancel on WebRTC so buffered stale audio cannot play over a new turn.
        { type: 'output_audio_buffer.clear' },
      ];
    }
    if (command.type === 'close') return [];
    return [{
      type: 'response.create',
      response: {
        output_modalities: ['audio'],
        instructions: exactRenderingPrompt(command.text, command.renderingInstructions),
      },
      event_id: `answer_${command.voiceTurnId}`,
    }];
  });
}

export function encodeGeminiLiveCommands(commands: RealtimeClientCommand[]): Record<string, unknown>[] {
  return commands.flatMap((command): Record<string, unknown>[] => {
    if (command.type === 'cancel_response') {
      // Gemini Live treats new activity as interruption. The client must also clear its local audio queue.
      return [{ realtimeInput: { activityStart: {} } }];
    }
    if (command.type === 'close') return [];
    return [{
      clientContent: {
        turns: [{
          role: 'user',
          parts: [{ text: exactRenderingPrompt(command.text, command.renderingInstructions) }],
        }],
        turnComplete: true,
      },
    }];
  });
}

function exactRenderingPrompt(text: string, instructions: string): string {
  return [
    instructions.slice(0, 500),
    'Render only the exact text between the markers. Do not speak the markers.',
    '<HEY_CITY_APPROVED_TEXT>',
    text.slice(0, 4_000),
    '</HEY_CITY_APPROVED_TEXT>',
  ].join('\n');
}
