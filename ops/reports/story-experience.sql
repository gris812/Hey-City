-- Read-only. Run against staging, where existing usage retention bounds the scan.
-- Provider ledger rates are estimates. Text token counts may be provider-reported;
-- TTS token counts are estimates. Unreturned provider usage stays unknown.
WITH prep AS (
  SELECT metadata->>'preparationId' AS id, metadata->>'sourceSha' AS source_sha,
    min(created_at) FILTER (WHERE metadata->>'stage' = 'discovered') AS discovered_at,
    min(created_at) FILTER (WHERE metadata->>'stage' = 'evidence_ready') AS evidence_at,
    min(created_at) FILTER (WHERE metadata->>'stage' = 'eligible') AS eligible_at,
    min(created_at) FILTER (WHERE metadata->>'stage' = 'text_ready') AS text_at,
    min(created_at) FILTER (WHERE metadata->>'stage' = 'audio_preparing') AS audio_started,
    min(created_at) FILTER (WHERE metadata->>'stage' = 'audio_ready') AS audio_at,
    bool_or(metadata->>'stage' = 'insufficient_evidence') AS insufficient,
    bool_or(metadata->>'stage' = 'unknown_evidence') AS evidence_unknown,
    bool_or(metadata->>'stage' = 'reused') AS reused,
    bool_or(metadata->>'stage' = 'expired') AS expired,
    bool_or(metadata->>'cacheHit' = 'true') AS cache_hit
  FROM usage_events WHERE operation = 'story_preparation'
  GROUP BY 1,2
)
SELECT source_sha, count(*) AS discovered, count(evidence_at) AS evidence_ready, count(eligible_at) AS eligible,
  count(text_at) AS text_ready, count(audio_started) AS audio_attempted, count(audio_at) AS audio_ready,
  count(*) FILTER (WHERE insufficient) AS evidence_refused,
  count(*) FILTER (WHERE evidence_unknown) AS evidence_unknown,
  count(*) FILTER (WHERE reused) AS reused, count(*) FILTER (WHERE cache_hit) AS cache_hits,
  count(*) FILTER (WHERE expired AND NOT reused AND text_at IS NOT NULL) AS unused_ready,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM evidence_at - discovered_at)) AS discovery_to_evidence_p50_s,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY extract(epoch FROM evidence_at - discovered_at)) AS discovery_to_evidence_p95_s,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM text_at - discovered_at)) AS discovery_to_text_p50_s,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY extract(epoch FROM text_at - discovered_at)) AS discovery_to_text_p95_s,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM audio_at - discovered_at)) AS discovery_to_audio_p50_s,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY extract(epoch FROM audio_at - discovered_at)) AS discovery_to_audio_p95_s
FROM prep GROUP BY source_sha;

WITH unique_playback AS (
  SELECT DISTINCT ON (metadata->>'momentId') metadata, created_at
  FROM usage_events WHERE operation = 'narrative_stage' AND metadata->>'stage' = 'playback'
    AND metadata->>'status' = 'playing' AND metadata ? 'momentId'
  ORDER BY metadata->>'momentId', created_at
)
SELECT metadata->>'sourceSha' AS source_sha, metadata->>'clientSha' AS client_sha,
  count(*) AS confirmed_starts, count(metadata->>'tellLatencyMs') AS explicit_tell_samples,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY (metadata->>'tellLatencyMs')::numeric) AS tell_to_playing_p50_ms,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY (metadata->>'tellLatencyMs')::numeric) AS tell_to_playing_p95_ms
FROM unique_playback GROUP BY 1,2;

SELECT operation, count(*) AS events,
  count(DISTINCT metadata->>'momentId') FILTER (WHERE metadata->'outcome'->>'completed' = 'true') AS completed,
  count(DISTINCT metadata->>'momentId') FILTER (WHERE metadata->'outcome'->>'skipped' = 'true') AS skipped,
  count(DISTINCT metadata->>'momentId') FILTER (WHERE metadata->'outcome'->>'superseded' = 'true') AS superseded
FROM usage_events WHERE operation IN ('story_offer','story_delivered','story_outcome') GROUP BY operation;

SELECT count(*) AS ratable, count(metadata->>'rating') AS rated,
  count(*) FILTER (WHERE metadata->>'rating' = 'liked') AS liked,
  count(*) FILTER (WHERE metadata->>'rating' = 'disliked') AS disliked
FROM history_items WHERE type = 'poi_listened' AND metadata->>'outcome' = 'completed' AND metadata ? 'artifactId';

WITH reused AS (
  SELECT DISTINCT ON (metadata->>'preparationId') metadata->>'preparationId' AS prep_id, metadata->>'momentId' AS moment_id
  FROM usage_events WHERE operation = 'story_preparation' AND metadata->>'stage' = 'reused' AND metadata ? 'momentId'
  ORDER BY metadata->>'preparationId', created_at
), delivered AS (
  SELECT metadata->>'momentId' AS id, bool_or(metadata ? 'offerId') AS offered
  FROM usage_events WHERE operation = 'story_delivered' GROUP BY 1
), played AS (
  SELECT DISTINCT metadata->>'momentId' AS id
  FROM usage_events WHERE operation = 'narrative_stage' AND metadata->>'stage' = 'playback' AND metadata->>'status' = 'playing'
)
SELECT u.category, u.metadata->>'estimate' = 'true' AS token_counts_estimated,
  count(*) AS provider_usage_records, sum(input_tokens) AS input_tokens, sum(output_tokens) AS output_tokens,
  sum(estimated_cost_usd) FILTER (WHERE d.id IS NULL) AS not_delivered_estimated_usd,
  sum(estimated_cost_usd) FILTER (WHERE d.offered) AS offered_and_delivered_estimated_usd,
  sum(estimated_cost_usd) FILTER (WHERE p.id IS NOT NULL) AS confirmed_started_estimated_usd
FROM usage_events u
LEFT JOIN reused r ON r.prep_id = u.metadata->>'storyCorrelationId'
LEFT JOIN delivered d ON d.id = coalesce(r.moment_id, u.metadata->>'storyCorrelationId')
LEFT JOIN played p ON p.id = d.id
WHERE u.metadata ? 'storyCorrelationId' GROUP BY 1,2;

-- Each phase retains its own class; request-level summaries can overlap phase-level rows.
SELECT metadata->>'sourceSha' AS source_sha, metadata->>'stage' AS stage,
  metadata->>'failureClass' AS failure_class, count(DISTINCT metadata->>'momentId') AS moments
FROM usage_events WHERE operation = 'narrative_stage' AND metadata ? 'failureClass'
GROUP BY 1,2,3 ORDER BY 1,2,3;

SELECT metadata->>'sourceSha' AS source_sha, metadata->>'reuseMode' AS reuse_mode, count(*) AS reuses
FROM usage_events WHERE operation = 'story_preparation' AND metadata->>'stage' = 'reused' GROUP BY 1,2;

SELECT operation, count(*) AS events
FROM usage_events WHERE operation IN ('story_offer', 'story_surfaced') GROUP BY 1;

-- A story may already be ready at first render. Count that case and record zero wait.
WITH surface AS (
  SELECT metadata->>'offerId' AS id, min(created_at) AS surfaced_at
  FROM usage_events WHERE operation = 'story_surfaced' AND metadata->>'offerId' IS NOT NULL GROUP BY 1
), ready AS (
  SELECT metadata->>'offerId' AS id, metadata->>'sourceSha' AS sha,
    min(created_at) FILTER (WHERE metadata->>'stage' = 'text_ready') AS text_at,
    min(created_at) FILTER (WHERE metadata->>'stage' = 'audio_ready') AS audio_at
  FROM usage_events WHERE operation = 'story_preparation' AND metadata->>'offerId' IS NOT NULL GROUP BY 1,2
)
SELECT sha, count(text_at) AS text_samples, count(audio_at) AS audio_samples,
  count(*) FILTER (WHERE audio_at <= surfaced_at) AS already_audio_ready,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY greatest(0, extract(epoch FROM text_at - surfaced_at)))
    FILTER (WHERE text_at IS NOT NULL) AS surfaced_to_text_p50_s,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY greatest(0, extract(epoch FROM audio_at - surfaced_at)))
    FILTER (WHERE audio_at IS NOT NULL) AS surfaced_to_audio_p50_s
FROM surface JOIN ready USING (id) GROUP BY 1;

WITH reuse AS (
  SELECT DISTINCT ON (metadata->>'momentId') metadata->>'momentId' AS id, metadata->>'reuseMode' AS mode
  FROM usage_events WHERE operation = 'story_preparation' AND metadata->>'stage' = 'reused' AND metadata->>'reuseMode' IS NOT NULL
  ORDER BY metadata->>'momentId', created_at
), first_playback AS (
  SELECT DISTINCT ON (metadata->>'momentId') metadata
  FROM usage_events WHERE operation = 'narrative_stage' AND metadata->>'stage' = 'playback'
    AND metadata->>'status' = 'playing' AND metadata ? 'momentId'
  ORDER BY metadata->>'momentId', created_at
)
SELECT metadata->>'sourceSha' AS source_sha, metadata->>'clientSha' AS client_sha,
  coalesce(reuse.mode, 'no_prepared_artifact') AS preparation_mode, count(*) AS samples,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY (metadata->>'tellLatencyMs')::numeric) AS tell_to_playing_p50_ms,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY (metadata->>'tellLatencyMs')::numeric) AS tell_to_playing_p95_ms
FROM first_playback LEFT JOIN reuse ON metadata->>'momentId' = reuse.id
WHERE metadata ? 'tellLatencyMs'
GROUP BY 1,2,3;
