-- Astera Work-In-Progress >= 1 Business Day V1
--
-- Currently in work_in_progress auth status, not completed, latest WIP episode.
-- Business days in WIP: IST staff working days strictly after WIP start through @report_date.
-- Excludes IST weekends, 0% allotment days, and same-day WIP entries (0 business days).
-- Excludes completed workflow / worked orders (fixes stale auth status e.g. MRN 4128638).
--
-- Parameters:
--   @report_date DATE — today IST at run time
--   @org_id STRING
--
-- Staff working day spine: see sql/bigquery/fragments/astera-ist-staff-working-days-cte.sql

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
),
open_wip AS (
  SELECT
    o.org_id,
    o.order_id,
    COALESCE(demo.patient_id, o.patient_id) AS mrn,
    o.assigned_to_name AS assigned_to,
    FORMAT_DATE('%Y-%m-%d', DATE(o.created_at, 'Asia/Kolkata')) AS first_created_date,
    w.wip_started_at,
    DATE(w.wip_started_at, 'Asia/Kolkata') AS wip_start_date,
    s.master_auth_status
  FROM latest_order AS o
  JOIN latest_status AS s
    ON s.order_id = o.order_id
  JOIN wip_start AS w
    ON w.order_id = o.order_id
  LEFT JOIN latest_demographics AS demo
    ON demo.order_id = o.order_id
  WHERE LOWER(TRIM(COALESCE(s.master_auth_status, ''))) = 'work_in_progress'
    AND COALESCE(s.medical_order_status, '') NOT IN (
      'order_completed_by_agent',
      'order_completed_by_human'
    )
),
wip_spine_raw AS (
  SELECT
    ow.order_id,
    day AS spine_date,
    ow.wip_start_date
  FROM open_wip AS ow
  CROSS JOIN params AS p
  CROSS JOIN UNNEST(
    GENERATE_DATE_ARRAY(ow.wip_start_date, p.report_date, INTERVAL 1 DAY)
  ) AS day
  WHERE EXTRACT(DAYOFWEEK FROM day) NOT IN (1, 7)
),
orders_created_on_spine AS (
  SELECT
    DATE(o.created_at, 'Asia/Kolkata') AS ist_date,
    COUNT(*) AS cases_added,
    COUNTIF(LOWER(TRIM(COALESCE(o.assigned_to_name, ''))) NOT IN ('', 'unassigned')) AS allotted_cases
  FROM latest_order AS o
  WHERE DATE(o.created_at, 'Asia/Kolkata') IN (
    SELECT DISTINCT spine_date FROM wip_spine_raw
  )
  GROUP BY ist_date
),
staff_working_days AS (
  SELECT ist_date AS spine_date
  FROM orders_created_on_spine
  WHERE cases_added > 0
    AND SAFE_DIVIDE(allotted_cases, cases_added) > 0
  UNION DISTINCT
  SELECT DISTINCT wsr.spine_date
  FROM wip_spine_raw AS wsr
  WHERE wsr.spine_date = CURRENT_DATE('Asia/Kolkata')
),
wip_business_days AS (
  SELECT
    wsr.order_id,
    COUNT(*) AS days_in_wip
  FROM wip_spine_raw AS wsr
  INNER JOIN staff_working_days AS swd
    ON swd.spine_date = wsr.spine_date
  WHERE wsr.spine_date > wsr.wip_start_date
  GROUP BY wsr.order_id
)
SELECT
  ow.org_id,
  ow.order_id,
  ow.mrn,
  ow.assigned_to,
  ow.first_created_date,
  FORMAT_DATE('%Y-%m-%d', ow.wip_start_date) AS first_wip_date,
  wbd.days_in_wip,
  ow.master_auth_status
FROM open_wip AS ow
JOIN wip_business_days AS wbd
  ON wbd.order_id = ow.order_id
CROSS JOIN params AS p
WHERE wbd.days_in_wip >= 1
  AND ow.wip_start_date < p.report_date
ORDER BY days_in_wip DESC, assigned_to, mrn;
