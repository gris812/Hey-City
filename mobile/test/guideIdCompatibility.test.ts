import assert from 'node:assert/strict';
import {
  fromBackendGuideId,
  normalizeGuideId,
  toDriveBackendVoiceId,
} from '../src/localization/guideIds';

assert.equal(normalizeGuideId('arthur'), 'arthur', 'canonical arthur remains arthur');
assert.equal(normalizeGuideId('artur'), 'arthur', 'legacy artur normalizes to arthur');
assert.equal(normalizeGuideId('unknown'), 'dana', 'unknown guide values fall back to dana');

assert.equal(toDriveBackendVoiceId('arthur'), 'artur', 'Drive API adapter emits legacy backend Arthur id');
assert.equal(toDriveBackendVoiceId('dana'), 'dana', 'Drive API adapter leaves Dana unchanged');

assert.equal(fromBackendGuideId('artur'), 'arthur', 'backend legacy artur maps to mobile arthur');
assert.equal(fromBackendGuideId('arthur'), 'arthur', 'backend canonical arthur maps to mobile arthur');

console.log('guideIdCompatibility tests passed');
