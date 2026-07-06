-- Astera Query Return → Re-allotment List V1
--
-- Cases that returned from query to a workable auth status on @report_date (IST).
-- Includes initial assignee for re-allotment to same person.
--
-- Workable return statuses: auth_required, new, work_in_progress
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
latest_demo AS (
  SELECT * EXCEPT (_cdc_rank, _change_type)
  FROM (
    SELECT t.*, datastream_metadata.change_type AS _change_type,
      ROW_NUMBER() OVER (PARTITION BY id ORDER BY datastream_metadata.source_timestamp DESC,
        datastream_metadata.change_sequence_number DESC, datastream_metadata.uuid DESC) AS _cdc_rank
    FROM `prior--backen-prod-svc-u4g8.medical_pa_prod_med_onc.demographics` AS t
    WHERE t.org_id = @org_id
  )
  WHERE _cdc_rank = 1 AND COALESCE(_change_type, '') != 'DELETE'
),
status_cdc AS (
  SELECT
    t.order_id,
    LOWER(TRIM(COALESCE(t.master_auth_status, ''))) AS auth,
    TIMESTAMP_MILLIS(t.datastream_metadata.source_timestamp) AS cdc_ts,
    LAG(LOWER(TRIM(COALESCE(t.master_auth_status, '')))) OVER (
      PARTITION BY t.order_id
      ORDER BY t.datastream_metadata.source_timestamp
    ) AS prev_auth
  FROM `prior--backen-prod-svc-u4g8.medical_pa_prod_med_onc.medical_pa_order_status` AS t
  WHERE t.org_id = @org_id AND COALESCE(t.datastream_metadata.change_type, '') != 'DELETE'
),
query_returns_on_date AS (
  SELECT
    order_id,
    auth AS returned_to_status,
    cdc_ts AS returned_at
  FROM status_cdc
  CROSS JOIN params AS p
  WHERE prev_auth = 'query'
    AND auth IN ('auth_required', 'new', 'work_in_progress')
    AND DATE(cdc_ts, 'Asia/Kolkata') = p.report_date
),
first_assign AS (
  SELECT
    order_id,
    assigned_to_name AS initial_assignee,
    MIN(cdc_ts) AS assigned_at
  FROM (
    SELECT
      t.order_id,
      t.assigned_to_name,
      TIMESTAMP_MILLIS(t.datastream_metadata.source_timestamp) AS cdc_ts,
      LAG(LOWER(TRIM(COALESCE(t.assigned_to_name, '')))) OVER (
        PARTITION BY t.order_id
        ORDER BY t.datastream_metadata.source_timestamp
      ) AS prev_assignee
    FROM `prior--backen-prod-svc-u4g8.medical_pa_prod_med_onc.medical_pa_order` AS t
    WHERE t.org_id = @org_id AND COALESCE(t.datastream_metadata.change_type, '') != 'DELETE'
  )
  WHERE LOWER(TRIM(COALESCE(assigned_to_name, ''))) NOT IN ('', 'unassigned', 'risa agent')
    AND COALESCE(prev_assignee, '') IN ('', 'unassigned')
  GROUP BY order_id, assigned_to_name
  QUALIFY ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY MIN(cdc_ts)) = 1
),
primary_coverage AS (
  SELECT order_id, payer_name
  FROM (
    SELECT t.order_id, t.payer_name,
      ROW_NUMBER() OVER (PARTITION BY t.order_id ORDER BY t.datastream_metadata.source_timestamp DESC) AS _r
    FROM `prior--backen-prod-svc-u4g8.medical_pa_prod_med_onc.coverage` AS t
    WHERE t.org_id = @org_id AND COALESCE(t.datastream_metadata.change_type, '') != 'DELETE'
      AND NULLIF(TRIM(t.payer_name), '') IS NOT NULL
  )
  WHERE _r = 1
),
denial_cpt AS (
  SELECT order_id, NULLIF(TRIM(j_code), '') AS cpt_code
  FROM (
    SELECT t.order_id, t.j_code,
      ROW_NUMBER() OVER (PARTITION BY t.order_id ORDER BY t.created_at DESC) AS _r
    FROM (
      SELECT * EXCEPT (_cdc_rank, _change_type) FROM (
        SELECT t.*, datastream_metadata.change_type AS _change_type,
          ROW_NUMBER() OVER (PARTITION BY id ORDER BY datastream_metadata.source_timestamp DESC,
            datastream_metadata.change_sequence_number DESC, datastream_metadata.uuid DESC) AS _cdc_rank
        FROM `prior--backen-prod-svc-u4g8.medical_pa_prod_med_onc.auth_status_comments` AS t
        WHERE t.org_id = @org_id
      ) WHERE _cdc_rank = 1 AND COALESCE(_change_type, '') != 'DELETE'
    ) AS t
    WHERE NULLIF(TRIM(t.j_code), '') IS NOT NULL
  )
  WHERE _r = 1
)
SELECT
  o.org_id,
  q.order_id,
  COALESCE(demo.patient_id, o.patient_id) AS mrn,
  q.returned_to_status,
  FORMAT_TIMESTAMP('%Y-%m-%d %H:%M', q.returned_at, 'Asia/Kolkata') AS returned_at_ist,
  fa.initial_assignee,
  o.assigned_to_name AS current_assignee,
  COALESCE(cov.payer_name, 'Unknown') AS payer,
  dc.cpt_code AS cpt
FROM query_returns_on_date AS q
JOIN latest_order AS o ON o.order_id = q.order_id
LEFT JOIN latest_demo AS demo ON demo.order_id = q.order_id
LEFT JOIN first_assign AS fa ON fa.order_id = q.order_id
LEFT JOIN primary_coverage AS cov ON cov.order_id = q.order_id
LEFT JOIN denial_cpt AS dc ON dc.order_id = q.order_id
ORDER BY fa.initial_assignee, mrn;
