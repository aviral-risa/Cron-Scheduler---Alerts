-- Astera Daily Summary Metrics V1
-- One row per @report_date (IST) for Google Sheets dashboard.
-- Outcome counts (auth/NAR/pending/denials) are scoped to orders created that day only.
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
orders_on_day AS (
  SELECT
    o.order_id,
    COALESCE(d.patient_id, o.patient_id) AS mrn,
    o.regimen_name,
    o.date_of_service,
    o.assigned_to_name,
    LOWER(TRIM(COALESCE(s.master_auth_status, ''))) AS auth_status,
    s.date_of_work
  FROM latest_order AS o
  LEFT JOIN latest_status AS s ON s.order_id = o.order_id
  LEFT JOIN latest_demo AS d ON d.order_id = o.order_id
  CROSS JOIN params AS p
  WHERE DATE(o.created_at, 'Asia/Kolkata') = p.report_date
),
status_events AS (
  SELECT
    t.order_id,
    DATE(TIMESTAMP_MILLIS(t.datastream_metadata.source_timestamp), 'Asia/Kolkata') AS event_date,
    LOWER(TRIM(COALESCE(t.master_auth_status, ''))) AS auth_status,
    LAG(LOWER(TRIM(COALESCE(t.master_auth_status, '')))) OVER (
      PARTITION BY t.order_id ORDER BY t.datastream_metadata.source_timestamp
    ) AS prev_auth
  FROM `prior--backen-prod-svc-u4g8.medical_pa_prod_med_onc.medical_pa_order_status` AS t
  WHERE t.org_id = @org_id AND COALESCE(t.datastream_metadata.change_type, '') != 'DELETE'
),
auth_by_risa_on_day AS (
  SELECT COUNT(DISTINCT e.order_id) AS cnt
  FROM status_events AS e
  JOIN orders_on_day AS o ON o.order_id = e.order_id
  CROSS JOIN params AS p
  WHERE e.event_date = p.report_date
    AND e.auth_status = 'auth_by_risa'
    AND COALESCE(e.prev_auth, '') != 'auth_by_risa'
),
nar_on_day AS (
  SELECT COUNT(DISTINCT e.order_id) AS cnt
  FROM status_events AS e
  JOIN orders_on_day AS o ON o.order_id = e.order_id
  CROSS JOIN params AS p
  WHERE e.event_date = p.report_date
    AND e.auth_status = 'no_auth_required'
    AND COALESCE(e.prev_auth, '') != 'no_auth_required'
),
pending_among_added AS (
  SELECT COUNT(DISTINCT o.order_id) AS cnt
  FROM orders_on_day AS o
  WHERE o.auth_status = 'pending'
),
denials_on_day AS (
  SELECT
    c.order_id,
    COALESCE(d.patient_id, o.patient_id) AS mrn,
    o.regimen_name
  FROM (
    SELECT * EXCEPT (_cdc_rank, _change_type) FROM (
      SELECT t.*, datastream_metadata.change_type AS _change_type,
        ROW_NUMBER() OVER (PARTITION BY id ORDER BY datastream_metadata.source_timestamp DESC,
          datastream_metadata.change_sequence_number DESC, datastream_metadata.uuid DESC) AS _cdc_rank
      FROM `prior--backen-prod-svc-u4g8.medical_pa_prod_med_onc.auth_status_comments` AS t
      WHERE t.org_id = @org_id
    ) WHERE _cdc_rank = 1 AND COALESCE(_change_type, '') != 'DELETE'
  ) AS c
  JOIN latest_order AS o ON o.order_id = c.order_id
  JOIN orders_on_day AS od ON od.order_id = c.order_id
  LEFT JOIN latest_demo AS d ON d.order_id = o.order_id
  CROSS JOIN params AS p
  WHERE LOWER(TRIM(c.comment_type)) = 'denial'
    AND DATE(c.created_at, 'Asia/Kolkata') = p.report_date
),
denied_by_risa_on_day AS (
  SELECT COUNT(DISTINCT e.order_id) AS cnt
  FROM status_events AS e
  JOIN orders_on_day AS o ON o.order_id = e.order_id
  CROSS JOIN params AS p
  WHERE e.event_date = p.report_date
    AND e.auth_status IN ('denial_by_risa', 'denied_by_risa')
    AND COALESCE(e.prev_auth, '') NOT IN ('denial_by_risa', 'denied_by_risa')
),
day_agg AS (
  SELECT
    COUNT(*) AS cases_added,
    COUNT(DISTINCT CONCAT(COALESCE(regimen_name, ''), '|', mrn, '|', COALESCE(CAST(date_of_service AS STRING), ''))) AS unique_cases_added,
    COUNTIF(LOWER(TRIM(COALESCE(assigned_to_name, ''))) NOT IN ('', 'unassigned')) AS allotted_cases,
    STRING_AGG(DISTINCT IF(LOWER(TRIM(COALESCE(assigned_to_name, ''))) IN ('', 'unassigned'), mrn, NULL), ', ') AS non_allotted_mrns
  FROM orders_on_day
)
SELECT
  p.report_date,
  p.org_id,
  d.cases_added,
  d.unique_cases_added,
  ROUND(SAFE_DIVIDE(d.allotted_cases, NULLIF(d.cases_added, 0)) * 100, 1) AS allotted_cases_pct,
  d.non_allotted_mrns,
  a.cnt AS auth_by_risa_count,
  n.cnt AS nar_count,
  ps.cnt AS auth_pending_count,
  (SELECT COUNT(*) FROM denials_on_day) AS denial_count,
  ROUND(
    SAFE_DIVIDE(a.cnt, NULLIF(a.cnt + dr.cnt, 0)) * 100,
    1
  ) AS first_pass_approval_rate_pct,
  dr.cnt AS denied_by_risa_count
FROM params AS p
CROSS JOIN day_agg AS d
CROSS JOIN auth_by_risa_on_day AS a
CROSS JOIN nar_on_day AS n
CROSS JOIN pending_among_added AS ps
CROSS JOIN denied_by_risa_on_day AS dr;
