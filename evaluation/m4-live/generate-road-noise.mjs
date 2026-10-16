import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const sampleRate = 16_000;
const durationSeconds = 12;
const sampleCount = sampleRate * durationSeconds;
const pcm = Buffer.alloc(sampleCount * 2);
let seed = 0x48435931;
let low = 0;

for (let index = 0; index < sampleCount; index += 1) {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  const white = (seed / 0xffffffff) * 2 - 1;
  low = low * 0.985 + white * 0.015;
  const seconds = index / sampleRate;
  const tire = Math.sin(2 * Math.PI * 87 * seconds) * 0.08;
  const engine = Math.sin(2 * Math.PI * 43 * seconds) * 0.06;
  const envelope = Math.min(1, seconds / 0.25, (durationSeconds - seconds) / 0.25);
  const value = Math.max(-1, Math.min(1, (white * 0.12 + low * 1.1 + tire + engine) * envelope));
  pcm.writeInt16LE(Math.round(value * 32767), index * 2);
}

const wav = Buffer.alloc(44 + pcm.length);
wav.write('RIFF', 0);
wav.writeUInt32LE(36 + pcm.length, 4);
wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(sampleRate, 24);
wav.writeUInt32LE(sampleRate * 2, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write('data', 36);
wav.writeUInt32LE(pcm.length, 40);
pcm.copy(wav, 44);

const output = resolve(process.argv[2] || 'mobile/assets/m4-road-noise-v1.wav');
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, wav);
process.stdout.write(`${output}\n`);
