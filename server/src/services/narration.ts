/**
 * Narration: LLM text by template + TTS. Cache text and audio. Place Details only when POI selected.
 */
import { cacheGet, cacheSet, storyTextCacheKey, ttsAudioCacheKey, placeDetailsCacheKey } from './cache';
import { cacheTtl, discoveryConfig } from '../config';
import { createHash } from 'crypto';
import { createMockNarration, createNarrativePlan } from './narrativePlan';

export interface GenerateNarrationInput {
  poiId: string;
  placeName: string;
  lang: string;
  theme: string;
  style: string;
  lengthSec: number;
  voiceId: string;
  context: 'drive_discovery';
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
    audioUrl = await synthesizeSpeech(text, input.voiceId, input.lang);
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
  // MVP: deterministic mock from NarrativePlan. Production: LLM formulates from the plan.
  const plan = createNarrativePlan({
    poiId: input.poiId,
    placeName: input.placeName,
    mode: input.context === 'drive_discovery' ? 'vehicle' : 'walking',
    guideId: input.voiceId,
    themeTags: [input.theme],
    targetDurationSec: input.lengthSec,
  });
  return createMockNarration(plan).transcriptText;
}

async function synthesizeSpeech(text: string, voiceId: string, _lang: string): Promise<string> {
  // MVP: no real TTS. Return placeholder URL. Production: call Google TTS / other, upload to S3/GCS, return signed URL.
  const placeholder = `https://example.com/tts/${voiceId}/${createHash('sha256').update(text).digest('hex').slice(0, 8)}.mp3`;
  return placeholder;
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
