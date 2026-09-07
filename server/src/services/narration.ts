/**
 * Narration: LLM text by template + TTS. Cache text and audio. Place Details only when POI selected.
 */
import type { NarrativePlan } from '@heycity/shared';
import { cacheGet, cacheSet, ttsAudioCacheKey, placeDetailsCacheKey } from './cache';
import { cacheTtl, discoveryConfig, media, openai } from '../config';
import { createHash } from 'crypto';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createNarrativePlan } from './narrativePlan';
import { narrativeGenerator } from './narrativeGenerator';
import { recordUsage } from './usage';

export interface GenerateNarrationInput {
  poiId: string;
  placeName: string;
  lang: string;
  theme: string;
  style: string;
  lengthSec: number;
  voiceId: string;
  context: 'drive_discovery' | 'walking';
  userId?: string;
}

export interface GenerateNarrationResult {
  audioUrl: string;
  transcriptText: string;
  estimatedDurationSec: number;
  cached: boolean;
}

export async function generateVoiceSample(
  text: string,
  voiceId: string,
  lang: string,
  userId?: string
): Promise<{ audioUrl: string; transcriptText: string }> {
  const storyHash = createHash('sha256').update(`${lang}:${text}`).digest('hex').slice(0, 16);
  const audioKey = ttsAudioCacheKey(storyHash, voiceId);
  let audioUrl = await cacheGet<string>(audioKey);
  if (!audioUrl) {
    audioUrl = await synthesizeSpeech(text, voiceId, lang, userId, 'voice_sample');
    await cacheSet(audioKey, audioUrl, cacheTtl.ttsAudioDays * 24 * 60 * 60);
  }
  return { audioUrl, transcriptText: text };
}

export async function generateNarration(input: GenerateNarrationInput): Promise<GenerateNarrationResult> {
  const plan = createNarrativePlan({
    poiId: input.poiId,
    placeName: input.placeName,
    mode: input.context === 'drive_discovery' ? 'vehicle' : 'walking',
    guideId: input.voiceId,
    themeTags: [input.theme],
    targetDurationSec: input.lengthSec,
  });
  return generateNarrationFromPlan(plan, {
    language: input.lang,
    narrationStyle: input.style,
    userId: input.userId,
  });
}

export async function generateNarrationFromPlan(
  plan: NarrativePlan,
  input: { language: string; narrationStyle: string; userId?: string }
): Promise<GenerateNarrationResult> {
  const generated = await narrativeGenerator.generate({
    plan,
    language: input.language,
    narrationStyle: input.narrationStyle,
    userId: input.userId,
  });
  const text = generated.text;

  const storyHash = createHash('sha256').update(text).digest('hex').slice(0, 16);
  const audioKey = ttsAudioCacheKey(storyHash, plan.guideId);
  let audioUrl = await cacheGet<string>(audioKey);
  let audioCached = !!audioUrl;

  if (!audioUrl) {
    try {
      audioUrl = await synthesizeSpeech(text, plan.guideId, input.language, input.userId, 'story_tts');
      await cacheSet(audioKey, audioUrl, cacheTtl.ttsAudioDays * 24 * 60 * 60);
    } catch (error) {
      console.warn('TTS provider failed; returning text-only narration', error);
      audioUrl = '';
      audioCached = false;
    }
  }

  return {
    audioUrl,
    transcriptText: text,
    estimatedDurationSec:
      plan.mode === 'vehicle'
        ? clamp(
            plan.targetDurationSec,
            discoveryConfig.vehicleStoryMinSeconds,
            discoveryConfig.vehicleStoryMaxSeconds
          )
        : plan.targetDurationSec,
    cached: generated.cached && audioCached,
  };
}

async function synthesizeSpeech(
  text: string,
  voiceId: string,
  lang: string,
  userId?: string,
  usageOperation: 'voice_sample' | 'story_tts' = 'story_tts'
): Promise<string> {
  const hash = createHash('sha256').update(`${voiceId}:${lang}:${text}`).digest('hex').slice(0, 24);
  const filename = `${hash}.mp3`;
  const filePath = join(media.directory, filename);
  try {
    await access(filePath);
    return `${media.publicApiUrl}/media/${filename}`;
  } catch {
    // Generate once, then reuse the persistent media volume across API restarts.
  }
  if (!openai.apiKey) return `https://example.com/tts/${voiceId}/${hash}.mp3`;
  const isArthur = voiceId === 'artur' || voiceId === 'arthur';
  const voice = isArthur ? 'onyx' : 'coral';
  const language = lang.toLowerCase().startsWith('en') ? 'English' : 'Russian';
  const instructions = isArthur
    ? `Speak in ${language}. Sound measured, precise, thoughtful and quietly engaging, like an experienced historian walking beside one person. Avoid theatrical delivery.`
    : `Speak in ${language}. Sound warm, observant, natural and conversational, like a curious local friend walking beside one person. Avoid announcer-style delivery.`;
  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: `Bearer ${openai.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: openai.ttsModel, voice, input: text.slice(0, 4096), instructions, response_format: 'mp3' }),
  });
  if (!response.ok) throw new Error(`OpenAI TTS error: ${response.status} ${(await response.text()).slice(0, 300)}`);
  await mkdir(media.directory, { recursive: true });
  await writeFile(filePath, Buffer.from(await response.arrayBuffer()));
  const inputTokens = Math.ceil(text.length / 4);
  const outputTokens = Math.ceil((text.length / 14) * 20);
  await recordUsage({ userId, category: 'openai_tts', operation: usageOperation, inputTokens, outputTokens,
    estimatedCostUsd: inputTokens / 1e6 * openai.ttsInputUsdPerMillion + outputTokens / 1e6 * openai.ttsOutputUsdPerMillion,
    metadata: { estimate: true, model: openai.ttsModel } });
  return `${media.publicApiUrl}/media/${filename}`;
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
