/**
 * Narration: LLM text by template + TTS. Cache text and audio. Place Details only when POI selected.
 */
import type { NarrativePlan } from '@heycity/shared';
import { cacheGet, cacheSet, ttsAudioCacheKey, placeDetailsCacheKey } from './cache';
import { cacheTtl, discoveryConfig, media, openai } from '../config';
import { createHash } from 'crypto';
import { access, mkdir, writeFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { createNarrativePlan } from './narrativePlan';
import { narrativeGenerator } from './narrativeGenerator';
import { recordUsage } from './usage';
import { getGuide, guideVersion } from './guides';
import { ProgressiveAudio } from './progressiveAudio';

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

export async function generateIdentification(text: string, voiceId: string, lang: string, userId?: string) {
  return { transcriptText: text, audioUrl: await synthesizeSpeech(text, voiceId, lang, userId, 'story_tts', media.progressiveSpeech) };
}

export async function generateVoiceSample(
  text: string,
  voiceId: string,
  lang: string,
  userId?: string
): Promise<{ audioUrl: string; transcriptText: string }> {
  const storyHash = createHash('sha256').update(`${lang}:${text}`).digest('hex').slice(0, 16);
  const audioKey = ttsAudioCacheKey(storyHash, `${openai.ttsModel}:${voiceId}:${guideVersion(await getGuide(voiceId))}`);
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
  input: { language: string; narrationStyle: string; userId?: string; signal?: AbortSignal }
): Promise<GenerateNarrationResult> {
  const generated = await narrativeGenerator.generate({
    plan,
    language: input.language,
    narrationStyle: input.narrationStyle,
    userId: input.userId,
    signal: input.signal,
  });
  const text = generated.text;
  input.signal?.throwIfAborted();

  const storyHash = createHash('sha256').update(text).digest('hex').slice(0, 16);
  const audioKey = ttsAudioCacheKey(storyHash, `${openai.ttsModel}:${input.language}:${plan.guideId}:${guideVersion(await getGuide(plan.guideId))}`);
  let audioUrl = await cacheGet<string>(audioKey);
  let audioCached = !!audioUrl;

  if (!audioUrl) {
    try {
      // Return after the first audio bytes, not after the entire MP3 has arrived.
      // Only completed speech is persisted; an in-flight URL must not enter this cache.
      audioUrl = await synthesizeSpeech(text, plan.guideId, input.language, input.userId, 'story_tts', media.progressiveSpeech);
      const completion = pendingSpeech.get(audioUrl.split('/').pop()!)?.completion;
      if (completion) {
        void completion.then(url => cacheSet(audioKey, url, cacheTtl.ttsAudioDays * 86400)).catch(() => {});
      } else {
        await cacheSet(audioKey, audioUrl, cacheTtl.ttsAudioDays * 86400);
      }
    } catch (error) {
      console.warn('TTS provider failed; returning text-only narration', error);
      audioUrl = '';
      audioCached = false;
    }
  }

  return {
    audioUrl,
    transcriptText: text,
    estimatedDurationSec: plan.targetDurationSec,
    cached: generated.cached && audioCached,
  };
}

const pendingSpeech = new Map<string, { audio: ProgressiveAudio; completion: Promise<string> }>();
export function pendingSpeechAudio(filename: string): ProgressiveAudio | undefined {
  return pendingSpeech.get(filename)?.audio;
}
async function synthesizeSpeech(text: string, voiceId: string, lang: string, userId?: string,
  usageOperation: 'voice_sample' | 'story_tts' = 'story_tts', progressive = false): Promise<string> {
  const guide = await getGuide(voiceId);
  const hash = createHash('sha256').update(`${openai.ttsModel}:${voiceId}:${guideVersion(guide)}:${lang}:${text}`).digest('hex').slice(0,24);
  const filename = `${hash}.mp3`;
  const url = `${media.publicApiUrl}/media/${filename}`;
  let job = pendingSpeech.get(filename);
  if (!job) {
    try { await access(join(media.directory, filename)); return url; } catch { /* cache miss */ }
    // Re-check after asynchronous disk access: concurrent callers must share one job.
    job = pendingSpeech.get(filename);
    if (!job) {
      if (pendingSpeech.size >= media.maxSpeechJobs) throw new Error('Speech capacity reached');
      const audio = new ProgressiveAudio(media.maxSpeechBytes);
      const completion = synthesizeSpeechOnce(text, voiceId, lang, userId, usageOperation, guide, hash, audio);
      job = { audio, completion };
      pendingSpeech.set(filename, job);
      void completion.then(() => {
        audio.finish(); pendingSpeech.delete(filename);
      }, () => {
        // Keep failed streams briefly, so a late browser GET receives an error, not partial media.
        audio.finish(new Error('Speech generation failed'));
        const timer = setTimeout(() => pendingSpeech.delete(filename), media.speechFailureRetentionMs);
        timer.unref();
      });
    }
  }
  if (progressive && openai.apiKey) { await job.audio.ready; return url; }
  return job.completion;
}

async function synthesizeSpeechOnce(
  text: string,
  voiceId: string,
  lang: string,
  userId: string | undefined,
  usageOperation: 'voice_sample' | 'story_tts',
  guide: Awaited<ReturnType<typeof getGuide>>,
  hash: string,
  audio: ProgressiveAudio
): Promise<string> {
  const filename = `${hash}.mp3`;
  const filePath = join(media.directory, filename);
  try {
    await access(filePath);
    return `${media.publicApiUrl}/media/${filename}`;
  } catch {
    // Generate once, then reuse the persistent media volume across API restarts.
  }
  if (!openai.apiKey) {
    if (process.env.NODE_ENV === 'production') throw new Error('OpenAI TTS key is not configured');
    return `https://example.com/tts/${voiceId}/${hash}.mp3`;
  }
  const isArthur = voiceId === 'artur' || voiceId === 'arthur';
  const voice = guide?.voice ?? (isArthur ? 'onyx' : 'coral');
  const language = lang.toLowerCase().startsWith('en') ? 'English' : 'Russian';
  const instructions = guide ? `Speak in ${language}. ${guide.voiceInstructions}` : isArthur
    ? `Speak in ${language}. Sound measured, precise, thoughtful and quietly engaging, like an experienced historian walking beside one person. Avoid theatrical delivery.`
    : `Speak in ${language}. Sound warm, observant, natural and conversational, like a curious local friend walking beside one person. Avoid announcer-style delivery.`;
  const startedAt = Date.now();
  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    signal: AbortSignal.timeout(media.speechTimeoutMs),
    method: 'POST',
    headers: { Authorization: `Bearer ${openai.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: openai.ttsModel, voice, input: text.slice(0, 4096), instructions, response_format: 'mp3' }),
  });
  if (!response.ok) throw new Error(`OpenAI TTS error: ${response.status} ${(await response.text()).slice(0, 300)}`);
  await mkdir(media.directory, { recursive: true });
  if (!response.body) throw new Error('OpenAI TTS returned no stream');
  const chunks: Buffer[] = [];
  for await (const chunk of response.body) {
    const bytes = Buffer.from(chunk);
    if (!bytes.length) continue;
    audio.append(bytes);
    if (!chunks.length) console.info(JSON.stringify({ event: 'speech_first_byte', elapsedMs: Date.now() - startedAt }));
    chunks.push(bytes);
  }
  const bytes = Buffer.concat(chunks);
  if (!bytes.length) throw new Error('OpenAI TTS returned empty audio');
  const tempPath = `${filePath}.${Date.now()}.tmp`;
  try { await writeFile(tempPath, bytes); await rename(tempPath, filePath); }
  finally { await unlink(tempPath).catch(() => {}); }
  const inputTokens = Math.ceil(text.length / 4);
  const outputTokens = Math.ceil((text.length / 14) * 20);
  await recordUsage({ userId, category: 'openai_tts', operation: usageOperation, inputTokens, outputTokens,
    estimatedCostUsd: inputTokens / 1e6 * openai.ttsInputUsdPerMillion + outputTokens / 1e6 * openai.ttsOutputUsdPerMillion,
    metadata: { estimate: true, model: openai.ttsModel } }).catch(() => {
      console.warn('Speech usage recording failed');
    });
  console.info(JSON.stringify({ event: 'speech_complete', elapsedMs: Date.now() - startedAt, bytes: bytes.length }));
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
