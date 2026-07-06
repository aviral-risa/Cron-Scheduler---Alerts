-- Astera Work-In-Progress > 1 Day V1
--
-- Currently in work_in_progress auth status, not completed, latest WIP episode > 1 IST day.
-- Excludes completed workflow / worked orders (fixes stale auth status e.g. MRN 4128638).
--
-- Parameters:
--   @report_date DATE — prior IST day
--   @org_id STRING

WITH params AS (
  SELECT @report_date AS report_date, @org_id AS org_id
),
latest_order AS (
  SELECT * EXCEPT (_cdc_rank, _change_type)
  FROM (
    SELECT
      t.*,
      datastream_metadata.change_type AS _change_type,
      ROW_NUMBER() OVER (
        PARTITION BY order_id
        ORDER BY
          datastream_metadata.source_timestamp DESC,
          datastream_metadata.change_sequence_number DESC,
          datastream_metadata.uuid DESC
      ) AS _cdc_rank
    FROM `prior--backen-prod-svc-u4g8.medical_pa_prod_med_onc.medical_pa_order` AS t
    WHERE t.org_id = @org_id
  )
  WHERE _cdc_rank = 1
    AND COALESCE(_change_type, '') != 'DELETE'
),
latest_status AS (
  SELECT * EXCEPT (_cdc_rank, _change_type)
  FROM (
    SELECT
      t.*,
      datastream_metadata.change_type AS _change_type,
      ROW_NUMBER() OVER (
        PARTITION BY order_id
        ORDER BY
          datastream_metadata.source_timestamp DESC,
          datastream_metadata.change_sequence_number DESC,
          datastream_metadata.uuid DESC
      ) AS _cdc_rank
    FROM `prior--backen-prod-svc-u4g8.medical_pa_prod_med_onc.medical_pa_order_status` AS t
    WHERE t.org_id = @org_id
  )
  WHERE _cdc_rank = 1
    AND COALESCE(_change_type, '') != 'DELETE'
),
latest_demographics AS (
  SELECT * EXCEPT (_cdc_rank, _change_type)
  FROM (
    SELECT
      t.*,
      datastream_metadata.change_type AS _change_type,
      ROW_NUMBER() OVER (
        PARTITION BY id
        ORDER BY
          datastream_metadata.source_timestamp DESC,
          datastream_metadata.change_sequence_number DESC,
          datastream_metadata.uuid DESC
      ) AS _cdc_rank
    FROM `prior--backen-prod-svc-u4g8.medical_pa_prod_med_onc.demographics` AS t
    WHERE t.org_id = @org_id
  )
  WHERE _cdc_rank = 1
    AND COALESCE(_change_type, '') != 'DELETE'
),
status_cdc AS (
  SELECT
    t.order_id,
    LOWER(TRIM(COALESCE(t.master_auth_status, ''))) AS auth_status,
    TIMESTAMP_MILLIS(t.datastream_metadata.source_timestamp) AS cdc_ts,
    LAG(LOWER(TRIM(COALESCE(t.master_auth_status, '')))) OVER (
      PARTITION BY t.order_id
      ORDER BY
        t.datastream_metadata.source_timestamp,
        t.datastream_metadata.change_sequence_number,
        t.datastream_metadata.uuid
    ) AS prev_auth_status
  FROM `prior--backen-prod-svc-u4g8.medical_pa_prod_med_onc.medical_pa_order_status` AS t
  WHERE t.org_id = @org_id
    AND COALESCE(t.datastream_metadata.change_type, '') != 'DELETE'
),
wip_start AS (
  SELECT
    order_id,
    cdc_ts AS wip_started_at
  FROM status_cdc
  WHERE auth_status = 'work_in_progress'
    AND COALESCE(prev_auth_status, '') != 'work_in_progress'
  QUALIFY ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY cdc_ts DESC) = 1
)
SELECT
  o.org_id,
  o.order_id,
  COALESCE(demo.patient_id, o.patient_id) AS mrn,
  o.assigned_to_name AS assigned_to,
  FORMAT_DATE('%Y-%m-%d', DATE(o.created_at, 'Asia/Kolkata')) AS first_created_date,
  FORMAT_DATE('%Y-%m-%d', DATE(w.wip_started_at, 'Asia/Kolkata')) AS first_wip_date,
  DATE_DIFF(p.report_date, DATE(w.wip_started_at, 'Asia/Kolkata'), DAY) AS days_in_wip,
  s.master_auth_status
FROM latest_order AS o
JOIN latest_status AS s
  ON s.order_id = o.order_id
JOIN wip_start AS w
  ON w.order_id = o.order_id
LEFT JOIN latest_demographics AS demo
  ON demo.order_id = o.order_id
CROSS JOIN params AS p
WHERE LOWER(TRIM(COALESCE(s.master_auth_status, ''))) = 'work_in_progress'
  AND COALESCE(s.medical_order_status, '') NOT IN (
    'order_completed_by_agent',
    'order_completed_by_human'
  )
  AND DATE_DIFF(p.report_date, DATE(w.wip_started_at, 'Asia/Kolkata'), DAY) >= 1
ORDER BY days_in_wip DESC, assigned_to, mrn;
