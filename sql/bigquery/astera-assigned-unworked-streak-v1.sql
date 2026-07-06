-- Astera Assigned But Unworked (2+ Days) V1
--
-- Flags cases assigned >= 2 IST days ago that remain master_auth_status = 'new'.
-- Example: assigned 30 Jun, still new on 2 Jul → surfaces on 2 Jul report.
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
order_cdc AS (
  SELECT
    t.order_id,
    t.assigned_to_name,
    TIMESTAMP_MILLIS(t.datastream_metadata.source_timestamp) AS cdc_ts,
    LAG(LOWER(TRIM(COALESCE(t.assigned_to_name, '')))) OVER (
      PARTITION BY t.order_id
      ORDER BY
        t.datastream_metadata.source_timestamp,
        t.datastream_metadata.change_sequence_number,
        t.datastream_metadata.uuid
    ) AS prev_assignee
  FROM `prior--backen-prod-svc-u4g8.medical_pa_prod_med_onc.medical_pa_order` AS t
  WHERE t.org_id = @org_id
    AND COALESCE(t.datastream_metadata.change_type, '') != 'DELETE'
),
first_assignment AS (
  SELECT
    order_id,
    assigned_to_name,
    MIN(cdc_ts) AS assigned_at
  FROM order_cdc
  WHERE LOWER(TRIM(COALESCE(assigned_to_name, ''))) NOT IN ('', 'unassigned')
    AND COALESCE(prev_assignee, '') IN ('', 'unassigned')
  GROUP BY order_id, assigned_to_name
),
current_assignment AS (
  SELECT
    fa.order_id,
    fa.assigned_to_name,
    fa.assigned_at
  FROM first_assignment AS fa
  JOIN latest_order AS o
    ON o.order_id = fa.order_id
   AND o.assigned_to_name = fa.assigned_to_name
)
SELECT
  o.org_id,
  o.order_id,
  COALESCE(demo.patient_id, o.patient_id) AS mrn,
  o.assigned_to_name AS assigned_to,
  FORMAT_DATE('%Y-%m-%d', DATE(ca.assigned_at, 'Asia/Kolkata')) AS assigned_date,
  DATE_DIFF(p.report_date, DATE(ca.assigned_at, 'Asia/Kolkata'), DAY) AS days_assigned_unworked,
  s.master_auth_status
FROM latest_order AS o
JOIN latest_status AS s
  ON s.order_id = o.order_id
JOIN current_assignment AS ca
  ON ca.order_id = o.order_id
LEFT JOIN latest_demographics AS demo
  ON demo.order_id = o.order_id
CROSS JOIN params AS p
WHERE LOWER(TRIM(COALESCE(o.assigned_to_name, ''))) NOT IN ('', 'unassigned', 'risa agent')
  AND LOWER(TRIM(COALESCE(s.master_auth_status, ''))) = 'new'
  AND s.date_of_work IS NULL
  AND DATE_DIFF(p.report_date, DATE(ca.assigned_at, 'Asia/Kolkata'), DAY) >= 2
ORDER BY days_assigned_unworked DESC, assigned_to, mrn;
