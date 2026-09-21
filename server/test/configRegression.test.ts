import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { aheadDiscovery, openAITextPricing, openai } from '../src/config';

async function run() {
  assert.deepEqual(openAITextPricing('gpt-5.6-luna'), { inputUsdPerMillion: 0.2, outputUsdPerMillion: 1.2 });
  if (!process.env.OPENAI_TEXT_MODEL) assert.equal(openai.textModel, 'gpt-5.6-luna');
  if (!process.env.DISCOVERY_KNOWLEDGE_TIMEOUT_MS) assert.equal(aheadDiscovery.knowledgeTimeoutMs, 10000);
  for (const file of ['../.env.example', '../../ops/production.env.example', '../../ops/bootstrap-production-env.sh']) {
    const source = await readFile(resolve(__dirname, file), 'utf8');
    assert.match(source, /OPENAI_TEXT_MODEL=gpt-5\.6-luna/);
    assert.match(source, /OPENAI_TEXT_INPUT_USD_PER_MILLION=0\.20/);
    assert.match(source, /OPENAI_TEXT_OUTPUT_USD_PER_MILLION=1\.20/);
  }
  console.log('M1 OpenAI model, pricing and deployment examples are consistent');
}

void run().catch(error => { console.error(error); process.exitCode = 1; });
