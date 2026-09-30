import { pathToFileURL } from 'node:url';
import {
  runRealtimeBenchmark,
  type RealtimeBenchmarkDriver,
  type RealtimeBenchmarkEnvironment,
} from '../benchmark/realtimeVoiceBenchmark';

interface LiveDriverModule {
  createDrivers(): Promise<RealtimeBenchmarkDriver[]> | RealtimeBenchmarkDriver[];
  environment: RealtimeBenchmarkEnvironment;
}

async function main(): Promise<void> {
  const missing = [
    !process.env.OPENAI_API_KEY && 'OPENAI_API_KEY',
    !(process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY) && 'GEMINI_API_KEY',
    !process.env.M4_LIVE_BENCHMARK_DRIVER && 'M4_LIVE_BENCHMARK_DRIVER',
  ].filter(Boolean);
  if (missing.length) {
    process.stdout.write(`${JSON.stringify({
      status: 'BLOCKED',
      mode: 'live',
      reason: 'missing_live_benchmark_configuration',
      missing,
      note: 'Deterministic R1-R6 remains independent of paid provider credentials.',
    }, null, 2)}\n`);
    process.exitCode = 2;
    return;
  }

  const modulePath = pathToFileURL(process.env.M4_LIVE_BENCHMARK_DRIVER!).href;
  const loaded = await import(modulePath) as LiveDriverModule;
  if (typeof loaded.createDrivers !== 'function' || !loaded.environment || loaded.environment.mode === 'deterministic') {
    throw new Error('Live benchmark driver must export createDrivers() and a lab-live/field-live environment');
  }
  const drivers = await loaded.createDrivers();
  const providers = new Set(drivers.map(driver => driver.provider));
  if (!providers.has('openai_realtime') || !providers.has('gemini_live')) {
    throw new Error('Live benchmark driver must provide both OpenAI Realtime and Gemini Live');
  }
  const report = await runRealtimeBenchmark(drivers, loaded.environment);
  process.stdout.write(`${JSON.stringify({ status: report.comparable ? 'PASS' : 'FAIL', report }, null, 2)}\n`);
  if (!report.comparable) process.exitCode = 1;
}

void main().catch(error => { console.error(error); process.exitCode = 1; });

