/**
 * Canonical deterministic callback-topic policy.
 *
 * Add or tune callback relationships here instead of growing regex logic inside
 * evidence normalization or JourneyState. Rules must remain evidence-backed:
 * broad user preference tags (for example "history") are intentionally not
 * callback topics by themselves.
 */
export interface CallbackTopicRule {
  key: string;
  /** Optional evidence-category gate. */
  categories?: readonly string[];
  /** Match against normalized verified evidence claims. */
  pattern: RegExp;
}

export const CALLBACK_TOPIC_RULES: readonly CallbackTopicRule[] = Object.freeze([
  {
    key: 'financial_history',
    pattern: /\b(?:financial|finance|banking|banks?|stock|trading|commerce|customs|treasury)\b/i,
  },
  {
    key: 'civic_history',
    pattern: /\b(?:congress|legislature|city hall|civic|election|government)\b/i,
  },
  {
    key: 'bridge_engineering',
    categories: ['bridge'],
    pattern: /\b(?:span|suspension|cable|engineer|construction|structure)\b/i,
  },
  {
    key: 'architectural_style',
    pattern: /\b(?:art deco|beaux.arts|gothic|neoclassical|greek revival|roman(?:esque)?)\b/i,
  },
]);

export function callbackTopicsForEvidence(category: string, verifiedClaims: string[]): string[] {
  const claims = verifiedClaims.join(' ').toLowerCase();
  if (!claims) return [];

  return CALLBACK_TOPIC_RULES
    .filter(rule => (!rule.categories || rule.categories.includes(category)) && rule.pattern.test(claims))
    .map(rule => rule.key);
}
