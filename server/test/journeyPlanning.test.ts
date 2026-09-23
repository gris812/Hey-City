import assert from 'node:assert/strict';
import { createJourneyState } from '../src/services/journeyContext';
import { normalizeEvidence, InsufficientEvidenceError } from '../src/services/evidence';
import { prepareNarrative } from '../src/services/narrativePlan';

const claims = 'The original building housed the first Congress of the United States. George Washington took the oath here in 1789. The original building was demolished in 1812. The current building opened as a customs house in 1842.';
const evidence = normalizeEvidence({id:'federal',name:'Federal Hall',category:'historical_landmark'}, claims, 'curated');
const input = {poiId:'federal',placeName:'Federal Hall',mode:'walking' as const,guideId:'dana',themeTags:['financial_history'],targetDurationSec:40};
const at = (sec: number) => new Date(sec * 1000).toISOString();

function run() {
  const state = createJourneyState('planning-test');
  state.updateArea({locality:'Financial District',city:'New York',source:'discovery'},at(0));
  const before = prepareNarrative(input,evidence,{level:'auto',language:'en',journey:state.getSnapshot(at(1))});
  assert.equal(before.brief.journey?.callback,undefined);
  assert.deepEqual(before.plan.moment.priorContextRefs,undefined);
  assert.equal(before.brief.journey?.area?.locality,'Financial District');
  assert.equal(JSON.stringify(before.plan).includes('Financial District'),false,'raw area stays server-side');

  state.startStory({momentId:'wall-skip',entityId:'wall',entityName:'Wall Street',level:'auto',startedAt:at(2)});
  state.recordNarration({momentId:'wall-skip',topicKeys:['financial_history'],evidenceRefs:['wall-claim'],at:at(3)});
  state.finishStory({momentId:'wall-skip',reason:'skipped',endedAt:at(4)});
  assert.equal(state.selectCallback({entityId:'federal',topicKeys:['financial_history'],at:at(5)}),undefined);
  assert.equal(prepareNarrative(input,evidence,{level:'auto',language:'en',journey:state.getSnapshot(at(5))}).brief.journey?.callback,undefined);

  state.startStory({momentId:'wall-heard',entityId:'wall',entityName:'Wall Street',level:'auto',startedAt:at(6)});
  state.recordNarration({momentId:'wall-heard',topicKeys:['financial_history'],evidenceRefs:['wall-claim'],at:at(7)});
  state.finishStory({momentId:'wall-heard',reason:'completed',endedAt:at(8)});
  state.selectCallback({entityId:'federal',topicKeys:['financial_history'],at:at(9)});
  const withCallback = prepareNarrative(input,evidence,{level:'auto',language:'en',journey:state.getSnapshot(at(9))});
  assert.equal(withCallback.plan.moment.relationship,'callback');
  assert.deepEqual(withCallback.plan.moment.priorContextRefs,['wall-heard','wall']);
  assert.equal(withCallback.brief.journey?.callback?.sourceEntityName,'Wall Street');
  assert(!JSON.stringify(withCallback.plan).includes('wall-claim'),'previous evidence text stays outside public plan');

  state.startStory({momentId:'federal-heard',entityId:'federal',entityName:'Federal Hall',level:'auto',startedAt:at(10)});
  state.recordNarration({momentId:'federal-heard',topicKeys:['financial_history','historical_landmark'],
    evidenceRefs:evidence.items.map(item=>item.id),at:at(11)});
  state.finishStory({momentId:'federal-heard',reason:'completed',endedAt:at(12)});
  assert.throws(()=>prepareNarrative(input,evidence,{level:'auto',language:'en',journey:state.getSnapshot(at(13))}),InsufficientEvidenceError,
    'revisited automatic story does not repeat exhausted evidence');
  assert.ok(prepareNarrative(input,evidence,{level:'short',language:'en',journey:state.getSnapshot(at(13))}).brief.selectedEvidenceRefs.length,
    'explicit replay remains a valid user choice');

  const otherInput = {...input,poiId:'other',placeName:'Other Hall',themeTags:['architecture']};
  const otherEvidence = normalizeEvidence({id:'other',name:'Other Hall',category:'historical_landmark'},claims,'curated');
  const firstShape = prepareNarrative(otherInput,otherEvidence,{level:'auto',language:'en',journey:state.getSnapshot(at(14))});
  const signature = `dana:${firstShape.plan.moment.relationship}:${firstShape.plan.moment.intent}:${firstShape.brief.beats.map(beat=>beat.kind).join(',')}`;
  state.startStory({momentId:'shape',entityId:'shape-source',entityName:'Shape Source',level:'auto',startedAt:at(15)});
  state.recordNarration({momentId:'shape',topicKeys:['unrelated'],evidenceRefs:['shape-claim'],narrativeSignature:signature,at:at(16)});
  state.finishStory({momentId:'shape',reason:'completed',endedAt:at(17)});
  const variedShape = prepareNarrative(otherInput,otherEvidence,{level:'auto',language:'en',journey:state.getSnapshot(at(18))});
  assert.notDeepEqual(variedShape.brief.beats.map(beat=>beat.kind),firstShape.brief.beats.map(beat=>beat.kind),
    'consecutive compatible moments rotate beat shape without a model planning call');
  console.log('M2 journey planning: grounded callback and automatic evidence anti-repeat passed');
}
run();
