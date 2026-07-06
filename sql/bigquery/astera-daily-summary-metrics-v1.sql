-- Astera Daily Summary Metrics V2
-- Creation cohort (orders created @report_date IST), current status as-of sync.
-- First pass approval: auth / (auth + denials), pending excluded from denominator.
-- Denials: denial comment OR current denied_by_risa status (count once per order).
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
auth_comments AS (
  SELECT * EXCEPT (_cdc_rank, _change_type)
  FROM (
    SELECT t.*, datastream_metadata.change_type AS _change_type,
      ROW_NUMBER() OVER (PARTITION BY id ORDER BY datastream_metadata.source_timestamp DESC,
        datastream_metadata.change_sequence_number DESC, datastream_metadata.uuid DESC) AS _cdc_rank
    FROM `prior--backen-prod-svc-u4g8.medical_pa_prod_med_onc.auth_status_comments` AS t
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
    LOWER(TRIM(COALESCE(s.master_auth_status, ''))) AS auth_status
  FROM latest_order AS o
  LEFT JOIN latest_status AS s ON s.order_id = o.order_id
  LEFT JOIN latest_demo AS d ON d.order_id = o.order_id
  CROSS JOIN params AS p
  WHERE DATE(o.created_at, 'Asia/Kolkata') = p.report_date
),
orders_with_denial_comment AS (
  SELECT DISTINCT c.order_id
  FROM auth_comments AS c
  JOIN orders_on_day AS od ON od.order_id = c.order_id
  WHERE LOWER(TRIM(c.comment_type)) = 'denial'
),
cohort_outcomes AS (
  SELECT
    od.order_id,
    od.auth_status,
    (
      od.auth_status IN ('denial_by_risa', 'denied_by_risa')
      OR dwc.order_id IS NOT NULL
    ) AS is_denial
  FROM orders_on_day AS od
  LEFT JOIN orders_with_denial_comment AS dwc ON dwc.order_id = od.order_id
),
day_agg AS (
  SELECT
    COUNT(*) AS cases_added,
    COUNT(DISTINCT CONCAT(COALESCE(regimen_name, ''), '|', mrn, '|', COALESCE(CAST(date_of_service AS STRING), ''))) AS unique_cases_added,
    COUNTIF(LOWER(TRIM(COALESCE(assigned_to_name, ''))) NOT IN ('', 'unassigned')) AS allotted_cases,
    STRING_AGG(DISTINCT IF(LOWER(TRIM(COALESCE(assigned_to_name, ''))) IN ('', 'unassigned'), mrn, NULL), ', ') AS non_allotted_mrns
  FROM orders_on_day
),
outcome_agg AS (
  SELECT
    COUNTIF(auth_status = 'auth_by_risa') AS auth_by_risa_count,
    COUNTIF(auth_status = 'no_auth_required') AS nar_count,
    COUNTIF(auth_status = 'pending') AS auth_pending_count,
    COUNTIF(is_denial) AS denial_count
  FROM cohort_outcomes
)
SELECT
  p.report_date,
  p.org_id,
  d.cases_added,
  d.unique_cases_added,
  ROUND(SAFE_DIVIDE(d.allotted_cases, NULLIF(d.cases_added, 0)) * 100, 1) AS allotted_cases_pct,
  d.non_allotted_mrns,
  o.auth_by_risa_count,
  o.nar_count,
  o.auth_pending_count,
  o.denial_count,
  ROUND(
    SAFE_DIVIDE(o.auth_by_risa_count, NULLIF(o.auth_by_risa_count + o.denial_count, 0)) * 100,
    1
  ) AS first_pass_approval_rate_pct
FROM params AS p
CROSS JOIN day_agg AS d
CROSS JOIN outcome_agg AS o;
