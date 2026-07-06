-- Astera Assignee View Metrics V1
-- One row per assignee for @report_date (IST). Pre-aggregated CTEs avoid join fan-out.
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
order_cdc AS (
  SELECT
    t.order_id,
    t.assigned_to_name,
    TIMESTAMP_MILLIS(t.datastream_metadata.source_timestamp) AS cdc_ts,
    LAG(LOWER(TRIM(COALESCE(t.assigned_to_name, '')))) OVER (
      PARTITION BY t.order_id ORDER BY t.datastream_metadata.source_timestamp
    ) AS prev_assignee
  FROM `prior--backen-prod-svc-u4g8.medical_pa_prod_med_onc.medical_pa_order` AS t
  WHERE t.org_id = @org_id AND COALESCE(t.datastream_metadata.change_type, '') != 'DELETE'
),
first_allotment AS (
  SELECT
    assigned_to_name AS assignee,
    MIN(DATE(cdc_ts, 'Asia/Kolkata')) AS first_allotted_date
  FROM order_cdc
  WHERE LOWER(TRIM(COALESCE(assigned_to_name, ''))) NOT IN ('', 'unassigned', 'risa agent')
    AND COALESCE(prev_assignee, '') IN ('', 'unassigned')
  GROUP BY assignee
),
assigned_on_day AS (
  SELECT
    o.order_id,
    o.assigned_to_name AS assignee,
    COALESCE(d.patient_id, o.patient_id) AS mrn,
    LOWER(TRIM(COALESCE(s.master_auth_status, ''))) AS auth_status
  FROM latest_order AS o
  JOIN latest_status AS s ON s.order_id = o.order_id
  LEFT JOIN latest_demo AS d ON d.order_id = o.order_id
  CROSS JOIN params AS p
  WHERE DATE(o.created_at, 'Asia/Kolkata') = p.report_date
    AND LOWER(TRIM(COALESCE(o.assigned_to_name, ''))) NOT IN ('', 'unassigned', 'risa agent')
),
assigned_agg AS (
  SELECT
    assignee,
    COUNT(DISTINCT order_id) AS assigned_cases,
    COUNT(DISTINCT IF(auth_status = 'pending', order_id, NULL)) AS followup_cases,
    COUNT(DISTINCT IF(auth_status = 'new', order_id, NULL)) AS unworked_cases_count,
    STRING_AGG(DISTINCT IF(auth_status = 'new', mrn, NULL), ', ') AS unworked_mrns
  FROM assigned_on_day
  GROUP BY assignee
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
assignee_at_event AS (
  SELECT
    se.order_id,
    se.auth_status,
    se.prev_auth,
    se.event_date,
    t.assigned_to_name AS assignee
  FROM status_events AS se
  JOIN `prior--backen-prod-svc-u4g8.medical_pa_prod_med_onc.medical_pa_order` AS t
    ON t.order_id = se.order_id
   AND TIMESTAMP_MILLIS(t.datastream_metadata.source_timestamp) <= se.event_ts
  WHERE COALESCE(t.datastream_metadata.change_type, '') != 'DELETE'
    AND LOWER(TRIM(COALESCE(t.assigned_to_name, ''))) NOT IN ('', 'unassigned', 'risa agent')
  QUALIFY ROW_NUMBER() OVER (
    PARTITION BY se.order_id, se.event_ts
    ORDER BY t.datastream_metadata.source_timestamp DESC
  ) = 1
),
outcome_agg AS (
  SELECT
    ae.assignee,
    COUNT(DISTINCT IF(
      ae.auth_status = 'auth_by_risa' AND ae.event_date = p.report_date
        AND COALESCE(ae.prev_auth, '') != 'auth_by_risa',
      ae.order_id, NULL)) AS auth_by_risa_count,
    COUNT(DISTINCT IF(
      ae.auth_status = 'no_auth_required' AND ae.event_date = p.report_date
        AND COALESCE(ae.prev_auth, '') != 'no_auth_required',
      ae.order_id, NULL)) AS nar_count,
    COUNT(DISTINCT IF(
      ae.auth_status IN ('denial_by_risa', 'denied_by_risa') AND ae.event_date = p.report_date
        AND COALESCE(ae.prev_auth, '') NOT IN ('denial_by_risa', 'denied_by_risa'),
      ae.order_id, NULL)) AS denied_by_risa_count
  FROM assignee_at_event AS ae
  CROSS JOIN params AS p
  GROUP BY ae.assignee
),
wip_agg AS (
  SELECT
    ae.assignee,
    COUNT(DISTINCT ae.order_id) AS moved_to_wip_count
  FROM assignee_at_event AS ae
  CROSS JOIN params AS p
  WHERE ae.event_date = p.report_date
    AND ae.auth_status = 'work_in_progress'
    AND COALESCE(ae.prev_auth, '') != 'work_in_progress'
  GROUP BY ae.assignee
),
assignee_base AS (
  SELECT assignee FROM assigned_agg
  UNION DISTINCT
  SELECT assignee FROM outcome_agg
  UNION DISTINCT
  SELECT assignee FROM wip_agg
)
SELECT
  p.report_date,
  ab.assignee,
  FORMAT_DATE('%Y-%m-%d', fa.first_allotted_date) AS first_allotted_date,
  COALESCE(aa.assigned_cases, 0) AS assigned_cases,
  COALESCE(aa.followup_cases, 0) AS followup_cases,
  COALESCE(oa.auth_by_risa_count, 0) AS auth_by_risa_count,
  COALESCE(oa.nar_count, 0) AS nar_count,
  COALESCE(oa.denied_by_risa_count, 0) AS denied_by_risa_count,
  COALESCE(aa.unworked_cases_count, 0) AS unworked_cases_count,
  COALESCE(wa.moved_to_wip_count, 0) AS moved_to_wip_count,
  aa.unworked_mrns
FROM assignee_base AS ab
CROSS JOIN params AS p
LEFT JOIN first_allotment AS fa ON fa.assignee = ab.assignee
LEFT JOIN assigned_agg AS aa ON aa.assignee = ab.assignee
LEFT JOIN outcome_agg AS oa ON oa.assignee = ab.assignee
LEFT JOIN wip_agg AS wa ON wa.assignee = ab.assignee
ORDER BY ab.assignee;
