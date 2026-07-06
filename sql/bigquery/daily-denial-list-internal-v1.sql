-- Daily Denial List (Internal) V1
--
-- Org: Astera Radiology (rf5w1cNTGVfH9ZAJoLCF)
-- Population: orders with a denial note on @report_date (IST)
-- CPT: auth_status_comments.j_code on the denial row (per order_id); fallback = latest 5-digit procedure CPT
--
-- Parameters:
--   @report_date DATE — prior IST day
--   @org_id STRING    — rf5w1cNTGVfH9ZAJoLCF

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
auth_comments AS (
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
),
auth_comments_ranked AS (
  SELECT
    order_id,
    org_id,
    LOWER(TRIM(comment_type)) AS comment_type,
    comment,
    commented_by,
    created_at,
    NULLIF(TRIM(j_code), '') AS j_code
  FROM auth_comments
),
denial_comments_on_report_date AS (
  SELECT
    a.order_id,
    a.org_id,
    a.comment AS denial_note,
    a.commented_by AS denial_noted_by,
    a.created_at AS denial_comment_at,
    a.j_code AS denial_j_code
  FROM auth_comments_ranked AS a
  CROSS JOIN params AS p
  WHERE a.comment_type = 'denial'
    AND DATE(a.created_at, 'Asia/Kolkata') = p.report_date
),
query_comments AS (
  SELECT
    order_id,
    STRING_AGG(comment, ' | ' ORDER BY created_at) AS query_notes
  FROM auth_comments_ranked
  WHERE comment_type IN ('query', 'query_resolution')
  GROUP BY order_id
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
primary_order_cpt AS (
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
  COALESCE(d.denial_j_code, poc.cpt_code) AS cpt_code,
  d.denial_note,
  LEFT(REGEXP_REPLACE(d.denial_note, r'\s+', ' '), 180) AS denial_preview,
  LEFT(REGEXP_REPLACE(d.denial_note, r'\s+', ' '), 120) AS denial_summary,
  COALESCE(o.assigned_to_name, d.denial_noted_by) AS assigned_to,
  FORMAT_DATE('%Y-%m-%d', DATE(d.denial_comment_at, 'Asia/Kolkata')) AS denial_date,
  EXISTS (
    SELECT 1
    FROM auth_comments_ranked AS q
    WHERE q.order_id = d.order_id
      AND q.comment_type = 'query'
      AND q.created_at < d.denial_comment_at
  ) AS query_before_denial,
  q.query_notes
FROM denial_comments_on_report_date AS d
CROSS JOIN params AS p
JOIN latest_order AS o
  ON o.order_id = d.order_id
LEFT JOIN latest_demographics AS demo
  ON demo.order_id = d.order_id
LEFT JOIN query_comments AS q
  ON q.order_id = d.order_id
LEFT JOIN primary_order_cpt AS poc
  ON poc.order_id = d.order_id
WHERE o.org_id = p.org_id
ORDER BY denial_date, mrn, regimen_name;
