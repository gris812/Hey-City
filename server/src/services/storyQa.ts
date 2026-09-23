import { narrativeV2 } from '../config';
import type { StoryBrief } from './storyBrief';

/** Deliberately local validation, not an external factuality check or a second LLM call. */
export function validateStory(text: string, brief: StoryBrief): void {
  if (!text.trim()) throw new Error('Empty narration');
  if (/https?:\/\/|www\.|\b(?:Category|Source)\s*:|CC[ -]BY|Wikipedia|Википеди|Creative Commons|\blicen[cs]e\b|лицензи/i.test(text)) throw new Error('Narration metadata leakage');
  if (/NarrativePlan|StoryBrief|system prompt|system instructions|ignore (?:all |previous )?instructions|системн(?:ый|ые|ых) (?:промпт|инструкц)/i.test(text)) throw new Error('Narration prompt leakage');
  const cyrillic = text.match(/[а-яё]/gi)?.length ?? 0;
  const latin = text.match(/[a-z]/gi)?.length ?? 0;
  if ((brief.constraints.language === 'ru' && cyrillic / Math.max(1, latin + cyrillic) < narrativeV2.languageRatio) ||
      (brief.constraints.language === 'en' && latin / Math.max(1, latin + cyrillic) < narrativeV2.languageRatio)) throw new Error('Narration language mismatch');
  for (const pattern of brief.constraints.forbiddenPatterns) if (new RegExp(pattern, 'iu').test(text)) throw new Error('Forbidden narrative pattern');
  if (text.split(/\s+/).length > Math.ceil(brief.constraints.targetDurationSec * narrativeV2.wordsPerSecond)) throw new Error('Narration exceeds spoken word budget');
}
