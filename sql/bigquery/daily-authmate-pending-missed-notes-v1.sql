-- AuthMate-Pending Missed Daily Notes V1
--
-- Org: Astera Radiology (rf5w1cNTGVfH9ZAJoLCF)
-- Note triggered: any comments row on EST date while bo_status = AuthMate-Pending
-- Missed days: EST weekdays with IST staff-allotment day (0% allotted holidays excluded)
-- Alert gate: fire only when @report_date (prior EST business day) is missed
-- Excludes stale duplicates: same case signature (mrn|regimen|dos) resolved on another order
--
-- Parameters:
--   @report_date DATE — prior EST business day
--   @org_id STRING    — rf5w1cNTGVfH9ZAJoLCF

WITH params AS (
  SELECT
    @report_date AS report_date,
    @org_id AS org_id
),
status_cdc AS (
  SELECT
    t.order_id,
    t.org_id,
    t.bo_status,
    TIMESTAMP_MILLIS(t.datastream_metadata.source_timestamp) AS cdc_ts
  FROM `prior--backen-prod-svc-u4g8.medical_pa_prod_med_onc.medical_pa_order_status` AS t
  WHERE COALESCE(t.datastream_metadata.change_type, '') != 'DELETE'
    AND t.org_id = @org_id
),
status_timeline AS (
  SELECT
    order_id,
    org_id,
    bo_status,
    cdc_ts,
    LAG(bo_status) OVER (
      PARTITION BY order_id
      ORDER BY cdc_ts
    ) AS prev_bo_status
  FROM status_cdc
),
pending_start AS (
  SELECT
    order_id,
    org_id,
    cdc_ts AS pending_started_at
  FROM status_timeline
  WHERE bo_status = 'AuthMate-Pending'
    AND COALESCE(prev_bo_status, '') != 'AuthMate-Pending'
  QUALIFY ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY cdc_ts DESC) = 1
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
order_signature AS (
  SELECT
    o.order_id,
    o.org_id,
    o.created_at,
    o.assigned_to_name,
    CONCAT(
      COALESCE(demo.patient_id, o.patient_id),
      '|',
      COALESCE(o.regimen_name, ''),
      '|',
      COALESCE(CAST(o.date_of_service AS STRING), '')
    ) AS case_signature
  FROM latest_order AS o
  LEFT JOIN latest_demographics AS demo
    ON demo.order_id = o.order_id
),
/** Another order for same case left AuthMate-Pending (re-allot / auth / WIP on sibling) */
signature_resolved_elsewhere AS (
  SELECT DISTINCT os.case_signature
  FROM order_signature AS os
  JOIN latest_status AS s
    ON s.order_id = os.order_id
  WHERE os.case_signature != '||'
    AND s.bo_status != 'AuthMate-Pending'
),
/** Superseded by a newer order for the same case signature */
signature_superseded AS (
  SELECT DISTINCT newer.order_id AS superseded_order_id
  FROM order_signature AS older
  JOIN order_signature AS newer
    ON newer.case_signature = older.case_signature
   AND newer.order_id != older.order_id
   AND newer.created_at > older.created_at
  WHERE older.case_signature != '||'
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
note_days AS (
  SELECT
    order_id,
    DATE(created_at, 'America/New_York') AS note_date,
    MAX(created_at) AS last_note_at
  FROM comments_latest
  WHERE NULLIF(TRIM(comments), '') IS NOT NULL
  GROUP BY order_id, note_date
),
last_note AS (
  SELECT
    order_id,
    MAX(note_date) AS last_note_triggered_on
  FROM note_days
  GROUP BY order_id
),
open_pending AS (
  SELECT
    s.order_id,
    s.org_id,
    ps.pending_started_at,
    DATE(ps.pending_started_at, 'America/New_York') AS pending_start_date,
    os.case_signature
  FROM latest_status AS s
  JOIN pending_start AS ps
    ON ps.order_id = s.order_id
  JOIN order_signature AS os
    ON os.order_id = s.order_id
  CROSS JOIN params AS p
  WHERE s.bo_status = 'AuthMate-Pending'
    AND s.org_id = p.org_id
    AND os.case_signature NOT IN (SELECT case_signature FROM signature_resolved_elsewhere)
    AND s.order_id NOT IN (SELECT superseded_order_id FROM signature_superseded)
),
weekday_spine_raw AS (
  SELECT
    op.order_id,
    day AS spine_date
  FROM open_pending AS op
  CROSS JOIN params AS p
  CROSS JOIN UNNEST(
    GENERATE_DATE_ARRAY(
      op.pending_start_date,
      p.report_date,
      INTERVAL 1 DAY
    )
  ) AS day
  WHERE EXTRACT(DAYOFWEEK FROM day) NOT IN (1, 7)
),
/** IST days where staff were actively allotting (excludes holidays e.g. 0% allotted) */
orders_created_on_spine AS (
  SELECT
    DATE(o.created_at, 'Asia/Kolkata') AS ist_date,
    COUNT(*) AS cases_added,
    COUNTIF(LOWER(TRIM(COALESCE(o.assigned_to_name, ''))) NOT IN ('', 'unassigned')) AS allotted_cases
  FROM latest_order AS o
  WHERE DATE(o.created_at, 'Asia/Kolkata') IN (
    SELECT DISTINCT spine_date FROM weekday_spine_raw
  )
  GROUP BY ist_date
),
staff_working_days AS (
  SELECT ist_date AS spine_date
  FROM orders_created_on_spine
  WHERE cases_added > 0
    AND SAFE_DIVIDE(allotted_cases, cases_added) > 0
  UNION DISTINCT
  -- Today IST: weekday followup required even before end-of-day allotment is final
  SELECT DISTINCT wsr.spine_date
  FROM weekday_spine_raw AS wsr
  WHERE wsr.spine_date = CURRENT_DATE('Asia/Kolkata')
),
weekday_spine AS (
  SELECT
    wsr.order_id,
    wsr.spine_date
  FROM weekday_spine_raw AS wsr
  INNER JOIN staff_working_days AS swd
    ON swd.spine_date = wsr.spine_date
),
missed AS (
  SELECT
    ws.order_id,
    ws.spine_date
  FROM weekday_spine AS ws
  LEFT JOIN note_days AS nd
    ON nd.order_id = ws.order_id
   AND nd.note_date = ws.spine_date
  WHERE nd.order_id IS NULL
),
missed_agg AS (
  SELECT
    order_id,
    STRING_AGG(FORMAT_DATE('%Y-%m-%d', spine_date), ', ' ORDER BY spine_date) AS missed_dates,
    COUNT(*) AS missed_day_count
  FROM missed
  GROUP BY order_id
)
SELECT
  op.org_id,
  op.order_id,
  COALESCE(demo.patient_id, o.patient_id) AS mrn,
  o.assigned_to_name AS assigned_to,
  FORMAT_DATE('%Y-%m-%d', ln.last_note_triggered_on) AS last_note_triggered_on,
  ma.missed_dates,
  ma.missed_day_count,
  FORMAT_DATE('%Y-%m-%d', op.pending_start_date) AS pending_since
FROM open_pending AS op
JOIN latest_order AS o
  ON o.order_id = op.order_id
LEFT JOIN latest_demographics AS demo
  ON demo.order_id = op.order_id
LEFT JOIN last_note AS ln
  ON ln.order_id = op.order_id
JOIN missed_agg AS ma
  ON ma.order_id = op.order_id
CROSS JOIN params AS p
WHERE EXISTS (
  SELECT 1
  FROM missed AS m
  WHERE m.order_id = op.order_id
    AND m.spine_date = p.report_date
)
ORDER BY missed_day_count DESC, mrn;
