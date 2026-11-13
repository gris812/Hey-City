/** One independent human evaluator; fixed blind rubric, explicit gates, baseline delta. No model-as-truth. */
import { readFile, writeFile } from 'node:fs/promises';
import { validateReview } from './narrativeBenchmark';
async function run(){
  const [runPath,reviewPath,baselinePath]=process.argv.slice(2);
  if(!runPath||!reviewPath)throw new Error('Usage: review RUN.json REVIEW.json [ACCEPTED_BASELINE.json]');
  const run=JSON.parse(await readFile(runPath,'utf8'));const review=JSON.parse(await readFile(reviewPath,'utf8'));
  if(typeof review.evaluator!=='string'||!review.evaluator.trim()||review.rubricVersion!==run.rubric.version||review.blind!==true)throw new Error('One named independent blind evaluator and matching fixed rubric required');
  const results=[];
  for(const row of run.results)for(const pair of row.comparisons??[]){
    const id=`${row.entityId}:${pair.condition}`;const item=review.pairs?.find((r:{id:string})=>r.id===id);
    if(!item)throw new Error(`Missing blind review ${id}`);
    for(const label of ['A','B']){
      const assessed=item[label];const score=validateReview(assessed);
      results.push({id,system:pair.mapping[label],score,factuality:assessed.factuality,safety:assessed.safety,rationale:String(assessed.rationale??'').slice(0,2000)});
    }
  }
  if(!results.length)throw new Error('No actual generated comparisons to evaluate');
  const summary:any={sourceSha:run.sourceSha,seed:run.seed,rubricVersion:run.rubric.version,evaluator:review.evaluator,results,
    status:results.some(r=>r.factuality!=='pass'||r.safety!=='pass')?'GATE_FAILURE_OR_REVIEW_REQUIRED':'GATES_PASSED_ACCEPTANCE_REQUIRES_HUMAN_SIGNOFF',
    bias:'Single evaluator may favor a style/language. Order randomized and identities withheld; human can dispute/review scores. Numerical win alone never establishes acceptance.'};
  if(baselinePath){const baseline=JSON.parse(await readFile(baselinePath,'utf8'));if(baseline.accepted!==true||baseline.rubricVersion!==summary.rubricVersion)throw new Error('Baseline must be explicitly accepted with same rubric');
    summary.baselineDeltas=results.flatMap(r=>{const old=baseline.results?.find((b:any)=>b.id===r.id&&b.system===r.system);return old?[{id:r.id,system:r.system,delta:r.score-old.score}]:[];});}
  await writeFile(runPath.replace(/\.json$/,'')+'.reviewed.json',JSON.stringify(summary,null,2)+'\n');console.log(summary.status);
}
void run().catch(e=>{console.error(e.message);process.exitCode=1;});
