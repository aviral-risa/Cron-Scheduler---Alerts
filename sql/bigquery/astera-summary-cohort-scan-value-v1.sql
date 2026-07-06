-- Scan value rows for creation cohort @report_date — current status as-of sync.
-- Used by daily SUMMARY tab only (assignee tab uses calendar-day outcomes).
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
    o.regimen_name,
    o.assigned_to_name,
    LOWER(TRIM(COALESCE(s.master_auth_status, ''))) AS auth_status
  FROM latest_order AS o
  LEFT JOIN latest_status AS s ON s.order_id = o.order_id
  CROSS JOIN params AS p
  WHERE DATE(o.created_at, 'Asia/Kolkata') = p.report_date
),
orders_with_denial_comment AS (
  SELECT DISTINCT c.order_id
  FROM auth_comments AS c
  JOIN orders_on_day AS od ON od.order_id = c.order_id
  WHERE LOWER(TRIM(c.comment_type)) = 'denial'
)
SELECT
  CASE
    WHEN od.auth_status = 'auth_by_risa' THEN 'auth_by_risa'
    WHEN od.auth_status = 'no_auth_required' THEN 'nar'
    WHEN od.auth_status IN ('denial_by_risa', 'denied_by_risa') OR dwc.order_id IS NOT NULL THEN 'denial'
    ELSE NULL
  END AS row_type,
  od.regimen_name,
  od.assigned_to_name AS assignee
FROM orders_on_day AS od
LEFT JOIN orders_with_denial_comment AS dwc ON dwc.order_id = od.order_id
WHERE
  od.auth_status = 'auth_by_risa'
  OR od.auth_status = 'no_auth_required'
  OR od.auth_status IN ('denial_by_risa', 'denied_by_risa')
  OR dwc.order_id IS NOT NULL;
