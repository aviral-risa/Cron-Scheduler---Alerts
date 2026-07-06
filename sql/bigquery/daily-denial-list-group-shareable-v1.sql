-- Daily Denial List (Group / Shareable) V1
--
-- Org: Astera Radiology (rf5w1cNTGVfH9ZAJoLCF)
-- Population: denial note on @report_date (IST)
-- Columns: mrn, denial_note (denial letter deferred)
--
-- Parameters:
--   @report_date DATE
--   @org_id STRING

WITH params AS (
  SELECT
    @report_date AS report_date,
    @org_id AS org_id
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
  )
  WHERE _cdc_rank = 1
    AND COALESCE(_change_type, '') != 'DELETE'
),
denial_comments_on_report_date AS (
  SELECT
    c.order_id,
    c.org_id,
    c.comment AS denial_note,
    c.created_at AS denial_comment_at,
    NULLIF(TRIM(c.j_code), '') AS denial_j_code
  FROM (
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
      FROM `prior--backen-prod-svc-u4g8.medical_pa_prod_med_onc.auth_status_comments` AS t
    )
    WHERE _cdc_rank = 1
      AND COALESCE(_change_type, '') != 'DELETE'
  ) AS c
  CROSS JOIN params AS p
  WHERE LOWER(TRIM(c.comment_type)) = 'denial'
    AND DATE(c.created_at, 'Asia/Kolkata') = p.report_date
),
latest_procedures AS (
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
    FROM `prior--backen-prod-svc-u4g8.medical_pa_prod_med_onc.procedures` AS t
  )
  WHERE _cdc_rank = 1
    AND COALESCE(_change_type, '') != 'DELETE'
),
order_cpt AS (
  SELECT
    order_id,
    cpt_code
  FROM latest_procedures
  WHERE REGEXP_CONTAINS(TRIM(cpt_code), r'^\d{5}$')
  QUALIFY ROW_NUMBER() OVER (
    PARTITION BY order_id
    ORDER BY performed_date DESC, cpt_code
  ) = 1
)
SELECT
  o.org_id,
  d.order_id,
  COALESCE(demo.patient_id, o.patient_id) AS mrn,
  NULLIF(TRIM(o.regimen_name), '') AS regimen_name,
  COALESCE(d.denial_j_code, cpt.cpt_code) AS cpt_code,
  FORMAT_DATE('%Y-%m-%d', DATE(d.denial_comment_at, 'Asia/Kolkata')) AS denial_date,
  o.assigned_to_name AS assigned_to,
  LEFT(REGEXP_REPLACE(d.denial_note, r'\s+', ' '), 120) AS denial_summary,
  LEFT(REGEXP_REPLACE(d.denial_note, r'\s+', ' '), 120) AS denial_preview,
  d.denial_note
FROM denial_comments_on_report_date AS d
CROSS JOIN params AS p
JOIN latest_order AS o
  ON o.order_id = d.order_id
LEFT JOIN latest_demographics AS demo
  ON demo.order_id = d.order_id
LEFT JOIN order_cpt AS cpt
  ON cpt.order_id = d.order_id
WHERE o.org_id = p.org_id
ORDER BY mrn, regimen_name;
