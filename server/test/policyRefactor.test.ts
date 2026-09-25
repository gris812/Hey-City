import assert from 'node:assert/strict';
import { NARRATIVE_FORBIDDEN_PATTERNS, narrativeAngle, narrativeBeatKinds, narrativeBeatObjective } from '../src/policies/narrativeQualityPolicy';
import { canonicalGuideNarrativeId, COMMON_GUIDE_CONSTRAINTS, guideNarrativeDefinition } from '../src/policies/guideNarrativePolicy';
import { guidePolicy } from '../src/services/guidePolicy';

function run() {
  const dana = guidePolicy('dana');
  const arthur = guidePolicy('artur');
  assert.equal(canonicalGuideNarrativeId('artur'), 'arthur');
  assert.equal(arthur.id, 'arthur');
  assert.deepEqual(dana.behavior, [...COMMON_GUIDE_CONSTRAINTS,
    'Contemporary, curious, conversational, lightly eccentric and playful; never theatrical.',
    'Notice human and local details; connect past and present with short spoken sentences.',
    'Prefer a concrete observation, a surprising reveal and a grounded contrast. Avoid museum-guide vocabulary.']);
  assert.deepEqual(arthur.behavior, [...COMMON_GUIDE_CONSTRAINTS,
    'Calm, precise, observant and restrained; slightly more formal than Dana, never a theatrical professor.',
    'Explain historical and architectural causality using only established evidence.',
    'Distinguish the site from the current building. One precise detail and its meaning, not dense chronology.']);
  assert.deepEqual(dana.preferredBeats, ['attention', 'hook', 'reveal', 'contrast', 'stop']);
  assert.deepEqual(arthur.preferredBeats, ['hook', 'context', 'reveal', 'contrast', 'stop']);
  assert.deepEqual(guideNarrativeDefinition('unknown').preferredBeats, ['attention', 'context', 'reveal', 'stop']);

  assert.deepEqual(NARRATIVE_FORBIDDEN_PATTERNS, [
    '^\\s*(?:I will tell you about|Let me tell you about|This historic building|Я расскажу вам|Позвольте рассказать|Это историческое здание)',
    '^\\s*(?:This iconic attraction|Хорошо[,!]?\\s*(?:давайте|я расскажу))|^.{0,100} is a historic landmark located in',
    '^\\s*(?:Did you know|Знаете ли вы)',
    '^\\s*.{1,80} (?:was built in|был[ао]? построен[ао]? в) \\d{4}',
    '(?:Would you like (?:to hear|to know more|me to tell)|Shall I tell|Рассказать (?:вам )?(?:больше|подробнее)|Хотите (?:узнать|услышать) больше)',
  ]);
  assert.deepEqual(narrativeBeatKinds({preferredBeats:dana.preferredBeats,hasCallback:false,continuation:false,repeatSignature:false}), dana.preferredBeats);
  assert.deepEqual(narrativeBeatKinds({preferredBeats:dana.preferredBeats,hasCallback:false,continuation:false,repeatSignature:true}), ['context','contrast','reveal','stop']);
  assert.deepEqual(narrativeBeatKinds({preferredBeats:dana.preferredBeats,hasCallback:true,continuation:false,repeatSignature:false}), ['callback','context','reveal','stop']);
  assert.equal(narrativeBeatObjective('reveal','long'), 'Add supported context beyond the already-heard reveal.');
  assert.equal(narrativeBeatObjective('reveal','short'), 'Choose one strong factual reveal. Leave other facts for a later detailed story instead of listing all claims.');
  assert.equal(narrativeAngle({continuation:false,city:false,category:'bridge',guideId:'arthur',themeTags:['architecture']}),
    'Engineering significance of a supported structural detail; category=bridge; theme=architecture');
  assert.equal(narrativeAngle({continuation:false,city:false,category:'museum',guideId:'dana',themeTags:[]}),
    'A human-scale reveal connecting past and present; category=museum; theme=mixed');
  console.log('Priority A policy extraction preserves guide and narrative semantics');
}
run();
