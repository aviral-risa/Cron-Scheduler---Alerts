-- Denial Free Days streak (IST calendar days with zero denial comments)
--
-- A denial day = at least one auth_status_comments row with comment_type 'denial'
-- on that IST date (same definition as daily-denial-list-internal-v1.sql).
--
-- Parameters:
--   @org_id STRING
--   @as_of_date DATE — streak counted through this IST date (default: yesterday IST)

WITH params AS (
  SELECT
    @org_id AS org_id,
    COALESCE(
      @as_of_date,
      DATE_SUB(CURRENT_DATE('Asia/Kolkata'), INTERVAL 1 DAY)
    ) AS as_of_date,
    DATE_SUB(
      COALESCE(
        @as_of_date,
        DATE_SUB(CURRENT_DATE('Asia/Kolkata'), INTERVAL 1 DAY)
      ),
      INTERVAL 730 DAY
    ) AS lookback_start
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
denial_days AS (
  SELECT DISTINCT DATE(a.created_at, 'Asia/Kolkata') AS denial_date
  FROM auth_comments AS a
  CROSS JOIN params AS p
  WHERE a.org_id = p.org_id
    AND LOWER(TRIM(a.comment_type)) = 'denial'
    AND DATE(a.created_at, 'Asia/Kolkata') BETWEEN p.lookback_start AND p.as_of_date
),
calendar AS (
  SELECT day AS calendar_date
  FROM params AS p,
    UNNEST(GENERATE_DATE_ARRAY(p.lookback_start, p.as_of_date)) AS day
),
day_flags AS (
  SELECT
    c.calendar_date,
    IF(d.denial_date IS NOT NULL, 1, 0) AS had_denial
  FROM calendar AS c
  LEFT JOIN denial_days AS d
    ON d.denial_date = c.calendar_date
),
free_day_groups AS (
  SELECT
    calendar_date,
    DATE_SUB(
      calendar_date,
      INTERVAL ROW_NUMBER() OVER (ORDER BY calendar_date) DAY
    ) AS streak_group
  FROM day_flags
  WHERE had_denial = 0
),
streak_lengths AS (
  SELECT
    streak_group,
    MIN(calendar_date) AS streak_start,
    MAX(calendar_date) AS streak_end,
    COUNT(*) AS streak_days
  FROM free_day_groups
  GROUP BY streak_group
),
current_streak AS (
  SELECT s.streak_days
  FROM streak_lengths AS s
  CROSS JOIN params AS p
  WHERE p.as_of_date BETWEEN s.streak_start AND s.streak_end
),
best_streak AS (
  SELECT streak_days, streak_end
  FROM streak_lengths
  ORDER BY streak_days DESC, streak_end DESC
  LIMIT 1
),
last_denial AS (
  SELECT MAX(denial_date) AS last_denial_date
  FROM denial_days
)
SELECT
  p.as_of_date,
  COALESCE((SELECT streak_days FROM current_streak), 0) AS current_denial_free_days,
  COALESCE((SELECT streak_days FROM best_streak), 0) AS highest_denial_free_days,
  (SELECT streak_end FROM best_streak) AS highest_streak_ended_on,
  (SELECT last_denial_date FROM last_denial) AS last_denial_date
FROM params AS p;
