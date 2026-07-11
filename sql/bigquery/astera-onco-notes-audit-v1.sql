-- Astera OncoEMR Notes Quality Audit V1
--
-- Section A (pasted): comments rows on @report_date IST with point-in-time status
-- Section B (missing): auth_on_file reports template_text on report_date without a comment
--
-- Parameters:
--   @report_date DATE — today IST at 4:15 PM run
--   @org_id STRING    — rf5w1cNTGVfH9ZAJoLCF

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
comments_latest AS (
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
    FROM `prior--backen-prod-svc-u4g8.medical_pa_prod_med_onc.comments` AS t
    WHERE t.org_id = @org_id
  )
  WHERE _cdc_rank = 1
    AND COALESCE(_change_type, '') != 'DELETE'
),
latest_auth_on_file AS (
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
    FROM `prior--backen-prod-svc-u4g8.medical_pa_prod_med_onc.auth_on_file` AS t
    WHERE t.org_id = @org_id
  )
  WHERE _cdc_rank = 1
    AND COALESCE(_change_type, '') != 'DELETE'
),
status_cdc AS (
  SELECT
    t.order_id,
    LOWER(TRIM(COALESCE(t.master_auth_status, ''))) AS master_auth_status,
    TRIM(COALESCE(t.bo_status, '')) AS bo_status,
    TIMESTAMP_MILLIS(t.datastream_metadata.source_timestamp) AS cdc_ts
  FROM `prior--backen-prod-svc-u4g8.medical_pa_prod_med_onc.medical_pa_order_status` AS t
  WHERE t.org_id = @org_id
    AND COALESCE(t.datastream_metadata.change_type, '') != 'DELETE'
),
wip_start AS (
  SELECT
    order_id,
    DATE(cdc_ts, 'Asia/Kolkata') AS wip_start_date
  FROM (
    SELECT
      order_id,
      cdc_ts,
      master_auth_status,
      LAG(master_auth_status) OVER (
        PARTITION BY order_id
        ORDER BY cdc_ts
      ) AS prev_auth_status
    FROM status_cdc
  )
  WHERE master_auth_status = 'work_in_progress'
    AND COALESCE(prev_auth_status, '') != 'work_in_progress'
  QUALIFY ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY cdc_ts DESC) = 1
),
wip_spine_raw AS (
  SELECT
    ws.order_id,
    day AS spine_date,
    ws.wip_start_date
  FROM wip_start AS ws
  CROSS JOIN params AS p
  CROSS JOIN UNNEST(
    GENERATE_DATE_ARRAY(ws.wip_start_date, p.report_date, INTERVAL 1 DAY)
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
notes_on_day AS (
  SELECT
    CAST(c.id AS STRING) AS comment_id,
    c.order_id,
    TRIM(c.comments) AS note_text,
    NULLIF(TRIM(c.provider_name), '') AS provider_name,
    c.created_at AS note_at
  FROM comments_latest AS c
  CROSS JOIN params AS p
  WHERE DATE(c.created_at, 'Asia/Kolkata') = p.report_date
    AND NULLIF(TRIM(c.comments), '') IS NOT NULL
),
status_at_note AS (
  SELECT
    n.comment_id,
    n.order_id,
    n.note_at,
    sc.master_auth_status,
    sc.bo_status,
    sc.cdc_ts,
    ROW_NUMBER() OVER (
      PARTITION BY n.comment_id
      ORDER BY sc.cdc_ts DESC
    ) AS status_rank,
    LAG(sc.master_auth_status) OVER (
      PARTITION BY n.comment_id
      ORDER BY sc.cdc_ts DESC
    ) AS prev_master_auth_status
  FROM notes_on_day AS n
  JOIN status_cdc AS sc
    ON sc.order_id = n.order_id
   AND sc.cdc_ts <= n.note_at
),
note_status AS (
  SELECT
    comment_id,
    order_id,
    note_at,
    master_auth_status,
    bo_status,
    prev_master_auth_status
  FROM status_at_note
  WHERE status_rank = 1
),
report_templates AS (
  SELECT
    a.order_id,
    NULLIF(TRIM(COALESCE(
      JSON_VALUE(report_item, '$.template_text'),
      JSON_VALUE(report_item, '$.Template_Text')
    )), '') AS template_text,
    a.updated_at AS aof_updated_at
  FROM latest_auth_on_file AS a
  CROSS JOIN UNNEST(IFNULL(JSON_QUERY_ARRAY(a.reports), [])) AS report_item
  WHERE NULLIF(TRIM(COALESCE(
    JSON_VALUE(report_item, '$.template_text'),
    JSON_VALUE(report_item, '$.Template_Text')
  )), '') IS NOT NULL
    AND TRIM(COALESCE(
      JSON_VALUE(report_item, '$.template_text'),
      JSON_VALUE(report_item, '$.Template_Text')
    )) != '-'
),
templates_on_day AS (
  SELECT
    rt.order_id,
    STRING_AGG(DISTINCT rt.template_text, '\n---\n' ORDER BY rt.template_text) AS template_text
  FROM report_templates AS rt
  JOIN latest_status AS s
    ON s.order_id = rt.order_id
  CROSS JOIN params AS p
  WHERE DATE(rt.aof_updated_at, 'Asia/Kolkata') = p.report_date
     OR (
       s.date_of_work IS NOT NULL
       AND DATE(s.date_of_work, 'Asia/Kolkata') = p.report_date
     )
  GROUP BY rt.order_id
),
wip_business_days AS (
  SELECT
    wsr.order_id,
    COUNT(*) AS wip_business_days
  FROM wip_spine_raw AS wsr
  INNER JOIN staff_working_days AS swd
    ON swd.spine_date = wsr.spine_date
  WHERE wsr.spine_date > wsr.wip_start_date
  GROUP BY wsr.order_id
),
order_context AS (
  SELECT
    o.order_id,
    COALESCE(d.patient_id, o.patient_id) AS mrn,
    o.assigned_to_name AS assigned_to
  FROM latest_order AS o
  LEFT JOIN latest_demographics AS d
    ON d.order_id = o.order_id
),
pasted_rows AS (
  SELECT
    'pasted' AS audit_kind,
    n.comment_id,
    n.order_id,
    oc.mrn,
    oc.assigned_to,
    n.provider_name,
    n.note_text,
    t.template_text,
    ns.master_auth_status,
    ns.bo_status,
    ns.prev_master_auth_status,
    wb.wip_business_days
  FROM notes_on_day AS n
  JOIN order_context AS oc
    ON oc.order_id = n.order_id
  LEFT JOIN note_status AS ns
    ON ns.comment_id = n.comment_id
  LEFT JOIN templates_on_day AS t
    ON t.order_id = n.order_id
  LEFT JOIN wip_business_days AS wb
    ON wb.order_id = n.order_id
),
missing_rows AS (
  SELECT
    'missing_paste' AS audit_kind,
    CAST(NULL AS STRING) AS comment_id,
    t.order_id,
    oc.mrn,
    oc.assigned_to,
    oc.assigned_to AS provider_name,
    CAST(NULL AS STRING) AS note_text,
    t.template_text,
    LOWER(TRIM(COALESCE(s.master_auth_status, ''))) AS master_auth_status,
    TRIM(COALESCE(s.bo_status, '')) AS bo_status,
    CAST(NULL AS STRING) AS prev_master_auth_status,
    wb.wip_business_days
  FROM templates_on_day AS t
  JOIN order_context AS oc
    ON oc.order_id = t.order_id
  JOIN latest_status AS s
    ON s.order_id = t.order_id
  LEFT JOIN notes_on_day AS n
    ON n.order_id = t.order_id
  LEFT JOIN wip_business_days AS wb
    ON wb.order_id = t.order_id
  WHERE n.comment_id IS NULL
    AND LOWER(REPLACE(TRIM(COALESCE(s.bo_status, '')), ' ', '')) NOT IN (
      'notapplicable',
      'notappilcable'
    )
)
SELECT * FROM pasted_rows
UNION ALL
SELECT * FROM missing_rows
ORDER BY audit_kind, mrn
