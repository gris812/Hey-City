import assert from 'node:assert/strict';
import {randomEntities,blindPair,validateReview,nearbyEntities} from './narrativeBenchmark';
async function run(){
  const a=randomEntities(20261109);assert.deepEqual(a,randomEntities(20261109));assert.notDeepEqual(a,randomEntities(123));
  assert.equal(a.length,10);assert.equal(new Set(a.map(x=>x.candidate.providerId)).size,10);assert(new Set(a.map(x=>x.region)).size>=5);
  assert(a.some(x=>x.evidenceStratum==='sparse'));assert(a.some(x=>x.candidate.targetType!=='city'));
  assert.deepEqual(blindPair('first','second',44),blindPair('first','second',44));
  assert(new Set(Array.from({length:20},(_,i)=>blindPair('first','second',i).mapping.A)).size===2,'answer order varies reproducibly');
  assert.equal(validateReview({scores:{engagement:30,spoken:25,relevance:20,discovery:15,coherence:10},factuality:'uncertain',safety:'pass'}),100,'numeric score does not bypass independent gates');
  assert.throws(()=>validateReview({scores:{engagement:100},factuality:'pass',safety:'pass'}));
  await assert.rejects(nearbyEntities(NaN,0,1),/Explicit valid/);
  console.log('seeded stratified sampling, blind order, fixed rubric/gates and explicit-coordinate regression passed');
}
void run().catch(e=>{console.error(e);process.exitCode=1;});
