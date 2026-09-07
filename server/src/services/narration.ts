/**
 * Narration: LLM text by template + TTS. Cache text and audio. Place Details only when POI selected.
 */
import { cacheGet, cacheSet, storyTextCacheKey, ttsAudioCacheKey, placeDetailsCacheKey } from './cache';
import { cacheTtl, discoveryConfig, media, openai } from '../config';
import { createHash } from 'crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createMockNarration, createNarrativePlan } from './narrativePlan';
import { recordUsage } from './usage';

export interface GenerateNarrationInput {
  poiId: string;
  placeName: string;
  lang: string;
  theme: string;
  style: string;
  lengthSec: number;
  voiceId: string;
  context: 'drive_discovery';
  userId?: string;
}

export interface GenerateNarrationResult {
  audioUrl: string;
  transcriptText: string;
  estimatedDurationSec: number;
  cached: boolean;
}

function lengthBucket(sec: number): number {
  if (sec <= 60) return 60;
  if (sec <= 120) return 120;
  return 180;
}

export async function generateNarration(input: GenerateNarrationInput): Promise<GenerateNarrationResult> {
  const bucket = lengthBucket(input.lengthSec);
  const textKey = storyTextCacheKey(
    input.poiId,
    input.lang,
    input.theme,
    input.style,
    bucket
  );
  let text = await cacheGet<string>(textKey);
  let textCached = !!text;

  if (!text) {
    text = await generateStoryText(input);
    await cacheSet(textKey, text, cacheTtl.storyTextDays * 24 * 60 * 60);
  }

  const storyHash = createHash('sha256').update(text).digest('hex').slice(0, 16);
  const audioKey = ttsAudioCacheKey(storyHash, input.voiceId);
  let audioUrl = await cacheGet<string>(audioKey);
  let audioCached = !!audioUrl;

  if (!audioUrl) {
    audioUrl = await synthesizeSpeech(text, input.voiceId, input.lang, input.userId);
    await cacheSet(audioKey, audioUrl, cacheTtl.ttsAudioDays * 24 * 60 * 60);
  }

  return {
    audioUrl,
    transcriptText: text,
    estimatedDurationSec:
      input.context === 'drive_discovery'
        ? clamp(
            input.lengthSec,
            discoveryConfig.vehicleStoryMinSeconds,
            discoveryConfig.vehicleStoryMaxSeconds
          )
        : bucket,
    cached: textCached && audioCached,
  };
}

async function generateStoryText(input: GenerateNarrationInput): Promise<string> {
  const plan = createNarrativePlan({
    poiId: input.poiId,
    placeName: input.placeName,
    mode: input.context === 'drive_discovery' ? 'vehicle' : 'walking',
    guideId: input.voiceId,
    themeTags: [input.theme],
    targetDurationSec: input.lengthSec,
  });
  if (!openai.apiKey) return createMockNarration(plan).transcriptText;
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${openai.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: openai.textModel,
      instructions: 'You are a concise city guide. Use only supplied facts, never invent dates or claims. Return narration only.',
      input: `Language: ${input.lang}\nGuide: ${input.voiceId}\nStyle: ${input.style}\nTarget seconds: ${input.lengthSec}\nPlace: ${input.placeName}\nPlan: ${JSON.stringify(plan)}`,
    }),
  });
  if (!response.ok) throw new Error(`OpenAI text error: ${response.status}`);
  const data = await response.json() as { output_text?: string; usage?: { input_tokens?: number; output_tokens?: number } };
  if (!data.output_text) throw new Error('OpenAI returned empty narration');
  const inputTokens = data.usage?.input_tokens ?? 0;
  const outputTokens = data.usage?.output_tokens ?? 0;
  await recordUsage({ userId: input.userId, category: 'openai_text', operation: openai.textModel,
    inputTokens, outputTokens, estimatedCostUsd: inputTokens / 1e6 * openai.textInputUsdPerMillion + outputTokens / 1e6 * openai.textOutputUsdPerMillion });
  return data.output_text;
}

async function synthesizeSpeech(text: string, voiceId: string, _lang: string, userId?: string): Promise<string> {
  const hash = createHash('sha256').update(`${voiceId}:${text}`).digest('hex').slice(0, 24);
  if (!openai.apiKey) return `https://example.com/tts/${voiceId}/${hash}.mp3`;
  const voice = voiceId === 'artur' || voiceId === 'arthur' ? 'onyx' : 'coral';
  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: `Bearer ${openai.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: openai.ttsModel, voice, input: text, response_format: 'mp3' }),
  });
  if (!response.ok) throw new Error(`OpenAI TTS error: ${response.status}`);
  await mkdir(media.directory, { recursive: true });
  await writeFile(join(media.directory, `${hash}.mp3`), Buffer.from(await response.arrayBuffer()));
  const inputTokens = Math.ceil(text.length / 4);
  const outputTokens = Math.ceil((text.length / 14) * 20);
  await recordUsage({ userId, category: 'openai_tts', operation: openai.ttsModel, inputTokens, outputTokens,
    estimatedCostUsd: inputTokens / 1e6 * openai.ttsInputUsdPerMillion + outputTokens / 1e6 * openai.ttsOutputUsdPerMillion,
    metadata: { estimate: true } });
  return `${media.publicApiUrl}/media/${hash}.mp3`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export async function getPlaceDetails(placeId: string): Promise<Record<string, unknown> | null> {
  const key = placeDetailsCacheKey(placeId);
  const cached = await cacheGet<Record<string, unknown>>(key);
  if (cached) return cached;
  // TODO: fetch from Google Place Details API, cache 30 days
  return null;
}
