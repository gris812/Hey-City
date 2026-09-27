import assert from 'node:assert/strict';
import { runConversationReplay } from '../src/replay/conversationReplay';

async function run(): Promise<void> {
  const results = await runConversationReplay();
  assert.deepEqual(results.map(result => result.id), ['R1', 'R2', 'R3', 'R4', 'R5']);
  for (const result of results) assert.equal(result.passed, true, `${result.id}: ${result.assertions.join(', ')}`);
  console.log('conversation replay R1–R5 passed');
}

void run().catch(error => { console.error(error); process.exitCode = 1; });
