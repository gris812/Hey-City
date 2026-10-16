import { runRealtimeVoiceReplay } from '../replay/realtimeVoiceReplay';

void runRealtimeVoiceReplay().then(results => {
  process.stdout.write(`${JSON.stringify({ mode: 'deterministic/provider-mocked', results }, null, 2)}\n`);
  if (results.some(result => !result.passed)) process.exitCode = 1;
}).catch(error => { console.error(error); process.exitCode = 1; });

