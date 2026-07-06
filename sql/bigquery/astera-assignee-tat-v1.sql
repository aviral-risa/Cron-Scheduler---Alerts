-- Astera Assignee TAT V1
--
-- TAT from auth_required / new episode start → first work (date_of_work), per order worked on @report_date.
-- Query pauses the clock: a new episode starts when returning to auth_required or new from query.
-- End state: first transition after episode start to status outside (auth_required, auth_pending).
--
-- Parameters: @report_date DATE (IST first-worked date), @org_id STRING

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
latest_status AS (
  SELECT * EXCEPT (_cdc_rank, _change_type)
  FROM (
    SELECT t.*, datastream_metadata.change_type AS _change_type,
      ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY datastream_metadata.source_timestamp DESC,
        datastream_metadata.change_sequence_number DESC, datastream_metadata.uuid DESC) AS _cdc_rank
    FROM `prior--backen-prod-svc-u4g8.medical_pa_prod_med_onc.medical_pa_order_status` AS t
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
worked_on_date AS (
  SELECT
    s.order_id,
    s.date_of_work AS work_ts,
    DATE(s.date_of_work, 'Asia/Kolkata') AS first_worked_date
  FROM latest_status AS s
  CROSS JOIN params AS p
  WHERE s.date_of_work IS NOT NULL
    AND DATE(s.date_of_work, 'Asia/Kolkata') = p.report_date
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
episode_starts AS (
  SELECT
    w.order_id,
    w.work_ts,
    w.first_worked_date,
    sc.cdc_ts AS episode_start_ts
  FROM worked_on_date AS w
  JOIN status_cdc AS sc ON sc.order_id = w.order_id
  WHERE sc.auth IN ('auth_required', 'new')
    AND sc.cdc_ts <= w.work_ts
    AND (
      sc.prev_auth = 'query'
      OR COALESCE(sc.prev_auth, '') NOT IN ('auth_required', 'auth_pending', 'new')
    )
  QUALIFY ROW_NUMBER() OVER (PARTITION BY w.order_id ORDER BY sc.cdc_ts DESC) = 1
),
assignee_at_work AS (
  SELECT
    w.order_id,
    t.assigned_to_name AS assignee
  FROM worked_on_date AS w
  JOIN `prior--backen-prod-svc-u4g8.medical_pa_prod_med_onc.medical_pa_order` AS t
    ON t.order_id = w.order_id
   AND TIMESTAMP_MILLIS(t.datastream_metadata.source_timestamp) <= w.work_ts
  WHERE COALESCE(t.datastream_metadata.change_type, '') != 'DELETE'
  QUALIFY ROW_NUMBER() OVER (
    PARTITION BY w.order_id
    ORDER BY t.datastream_metadata.source_timestamp DESC
  ) = 1
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
order_cpt AS (
  SELECT order_id, cpt_code
  FROM (
    SELECT t.order_id, t.cpt_code,
      ROW_NUMBER() OVER (PARTITION BY t.order_id ORDER BY t.performed_date DESC, t.cpt_code) AS _r
    FROM (
      SELECT * EXCEPT (_cdc_rank, _change_type) FROM (
        SELECT t.*, datastream_metadata.change_type AS _change_type,
          ROW_NUMBER() OVER (PARTITION BY id ORDER BY datastream_metadata.source_timestamp DESC,
            datastream_metadata.change_sequence_number DESC, datastream_metadata.uuid DESC) AS _cdc_rank
        FROM `prior--backen-prod-svc-u4g8.medical_pa_prod_med_onc.procedures` AS t
      ) WHERE _cdc_rank = 1 AND COALESCE(_change_type, '') != 'DELETE'
    ) AS t
    WHERE REGEXP_CONTAINS(TRIM(t.cpt_code), r'^\d{5}$')
  )
  WHERE _r = 1
),
comment_cpt AS (
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
  e.first_worked_date,
  COALESCE(aw.assignee, o.assigned_to_name) AS assignee,
  COALESCE(cov.payer_name, 'Unknown') AS payer,
  COALESCE(cc.cpt_code, oc.cpt_code, 'Unknown') AS cpt,
  o.order_id,
  COALESCE(demo.patient_id, o.patient_id) AS mrn,
  FORMAT_TIMESTAMP('%Y-%m-%d %H:%M', e.episode_start_ts, 'Asia/Kolkata') AS episode_started_ist,
  FORMAT_TIMESTAMP('%Y-%m-%d %H:%M', e.work_ts, 'Asia/Kolkata') AS first_worked_ist,
  ROUND(TIMESTAMP_DIFF(e.work_ts, e.episode_start_ts, HOUR) / 24.0, 2) AS tat_days
FROM episode_starts AS e
JOIN latest_order AS o ON o.order_id = e.order_id
LEFT JOIN latest_demo AS demo ON demo.order_id = e.order_id
LEFT JOIN assignee_at_work AS aw ON aw.order_id = e.order_id
LEFT JOIN primary_coverage AS cov ON cov.order_id = e.order_id
LEFT JOIN comment_cpt AS cc ON cc.order_id = e.order_id
LEFT JOIN order_cpt AS oc ON oc.order_id = e.order_id
ORDER BY assignee, payer, cpt, mrn;
