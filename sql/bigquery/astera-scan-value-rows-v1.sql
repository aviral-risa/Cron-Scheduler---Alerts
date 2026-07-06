-- Scan value rows for @report_date (IST) — final outcomes only, no date_of_work double-count.
-- One row per order outcome; assignee = who was assigned at outcome time.
-- Parameters: @report_date DATE, @org_id STRING

WITH params AS (
  SELECT @report_date AS report_date, @org_id AS org_id
),
latest_order AS (
  SELECT * EXCEPT (_cdc_rank, _change_type)
  FROM (
    SELECT t.*, datastream_metadata.change_type AS _change_type,
      ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY datastream_metadata.source_timestamp DESC,
        datastream_metadata.change_sequence_number DESC, datastream_metadata.uuid DESC) AS _cdc_rank
    FROM `prior--backen-prod-svc-u4g8.medical_pa_prod_med_onc.medical_pa_order` AS t
    WHERE t.org_id = @org_id
  )
  WHERE _cdc_rank = 1 AND COALESCE(_change_type, '') != 'DELETE'
),
status_events AS (
  SELECT
    t.order_id,
    DATE(TIMESTAMP_MILLIS(t.datastream_metadata.source_timestamp), 'Asia/Kolkata') AS event_date,
    TIMESTAMP_MILLIS(t.datastream_metadata.source_timestamp) AS event_ts,
    LOWER(TRIM(COALESCE(t.master_auth_status, ''))) AS auth_status,
    LAG(LOWER(TRIM(COALESCE(t.master_auth_status, '')))) OVER (
      PARTITION BY t.order_id ORDER BY t.datastream_metadata.source_timestamp
    ) AS prev_auth
  FROM `prior--backen-prod-svc-u4g8.medical_pa_prod_med_onc.medical_pa_order_status` AS t
  WHERE t.org_id = @org_id AND COALESCE(t.datastream_metadata.change_type, '') != 'DELETE'
),
status_outcomes AS (
  SELECT order_id, event_ts, 'auth_by_risa' AS outcome_type
  FROM status_events AS e
  CROSS JOIN params AS p
  WHERE e.event_date = p.report_date
    AND e.auth_status = 'auth_by_risa'
    AND COALESCE(e.prev_auth, '') != 'auth_by_risa'
  UNION ALL
  SELECT order_id, event_ts, 'nar'
  FROM status_events AS e
  CROSS JOIN params AS p
  WHERE e.event_date = p.report_date
    AND e.auth_status = 'no_auth_required'
    AND COALESCE(e.prev_auth, '') != 'no_auth_required'
  UNION ALL
  SELECT order_id, event_ts, 'denied_by_risa'
  FROM status_events AS e
  CROSS JOIN params AS p
  WHERE e.event_date = p.report_date
    AND e.auth_status IN ('denial_by_risa', 'denied_by_risa')
    AND COALESCE(e.prev_auth, '') NOT IN ('denial_by_risa', 'denied_by_risa')
),
denial_comments AS (
  SELECT c.order_id, c.created_at AS event_ts, 'denial' AS outcome_type
  FROM (
    SELECT * EXCEPT (_cdc_rank, _change_type) FROM (
      SELECT t.*, datastream_metadata.change_type AS _change_type,
        ROW_NUMBER() OVER (PARTITION BY id ORDER BY datastream_metadata.source_timestamp DESC,
          datastream_metadata.change_sequence_number DESC, datastream_metadata.uuid DESC) AS _cdc_rank
      FROM `prior--backen-prod-svc-u4g8.medical_pa_prod_med_onc.auth_status_comments` AS t
      WHERE t.org_id = @org_id
    ) WHERE _cdc_rank = 1 AND COALESCE(_change_type, '') != 'DELETE'
  ) AS c
  CROSS JOIN params AS p
  WHERE LOWER(TRIM(c.comment_type)) = 'denial'
    AND DATE(c.created_at, 'Asia/Kolkata') = p.report_date
),
all_outcomes AS (
  SELECT * FROM status_outcomes
  UNION ALL
  SELECT order_id, event_ts, outcome_type FROM denial_comments
),
assignee_at_outcome AS (
  SELECT
    ao.order_id,
    ao.outcome_type,
    ao.event_ts,
    t.assigned_to_name AS assignee
  FROM all_outcomes AS ao
  JOIN `prior--backen-prod-svc-u4g8.medical_pa_prod_med_onc.medical_pa_order` AS t
    ON t.order_id = ao.order_id
   AND TIMESTAMP_MILLIS(t.datastream_metadata.source_timestamp) <= ao.event_ts
  WHERE COALESCE(t.datastream_metadata.change_type, '') != 'DELETE'
  QUALIFY ROW_NUMBER() OVER (
    PARTITION BY ao.order_id, ao.outcome_type, ao.event_ts
    ORDER BY t.datastream_metadata.source_timestamp DESC
  ) = 1
)
SELECT
  ao.outcome_type AS row_type,
  o.regimen_name,
  aa.assignee
FROM all_outcomes AS ao
JOIN latest_order AS o ON o.order_id = ao.order_id
LEFT JOIN assignee_at_outcome AS aa
  ON aa.order_id = ao.order_id
 AND aa.outcome_type = ao.outcome_type
 AND aa.event_ts = ao.event_ts;
