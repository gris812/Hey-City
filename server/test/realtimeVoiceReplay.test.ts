import assert from 'node:assert/strict';
import { runRealtimeVoiceReplay } from '../src/replay/realtimeVoiceReplay';

async function run(): Promise<void> {
  const results = await runRealtimeVoiceReplay();
  assert.deepEqual(results.map(result => result.id), ['R1', 'R2', 'R3', 'R4', 'R5', 'R6']);
  for (const result of results) assert.equal(result.passed, true, `${result.id}: ${result.assertions.join(', ')}`);
  console.log('M4 realtime voice replay R1-R6 passed (deterministic/provider-mocked)');
}

void run().catch(error => { console.error(error); process.exitCode = 1; });

