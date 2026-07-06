# Product Management Framework: Fulfillment Operations Dashboard
## 45-Person PA Authorization Team | 4 Facilities | Data-First Approach

**Document Purpose**: Define critical questions, metrics, and reporting structure for managing fulfillment ops team performance across NYCBS, CHC, MBPCC, and UCBC.

**Context**: Medical authorization work with Algolia API integration providing 50+ raw fields including order lifecycle data, assignment tracking, and authorization statuses.

---

## 1. CRITICAL QUESTIONS FRAMEWORK

### 1.1 Leadership Questions (VP/Director Level)

#### Real-Time Operations Health (Live Dashboard)
- **Q1**: Are we on track to meet today's targets across all facilities?
- **Q2**: Which facilities are AHEAD/ON_PACE/BEHIND right now?
- **Q3**: What's our current avg orders per person per day (North Star metric)?
- **Q4**: Are there any facilities with concerning capacity issues?

#### Daily Performance Review (8:00 AM IST)
- **Q5**: How many orders did we complete yesterday vs. target?
- **Q6**: What was yesterday's avg orders/person across each facility?
- **Q7**: What's our 7-day rolling average trend (up/down/flat)?
- **Q8**: Which statuses are orders completing in? (auth vs denial breakdown)
- **Q9**: Are there SLA breaches that need escalation?

#### Weekly Strategic Review (Monday 9:00 AM IST)
- **Q10**: What's our week-over-week growth in orders completed?
- **Q11**: Are we trending toward monthly targets?
- **Q12**: Which facilities are consistently underperforming?
- **Q13**: What's our authorization rate vs. target (minimize denials)?
- **Q14**: What are the top bottlenecks slowing us down?

#### Monthly Executive Summary (First Monday of Month)
- **Q15**: What's our month-over-month growth rate?
- **Q16**: How does each facility compare to their targets?
- **Q17**: What are the strategic opportunities for improvement?
- **Q18**: What are cost-per-order trends (future metric)?

---

### 1.2 Team Lead Questions (Operations Managers)

#### Real-Time Team Status (Live Dashboard)
- **Q19**: How many orders are currently unassigned and waiting to be worked?
- **Q20**: Who is actively working right now? (login times visible)
- **Q21**: Are any team members at risk of missing their targets today?
- **Q22**: What's the current workload distribution? (balanced vs. imbalanced)

#### Daily Team Management (6:00 PM IST)
- **Q23**: Which providers have unworked orders at end of day?
- **Q24**: What was each person's productivity today? (orders/person)
- **Q25**: Who is consistently AHEAD/BEHIND their personal average?
- **Q26**: Are there any concerning patterns? (provider going silent, low activity)

#### Weekly Team Performance (Friday 4:00 PM IST)
- **Q27**: What's the weekly performance ranking of my team?
- **Q28**: Who needs coaching/support vs. who is excelling?
- **Q29**: What's our team's avg orders/person trend over 4 weeks?
- **Q30**: Are shifts adequately covered? Any gaps in coverage?

---

### 1.3 Product & Tech Questions (System Health)

#### Real-Time Pipeline Health (Live Monitoring)
- **Q31**: Is the Algolia sync running successfully? Any failures?
- **Q32**: Is data flowing to Google Sheets without errors?
- **Q33**: Are there any data quality issues? (missing fields, validation errors)
- **Q34**: What's the API response time and error rate?

#### Daily Technical Review (Morning Check)
- **Q35**: Did all hourly syncs complete successfully yesterday?
- **Q36**: Are there any stuck orders in the pipeline? (created but never assigned)
- **Q37**: What's the data lag? (how fresh is our dashboard data?)
- **Q38**: Are there metric validation issues? (status counts not adding up)

#### Weekly System Optimization (Thursday Review)
- **Q39**: What are the slowest queries and bottlenecks in the system?
- **Q40**: Are we approaching any rate limits or quotas?
- **Q41**: What optimizations can improve dashboard performance?
- **Q42**: Are there new data fields from Algolia we should leverage?

---

### 1.4 Individual Provider Questions (Self-Service)

#### Personal Performance Tracking (Live)
- **Q43**: How many orders have I completed today vs. my average?
- **Q44**: Am I AHEAD/ON_PACE/BEHIND my personal target?
- **Q45**: How many unworked orders do I have assigned?
- **Q46**: How do I compare to my peers? (anonymized leaderboard)

#### Daily Personal Summary (End of Day)
- **Q47**: What was my productivity today? (orders completed, hours worked)
- **Q48**: What's my 7-day average trend?
- **Q49**: What time did I start/finish today? (login/logoff)
- **Q50**: What statuses did my orders complete in? (quality check)

---

## 2. METRICS HIERARCHY

### 2.1 North Star Metric (Primary Success Indicator)
**Metric**: Average Orders Per Person Per Day
**Formula**: Total Orders Completed ÷ Active Team Members
**Target**: TBD based on historical data (e.g., 25-30 orders/person/day)
**Review Frequency**: Daily (real-time dashboard)

---

### 2.2 Primary KPIs (Daily Tracking - Dashboards)

#### Volume Metrics
1. **Total Orders Loaded** - Orders created in system for the day
2. **Total Orders Assigned** - Orders with provider assigned
3. **Total Orders Completed** - Orders with date_of_work populated (is_worked = true)
4. **Unassigned Orders** - Orders without provider (workload backlog)

#### SLA Metrics (NEW - High Priority)
5. **Time to Assignment** - created_at to assigned_at duration (target: <2 hours)
6. **Time to Completion** - assigned_at to date_of_work duration (target: <4 hours)
7. **SLA Compliance Rate** - % of orders completed within SLA (target: >90%)
8. **At-Risk Orders** - Orders approaching SLA deadline (alert threshold)

#### Quality Metrics
9. **Approval Rate** - auth_by_risa ÷ (auth_by_risa + denial_by_risa) × 100 (target: >85%)
10. **Authorization Rate** - Total Authorized ÷ (Authorized + Denied) × 100 (target: >80%)
11. **Denial Count** - Total denials per day (goal: minimize)
12. **Query Rate** - % of orders going to 'query' status (indicates issues)

#### Efficiency Metrics
13. **Work Rate %** - Orders Completed ÷ Orders Loaded × 100 (daily completion rate)
14. **Assignment Rate %** - Orders Assigned ÷ Orders Loaded × 100 (backlog management)

---

### 2.3 Secondary KPIs (Weekly/Monthly Trends)

#### Velocity Trends (NEW)
15. **Week-over-Week Growth** - % change in total orders completed vs. last week
16. **Month-over-Month Growth** - % change vs. same period last month
17. **Daily Velocity Trend** - Are we accelerating or decelerating? (7-day rolling)

#### Pipeline Health
18. **Assigned but Not Worked Rate** - % of assigned orders not completed (stuck orders)
19. **Orders Per Status** - Distribution across pending, auth_required, query, hold
20. **Status Duration** - Average time spent in each status (bottleneck detection)

#### Capacity Metrics
21. **Active Team Members** - Providers who completed at least 1 order today
22. **Team Utilization Rate** - Active members ÷ Total team size × 100
23. **Workload Balance** - Standard deviation of orders/person (lower = better balance)

#### Facility Performance
24. **Facility Ranking** - Orders/person per facility (NYCBS vs CHC vs MBPCC vs UCBC)
25. **Facility Target Achievement** - % of target achieved per facility
26. **Facility-Specific SLA Compliance** - SLA adherence per facility

---

### 2.4 Operational Metrics (Real-Time Monitoring)

#### Workload Distribution
27. **Unassigned Order Count** - Orders waiting for assignment (by facility)
28. **Provider Workload** - Current assigned count per provider (capacity planning)
29. **Workload Imbalance Score** - Max orders/person ÷ Min orders/person (target: <2x)

#### Real-Time Activity
30. **Providers Currently Active** - Count of providers with recent completions (<1 hour)
31. **Hourly Completion Rate** - Orders completed in last hour (pace tracking)
32. **Projected EOD Completion** - Forecast based on current pace

#### Order Characteristics
33. **Orders by Regimen Type** - Breakdown by treatment type (complexity indicator)
34. **Orders by Payer** - Distribution across insurance providers
35. **Orders with Alerts** - Count of orders with alert_badges (priority orders)

#### Shift Coverage
36. **Coverage by Hour** - Active providers per hour (staffing adequacy)
37. **Peak Hours** - Identify busiest hours for capacity planning
38. **Idle Time** - Hours with zero completions (inefficiency indicator)

---

### 2.5 Quality Metrics (Weekly Deep Dive)

#### Authorization Accuracy
39. **First-Time Approval Rate** - % of orders approved without going to query/hold
40. **Rework Rate** - % of orders requiring query to practice team
41. **Error Type Distribution** - Breakdown by auth_on_file_error_type

#### Process Accuracy
42. **Status Transition Errors** - Orders skipping expected statuses (data quality)
43. **Assignment Errors** - Orders assigned but never worked (>24 hours)
44. **Completion Errors** - Orders marked worked but missing date_of_work

#### Denial Analysis
45. **Denial Rate by Provider** - Individual quality tracking
46. **Denial Root Causes** - Categorize by reason (step therapy, guidelines, etc.)

---

### 2.6 Efficiency Metrics (Monthly Optimization)

#### Time Efficiency
47. **Average Completion Time** - Mean time from created_at to date_of_work
48. **Orders per Hour** - Individual provider efficiency (worked_count ÷ hours_active)
49. **Login to First Completion Time** - Provider ramp-up time

#### Cost Efficiency (Future)
50. **Cost per Order** - Labor cost ÷ orders completed (requires payroll integration)
51. **Overtime Hours** - Hours worked beyond shift (cost management)

#### Learning Curve
52. **New Provider Ramp Time** - Days to reach target productivity
53. **Provider Improvement Rate** - Week-over-week productivity growth per person

---

## 3. REPORTING STRUCTURE

### 3.1 Leadership Reports

#### Report 1: Daily Leadership Dashboard
- **Audience**: VP Operations, Director of Ops
- **Timing**: 8:00 AM IST (automated)
- **Channel**: Slack + Email (PDF summary)
- **Format**: Executive summary card with 8 key metrics
- **Content**:
  - Yesterday's total orders completed vs. target
  - Avg orders/person/day (North Star)
  - 7-day rolling average trend (↑↓→)
  - Facility performance summary (4 facilities)
  - SLA compliance % (NEW)
  - Authorization rate
  - Top 3 bottlenecks (NEW)
  - Action items/alerts
- **Implementation**: New Slack alert + PDF generation

#### Report 2: Weekly Leadership Review
- **Audience**: VP Operations, Leadership Team
- **Timing**: Monday 9:00 AM IST
- **Channel**: Email (detailed report) + Dashboard link
- **Format**: Multi-page report with charts and tables
- **Content**:
  - Week-over-week performance (orders, productivity, quality)
  - Facility comparison and ranking
  - Team capacity analysis (utilization, balance)
  - SLA compliance trends (NEW)AWZ
  - Authorization rate trends
  - Top performers and opportunities
  - Strategic recommendations
- **Implementation**: New email report generation

#### Report 3: Monthly Executive Summary
- **Audience**: C-Suite, VP Operations
- **Timing**: First Monday of month, 10:00 AM IST
- **Channel**: Email (executive brief) + Live presentation dashboard
- **Format**: 1-page executive summary + detailed appendix
- **Content**:
  - Month-over-month growth
  - Facility target achievement
  - Team performance highlights
  - Quality metrics (authorization rate, denial reduction)
  - Cost per order (future)
  - Strategic initiatives and ROI
- **Implementation**: New monthly report template

---

### 3.2 Team Lead Reports

#### Report 4: Real-Time Team Dashboard
- **Audience**: Operations Managers, Team Leads
- **Timing**: Live (continuously updated)
- **Channel**: Web Dashboard (BusinessView)
- **Format**: Interactive dashboard with drill-down
- **Content**:
  - Current unassigned orders count
  - Provider status board (active/idle)
  - Individual provider progress bars (vs. target)
  - Workload distribution heatmap
  - Live hourly completion rate
  - At-risk orders alert panel (NEW)
- **Implementation**: Enhance BusinessView with real-time section

#### Report 5: Daily Team Report
- **Audience**: Team Leads
- **Timing**: 6:00 PM IST (end of day)
- **Channel**: Slack (per-facility channel)
- **Format**: Team summary card with provider breakdown
- **Content**:
  - Team total: orders completed today
  - Team avg orders/person
  - Provider breakdown: worked/unworked counts (EXISTING)
  - AHEAD/ON_PACE/BEHIND status per provider
  - Unworked orders list (EXISTING)
  - Tomorrow's action items
- **Implementation**: Enhance existing daily Slack alert

#### Report 6: Weekly Team Performance Review
- **Audience**: Team Leads
- **Timing**: Friday 4:00 PM IST
- **Channel**: Email + Dashboard
- **Format**: Team performance report with individual metrics
- **Content**:
  - Week summary: total orders, avg/person, trend
  - Provider performance table (ranked)
  - Coaching recommendations (underperformers)
  - Recognition highlights (top performers)
  - Shift coverage analysis (NEW)
  - Next week's targets
- **Implementation**: New weekly email report

---

### 3.3 Individual Provider Reports

#### Report 7: Personal Performance Dashboard
- **Audience**: Individual Providers
- **Timing**: Live (self-service)
- **Channel**: Web Dashboard (new view)
- **Format**: Personal metrics page
- **Content**:
  - Today's progress: completed vs. target
  - AHEAD/ON_PACE/BEHIND status
  - Current unworked orders assigned to me
  - My 7-day average trend
  - My login/logoff times
  - My authorization rate (quality)
  - Anonymized peer comparison (percentile)
- **Implementation**: New PersonalView component

#### Report 8: Weekly Personal Report
- **Audience**: Individual Providers
- **Timing**: Friday 5:00 PM IST
- **Channel**: Email (personal)
- **Format**: Personal performance card
- **Content**:
  - Week summary: total orders completed
  - My avg orders/day vs. team avg
  - Quality metrics: approval rate, denial count
  - Improvement vs. last week (↑↓)
  - Congratulations or coaching tips
- **Implementation**: New personal email report

---

### 3.4 Product & Tech Monitoring

#### Report 9: System Health Dashboard
- **Audience**: Product Manager, Tech Team
- **Timing**: Live monitoring
- **Channel**: Web Dashboard (dedicated monitoring view)
- **Format**: System health panel with alerts
- **Content**:
  - Algolia sync status: last run time, success/failure
  - Data freshness: minutes since last update
  - API health: response time, error rate
  - Google Sheets sync status
  - Metric validation results (status counts match)
  - Error logs (last 24 hours)
- **Implementation**: New MonitoringView component

#### Report 10: Daily Tech Report
- **Audience**: Tech Team
- **Timing**: 9:00 AM IST
- **Channel**: Slack #tech-alerts channel
- **Format**: System summary card
- **Content**:
  - Sync success rate (24 hours)
  - Data quality score (validation pass rate)
  - API performance (avg response time)
  - Errors logged (count + top 3)
  - Action items for investigation
- **Implementation**: New daily tech Slack alert

#### Report 11: Weekly Tech Review
- **Audience**: Product & Tech Team
- **Timing**: Thursday 3:00 PM IST
- **Channel**: Email + Dashboard
- **Format**: Technical performance report
- **Content**:
  - System uptime and reliability
  - Query performance metrics (slowest queries)
  - Optimization opportunities
  - Rate limit usage (approaching limits?)
  - Roadmap items based on usage patterns
- **Implementation**: New weekly tech email

---

### 3.5 Slack Alerts (Enhanced)

#### Alert 1: Daily Unworked Orders (EXISTING - Enhance)
- **Timing**: 10:00 PM IST (existing)
- **Channel**: Per-facility Slack channels
- **Trigger**: End of day
- **Content**: Provider unworked orders list (existing)
- **Enhancement**: Add team-level summary at top (total unworked, team avg)

#### Alert 2: SLA Breach Alert (NEW - High Priority)
- **Timing**: Real-time (when triggered)
- **Channel**: #operations-alerts (new channel)
- **Trigger**: Order approaching SLA deadline (30 min warning)
- **Content**:
  - Order ID, facility, assigned provider
  - Time since assignment
  - Time until SLA breach
  - Action required: "Escalate or complete now"
- **Implementation**: New real-time alert with SLA tracking

#### Alert 3: Performance Drop Alert (NEW)
- **Timing**: Real-time (hourly check)
- **Channel**: Team lead Slack DM
- **Trigger**: Facility or team >20% below pace
- **Content**:
  - Facility/team name
  - Current orders completed vs. expected
  - % behind pace
  - Recommended action: assign more orders, check for blockers
- **Implementation**: New hourly monitoring alert

#### Alert 4: Bottleneck Detected (NEW)
- **Timing**: Real-time (2-hour interval check)
- **Channel**: #operations-alerts
- **Trigger**: >100 orders stuck in a status for >4 hours
- **Content**:
  - Status name (pending, query, auth_required)
  - Count of stuck orders
  - Facility breakdown
  - Suggested actions (investigate payer delays, etc.)
- **Implementation**: New status duration monitoring

#### Alert 5: Provider Inactivity Alert (NEW)
- **Timing**: Real-time (during work hours)
- **Channel**: Team lead Slack DM
- **Trigger**: Provider has assigned orders but no completions in 2+ hours
- **Content**:
  - Provider name
  - Assigned order count
  - Last completion time
  - Action: check in with provider
- **Implementation**: New activity monitoring

#### Alert 6: End-of-Day Summary (NEW)
- **Timing**: 8:00 PM IST
- **Channel**: Per-facility channels
- **Trigger**: End of day (before final push)
- **Content**:
  - Orders completed so far vs. target
  - Projected EOD count
  - Gap to close
  - Call to action: "Let's finish strong! X orders to go"
- **Implementation**: New motivational summary

#### Alert 7: Approval Rate Drop (NEW)
- **Timing**: Daily (8:00 AM IST)
- **Channel**: #quality-alerts (new channel)
- **Trigger**: Yesterday's approval rate <80%
- **Content**:
  - Approval rate % vs. target
  - Denial count breakdown (by type)
  - Top denying providers (coaching opportunity)
  - Action: review authorization guidelines
- **Implementation**: New quality monitoring alert

#### Alert 8: Weekly Performance Highlights (NEW)
- **Timing**: Friday 5:00 PM IST
- **Channel**: #team-celebrations (new channel)
- **Trigger**: End of week
- **Content**:
  - Week's total orders completed
  - WoW growth %
  - Top 3 performing facilities
  - Top 5 performing providers (leaderboard)
  - Celebratory message
- **Implementation**: New weekly celebration alert

---

### 3.6 Email Reports (New)

#### Email Report 1: Daily Executive Brief
- **To**: VP Operations, Director
- **Subject**: "Fulfillment Ops Daily Brief - [Date]"
- **Format**: HTML email with metric cards and charts
- **Attachable**: Yes (PDF version)

#### Email Report 2: Weekly Team Performance
- **To**: Team Leads
- **Subject**: "[Facility] Team Performance - Week of [Date]"
- **Format**: HTML email with tables and charts
- **Attachable**: Yes (CSV export of data)

#### Email Report 3: Weekly Personal Report
- **To**: Individual Providers
- **Subject**: "Your Performance This Week - [Name]"
- **Format**: Personalized HTML email
- **Attachable**: No

#### Email Report 4: Monthly Executive Summary
- **To**: C-Suite, Leadership
- **Subject**: "Fulfillment Ops Monthly Report - [Month]"
- **Format**: Executive brief (1-page) + detailed appendix
- **Attachable**: Yes (multi-page PDF)

#### Email Report 5: Weekly Tech Review
- **To**: Product & Tech Team
- **Subject**: "System Performance Review - Week of [Date]"
- **Format**: Technical report with system metrics
- **Attachable**: Yes (system logs if needed)

---

## 4. DATA VIEWS / SQL QUERIES NEEDED

### 4.1 SLA Tracking Views (NEW - Priority 1)

#### View 1: order_sla_metrics
**Purpose**: Calculate SLA metrics per order
**Source**: orders_raw_hourly (latest snapshot per order)
**Fields**:
- order_id, facility_id, provider_name
- created_at, assigned_at, date_of_work
- time_to_assignment (minutes: assigned_at - created_at)
- time_to_completion (minutes: date_of_work - assigned_at)
- total_lifecycle_time (minutes: date_of_work - created_at)
- sla_assignment_met (boolean: time_to_assignment < 120 min)
- sla_completion_met (boolean: time_to_completion < 240 min)
- sla_overall_met (boolean: both SLAs met)
- is_at_risk (boolean: assigned but approaching deadline)

**Implementation**: Add function to sheets.ts: `getOrderSLAMetrics(date, facilityId)`

---

#### View 2: current_sla_risk_orders
**Purpose**: Real-time list of orders at risk of SLA breach
**Source**: orders_raw_hourly (latest snapshot, today's orders only)
**Filters**:
- is_assigned = true
- is_worked = false
- (current_time - assigned_at) > 180 minutes (30 min before 4-hour SLA)
**Fields**: order_id, facility_id, provider_name, assigned_at, minutes_until_breach
**Refresh**: Every 15 minutes
**Implementation**: Add function `getCurrentSLARiskOrders(facilityId)`

---

### 4.2 Velocity & Trend Views (NEW - Priority 1)

#### View 3: daily_velocity_trends
**Purpose**: Calculate day-over-day and week-over-week growth
**Source**: daily_summary
**Fields**:
- created_at_date, facility_id
- orders_completed
- orders_completed_yesterday
- orders_completed_last_week_same_day
- day_over_day_change (%)
- week_over_week_change (%)
- 7_day_rolling_avg
- trend_direction (UP/FLAT/DOWN)

**Implementation**: Add function `getDailyVelocityTrends(dateRange, facilityId)`

---

#### View 4: facility_velocity_comparison
**Purpose**: Compare facilities' velocity trends
**Source**: daily_summary
**Fields**: facility_id, week_num, total_orders, wow_growth, rank
**Implementation**: Add function `getFacilityVelocityComparison(weekRange)`

---

### 4.3 Bottleneck Detection Views (NEW - Priority 1)

#### View 5: status_duration_analysis
**Purpose**: Identify which statuses orders get stuck in
**Source**: orders_raw_hourly (hourly snapshots)
**Logic**: Track how long orders remain in each status
**Fields**:
- master_auth_status
- avg_duration_hours
- median_duration_hours
- max_duration_hours
- orders_stuck_over_4h (count)
- orders_stuck_over_8h (count)

**Implementation**: Requires multi-snapshot analysis. Add function `getStatusDurationAnalysis(date, facilityId)`

---

#### View 6: stuck_orders
**Purpose**: List orders stuck in intermediate statuses
**Source**: orders_raw_hourly (latest snapshot)
**Filters**: master_auth_status IN ('pending', 'query', 'auth_required', 'hold') AND (current_time - updated_at) > 8 hours
**Fields**: order_id, facility_id, status, hours_stuck, provider_name
**Implementation**: Add function `getStuckOrders(facilityId, hoursThreshold)`

---

### 4.4 Provider Efficiency Views (NEW - Priority 2)

#### View 7: provider_hourly_productivity
**Purpose**: Calculate orders per hour for each provider
**Source**: person_hourly_performance
**Fields**:
- provider_name, facility_id, date
- login_time, logoff_time
- hours_active (logoff - login)
- orders_completed
- orders_per_hour (worked_count ÷ hours_active)
- efficiency_rank (percentile)

**Implementation**: Add function `getProviderHourlyProductivity(dateRange, facilityId)`

---

#### View 8: provider_efficiency_distribution
**Purpose**: Show distribution of provider efficiency across team
**Source**: person_hourly_performance
**Output**: Histogram data (bins: <15, 15-20, 20-25, 25-30, 30+ orders/day)
**Implementation**: Add function `getProviderEfficiencyDistribution(date, facilityId)`

---

### 4.5 Forecasting Views (NEW - Priority 2)

#### View 9: volume_forecast
**Purpose**: Predict EOD order completion based on current pace
**Source**: org_hourly_metrics (today's snapshots)
**Logic**: Linear extrapolation from current pace
**Fields**: facility_id, current_hour, orders_completed_so_far, projected_eod, confidence_interval
**Implementation**: Add function `getVolumeForcast(facilityId)` (already partially implemented in sync.ts)

---

#### View 10: staffing_requirements
**Purpose**: Calculate required active providers to meet target
**Source**: daily_summary (historical), current workload
**Logic**: target_orders ÷ avg_orders_per_person = required_staff
**Fields**: facility_id, target_orders, avg_productivity, required_staff, current_staff, staff_gap
**Implementation**: Add function `getStaffingRequirements(date, facilityId)`

---

### 4.6 Quality Deep Dive Views (NEW - Priority 3)

#### View 11: denial_root_cause_analysis
**Purpose**: Categorize denials by reason and provider
**Source**: orders_raw_hourly + Algolia auth_on_file_error_type
**Fields**:
- provider_name, facility_id
- denial_count
- denial_type_breakdown (by error_type)
- denial_rate (%)
- comparison_to_team_avg

**Implementation**: Requires fetching error_type field. Add function `getDenialRootCauseAnalysis(dateRange, facilityId)`

---

#### View 12: query_resolution_metrics
**Purpose**: Track orders going to 'query' status and resolution time
**Source**: orders_raw_hourly (multi-snapshot tracking)
**Fields**:
- query_count (orders entering query status)
- avg_query_resolution_time (time from query → final status)
- query_approval_rate (% resolved as auth vs. denial)
- provider_query_rate (by provider)

**Implementation**: Add function `getQueryResolutionMetrics(dateRange, facilityId)`

---

### 4.7 Enhancements to Existing Views

#### Enhancement 1: daily_summary - Add SLA Fields
**Add Fields**:
- sla_compliance_rate (%)
- avg_time_to_assignment (minutes)
- avg_time_to_completion (minutes)
- orders_breached_sla (count)

---

#### Enhancement 2: person_hourly_performance - Add Efficiency Fields
**Add Fields**:
- orders_per_hour (calculated from login/logoff)
- avg_completion_time (average time per order)
- efficiency_rank (1-N ranking)

---

#### Enhancement 3: org_hourly_metrics - Add Velocity Fields
**Add Fields**:
- day_over_day_change (vs yesterday same hour)
- week_over_week_change (vs last week same hour)
- trend_direction (UP/FLAT/DOWN)

---

### 4.8 Real-Time Data Views (Priority 1)

#### View 13: real_time_activity_status
**Purpose**: Show which providers are currently active
**Source**: orders_raw_hourly (last 60 min of completions)
**Logic**: Providers with date_of_work in last 60 minutes = active
**Fields**: provider_name, facility_id, last_completion_time, minutes_idle
**Refresh**: Every 5 minutes
**Implementation**: Add function `getRealTimeActivityStatus(facilityId)`

---

#### View 14: shift_coverage_analysis
**Purpose**: Show provider coverage by hour of day
**Source**: person_hourly_performance (login_time, logoff_time)
**Output**: Heatmap data (hour 0-23, count of active providers)
**Implementation**: Add function `getShiftCoverageAnalysis(dateRange, facilityId)`

---

#### View 15: anomaly_detection
**Purpose**: Flag unusual patterns (sudden drops, spikes)
**Source**: org_hourly_metrics
**Logic**: Z-score analysis (flag if >2 std deviations from mean)
**Fields**: date, facility_id, metric_name, actual_value, expected_value, z_score, is_anomaly
**Implementation**: Add function `getAnomalyDetection(dateRange, facilityId)`

---

## 5. ALERTING FRAMEWORK

### 5.1 Real-Time Alerts (During Work Hours: 11 AM - 8 PM IST)

#### Alert RT-1: SLA Breach Imminent
- **Trigger**: Order assigned >3.5 hours, not completed
- **Check Frequency**: Every 15 minutes
- **Severity**: HIGH
- **Recipients**: Team Lead Slack DM + #operations-alerts
- **Action**: Escalate or reassign immediately

---

#### Alert RT-2: Bottleneck Detected
- **Trigger**: >100 orders stuck in one status for >4 hours
- **Check Frequency**: Every 2 hours
- **Severity**: MEDIUM
- **Recipients**: #operations-alerts + Product Team
- **Action**: Investigate root cause (payer delays, system issue)

---

#### Alert RT-3: Performance Below Threshold
- **Trigger**: Facility >20% behind hourly pace
- **Check Frequency**: Every hour
- **Severity**: MEDIUM
- **Recipients**: Team Lead Slack DM
- **Action**: Assign more orders, check for blockers

---

#### Alert RT-4: Provider Inactivity
- **Trigger**: Provider assigned orders but no completions in 2+ hours (during shift)
- **Check Frequency**: Every hour
- **Severity**: LOW
- **Recipients**: Team Lead Slack DM (private)
- **Action**: Check in with provider (technical issue? taking break?)

---

#### Alert RT-5: Approval Rate Drop
- **Trigger**: Rolling 2-hour approval rate <75%
- **Check Frequency**: Every 2 hours
- **Severity**: MEDIUM
- **Recipients**: #quality-alerts
- **Action**: Review recent denials, coaching intervention

---

### 5.2 Daily Alerts (End of Day)

#### Alert D-1: Unworked Orders Report (EXISTING - Enhanced)
- **Trigger**: 10:00 PM IST
- **Severity**: LOW
- **Recipients**: Per-facility Slack channels
- **Enhancement**: Add team-level summary and action items

---

#### Alert D-2: EOD Summary (NEW)
- **Trigger**: 8:00 PM IST (2 hours before EOD)
- **Severity**: LOW
- **Recipients**: Per-facility channels
- **Content**: Progress update, motivational push

---

#### Alert D-3: SLA Compliance Report (NEW)
- **Trigger**: 11:00 PM IST (after EOD)
- **Severity**: MEDIUM (if compliance <90%)
- **Recipients**: Team Leads + Operations Director
- **Content**: SLA compliance %, breached orders list

---

### 5.3 Weekly Alerts

#### Alert W-1: Performance Highlights (NEW)
- **Trigger**: Friday 5:00 PM IST
- **Severity**: INFO
- **Recipients**: #team-celebrations
- **Content**: Leaderboard, team achievements

---

#### Alert W-2: Capacity Alert (NEW)
- **Trigger**: Monday 9:00 AM IST (if utilization <70% or >95%)
- **Severity**: MEDIUM
- **Recipients**: Operations Director
- **Content**: Staffing recommendations (understaffed or inefficient)

---

### 5.4 Monthly Alerts

#### Alert M-1: Executive Summary (NEW)
- **Trigger**: First Monday of month, 10:00 AM IST
- **Severity**: INFO
- **Recipients**: C-Suite email distribution
- **Content**: Monthly performance report

---

### 5.5 System Health Alerts (Continuous)

#### Alert SH-1: Sync Failure
- **Trigger**: Algolia sync fails or doesn't run
- **Check Frequency**: Every sync interval
- **Severity**: HIGH
- **Recipients**: #tech-alerts + Slack @tech-on-call
- **Action**: Investigate immediately, manual sync if needed

---

#### Alert SH-2: Metric Validation Failure
- **Trigger**: Status counts don't add up to total (>5% discrepancy)
- **Check Frequency**: After each metrics calculation
- **Severity**: MEDIUM
- **Recipients**: #tech-alerts
- **Action**: Investigate data quality issue

---

#### Alert SH-3: API Performance Degradation
- **Trigger**: Algolia response time >10 seconds or error rate >5%
- **Check Frequency**: Continuous monitoring
- **Severity**: MEDIUM
- **Recipients**: #tech-alerts
- **Action**: Check API health, consider fallback to Firestore

---

#### Alert SH-4: Rate Limit Warning
- **Trigger**: Approaching 80% of API rate limit
- **Check Frequency**: Every API call (tracked cumulatively)
- **Severity**: LOW
- **Recipients**: #tech-alerts
- **Action**: Optimize queries, request limit increase

---

### 5.6 Alert Priority Matrix

| Severity | Response Time | Channels | Escalation |
|----------|---------------|----------|------------|
| **HIGH** | <15 min | Slack DM + Channel + @mention | Auto-escalate after 30 min |
| **MEDIUM** | <2 hours | Slack Channel | Escalate if unresolved after 4 hours |
| **LOW** | <24 hours | Slack Channel | No auto-escalation |
| **INFO** | N/A (FYI only) | Slack Channel or Email | N/A |

---

### 5.7 Alert Fatigue Prevention

**Rules**:
1. **Aggregate**: Batch similar alerts (e.g., multiple providers inactive → "3 providers inactive")
2. **Snooze**: Allow team leads to snooze alerts for 1-2 hours (e.g., provider on break)
3. **Thresholds**: Make alert thresholds configurable per facility (NYCBS vs smaller facilities)
4. **Quiet Hours**: No alerts between 11 PM - 8 AM IST (unless critical system failure)
5. **Digest Mode**: Option to receive hourly digest instead of real-time alerts

---

## 6. IMPLEMENTATION ROADMAP

### Phase 1: SLA Tracking & Real-Time Monitoring (Weeks 1-4) - HIGHEST IMPACT
**Goal**: Add time-based metrics and real-time alerting

**Deliverables**:
1. **SLA Calculation**: Add time_to_assignment, time_to_completion calculations
2. **SLA Views**: Implement order_sla_metrics and current_sla_risk_orders views
3. **Real-Time Dashboard**: Add SLA metrics to BusinessView
4. **Alerts**:
   - SLA Breach Imminent (RT-1)
   - Performance Below Threshold (RT-3)
   - Provider Inactivity (RT-4)
5. **Daily SLA Report**: Add to daily leadership dashboard

**Files to Modify**:
- src/services/sheets.ts (add SLA query functions)
- src/services/sync.ts (calculate SLA metrics in calculateMetricsFromSnapshots)
- src/types/orders.ts (add OrderSLAMetrics interface)
- src/views/BusinessView.tsx (add SLA section)
- src/services/slackAlerts.ts (add new alert types)

**Success Metrics**:
- SLA compliance visible on dashboard
- Real-time alerts triggering correctly
- Team leads report improved visibility

---

### Phase 2: Velocity Trends & Bottleneck Analysis (Weeks 5-8) - HIGH IMPACT
**Goal**: Add trend analysis and bottleneck detection

**Deliverables**:
1. **Velocity Views**: Implement daily_velocity_trends, facility_velocity_comparison
2. **Bottleneck Views**: Implement status_duration_analysis, stuck_orders
3. **Trend Charts**: Add WoW/MoM growth charts to BusinessView
4. **Bottleneck Dashboard**: New section showing stuck orders by status
5. **Alerts**:
   - Bottleneck Detected (RT-2)
   - Approval Rate Drop (RT-5)
6. **Weekly Leadership Review**: Automated email report

**Files to Modify**:
- src/services/sheets.ts (add velocity and bottleneck queries)
- src/utils/businessMetrics.ts (add velocity calculations)
- src/components/business-view/ (add TrendChart, BottleneckTable components)
- src/services/slackAlerts.ts (add bottleneck alerts)
- New file: src/services/emailReports.ts

**Success Metrics**:
- Leadership can see trend direction (up/flat/down)
- Bottlenecks identified and visualized
- Weekly reports delivered on time

---

### Phase 3: Forecasting & Advanced Analytics (Weeks 9-12) - MEDIUM IMPACT
**Goal**: Add predictive analytics and optimization

**Deliverables**:
1. **Forecasting**: Implement volume_forecast, staffing_requirements
2. **Efficiency Views**: Implement provider_hourly_productivity, efficiency_distribution
3. **Quality Deep Dive**: Implement denial_root_cause_analysis, query_resolution_metrics
4. **Personal Dashboard**: New PersonalView for providers
5. **Anomaly Detection**: Implement anomaly_detection view and alerts
6. **Monthly Executive Report**: Automated PDF generation

**Files to Modify**:
- src/services/sheets.ts (add forecasting and quality queries)
- src/utils/personMetrics.ts (add efficiency calculations)
- New view: src/views/PersonalView.tsx
- New view: src/views/MonitoringView.tsx (for Product/Tech)
- src/services/emailReports.ts (add PDF generation)

**Success Metrics**:
- Accurate EOD projections within 10%
- Providers engage with personal dashboard
- Monthly reports inform strategic decisions

---

## 7. CRITICAL FILES TO MODIFY

### Core Data Layer
1. **src/types/orders.ts** - Add new interfaces (OrderSLAMetrics, VelocityTrends, BottleneckAnalysis, ProviderEfficiency, etc.)
2. **src/services/sheets.ts** - Add 15 new query functions for views
3. **src/services/sync.ts** - Enhance calculateMetricsFromSnapshots with SLA and velocity calculations

### UI Layer
4. **src/views/BusinessView.tsx** - Add SLA, velocity, and bottleneck sections
5. **src/views/PersonalView.tsx** - NEW: Personal provider dashboard
6. **src/views/MonitoringView.tsx** - NEW: System health monitoring

### Reporting Layer
7. **src/services/slackAlerts.ts** - Add 7 new alert types (RT-1 through RT-5, D-2, D-3)
8. **src/services/emailReports.ts** - NEW: Email report generation (daily, weekly, monthly)

### Supporting Files
9. **src/utils/businessMetrics.ts** - Add velocity and trend calculations
10. **src/utils/personMetrics.ts** - Add efficiency calculations
11. **src/components/business-view/** - Add new component files (SLAComplianceCard, TrendChart, BottleneckTable, EfficiencyLeaderboard)

---

## 8. RAW DATA UNDERSTANDING (Reference)

### Available Algolia Fields (50+)
The Algolia API provides comprehensive order data:
- **Core IDs**: objectID, id, order_id, org_id
- **Assignment**: assigned_to, assigned_to_name, assigned_at, assigned_at_iso
- **Statuses**: master_auth_status + 10 other status fields
- **Timestamps**: created_at, updated_at, date_of_work, indexed_at, auth_on_file_updated_at (all with ISO variants)
- **Patient**: patient_id, first_name, last_name, date_of_birth, patient_fhir_identifier
- **Treatment**: regimen_name, regimen_type, service_type, practitioner_name
- **Insurance**: primary_member_id, primary_payer_name, primary_active
- **Quality**: auth_on_file_error_type, auth_on_file_error_message
- **Flags**: mark_as_completed, alert_badges, alerts, ai_agent_type

### Current Transformation (12 Fields)
Raw Algolia data → OrderSnapshot:
- order_id, facility_id, provider_name, master_auth_status
- created_at, created_at_date, assigned_at, date_of_work
- is_assigned, is_worked, snapshot_timestamp, snapshot_hour_ist

### Status Flow Clarification (from user)
- **auth_required**: Scrubbed, auth needed but not initiated
- **pending**: Auth initiated, waiting for payer approval
- **query**: Raised query to practice team (drug change, guidelines)
- **hold**: Not working on case for specific reasons
- **auth_by_risa / denial_by_risa**: Final statuses after payer approval/denial
- **auth_on_file**: Authorization already on patient file
- **no_auth_required**: No auth needed for this treatment

---

## 9. SUCCESS CRITERIA

This framework will be successful if:

1. **Leadership has visibility**:
   - Can answer "are we on track?" in <5 seconds
   - Weekly trends visible at a glance
   - Strategic decisions backed by data

2. **Team leads can manage effectively**:
   - Know who needs help in real-time
   - Can balance workload proactively
   - Coaching based on data, not intuition

3. **Providers are empowered**:
   - Understand their performance vs. peers
   - Motivated by transparent metrics
   - No surprises in reviews

4. **Operations improve**:
   - SLA compliance >90%
   - Avg orders/person/day increases 10-15%
   - Bottlenecks identified and resolved quickly

5. **Data quality maintained**:
   - 99.9% uptime on data syncing
   - <5 minute data lag
   - Zero metric validation errors

---

## 10. NEXT STEPS

1. **User Approval**: Review this framework and approve for implementation
2. **Prioritization**: Confirm Phase 1 priority (SLA tracking + real-time alerts)
3. **Implementation**: Begin coding Phase 1 deliverables
4. **Testing**: Use NYCBS Jan 9 data to validate SLA calculations
5. **Rollout**: Deploy Phase 1 to production, gather feedback
6. **Iterate**: Refine thresholds and alerts based on real usage
7. **Continue**: Move to Phase 2 after Phase 1 success

---

**Document Version**: 1.0
**Date**: 2026-01-10
**Author**: Product Manager (Claude)
**Status**: Draft - Ready for Review and Implementation
