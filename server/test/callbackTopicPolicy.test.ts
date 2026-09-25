import assert from 'node:assert/strict';
import { CALLBACK_TOPIC_RULES, callbackTopicsForEvidence } from '../src/policies/callbackTopicPolicy';

function run(): void {
  assert.deepEqual(
    CALLBACK_TOPIC_RULES.map(rule => rule.key),
    ['financial_history', 'civic_history', 'bridge_engineering', 'architectural_style'],
    'callback topic catalog remains explicit and centrally editable'
  );

  assert.deepEqual(
    callbackTopicsForEvidence('historical_landmark', ['The building later served as the U.S. Treasury and customs house.']),
    ['financial_history']
  );
  assert.deepEqual(
    callbackTopicsForEvidence('historical_landmark', ['Congress met here and the site later became a civic landmark.']),
    ['civic_history']
  );
  assert.deepEqual(
    callbackTopicsForEvidence('bridge', ['Its suspension span relied on steel cables and structural engineering.']),
    ['bridge_engineering']
  );
  assert.deepEqual(
    callbackTopicsForEvidence('museum', ['The facade is a Beaux-Arts composition.']),
    ['architectural_style']
  );
  assert.deepEqual(
    callbackTopicsForEvidence('historical_landmark', ['This is an important history site.']),
    [],
    'broad history wording alone never creates a callback topic'
  );
  assert.deepEqual(
    callbackTopicsForEvidence('museum', ['Its suspension cables were an engineering achievement.']),
    [],
    'category-gated bridge engineering topic does not leak to other categories'
  );

  console.log('callback topic policy tests passed');
}

run();
