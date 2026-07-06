# Backend L7D Implementation Guide

## Issue
The two L7D tables are showing "No data available" because the backend API is not calculating and returning the daily trend data.

## Required Changes

### Location
`src/server/api.ts` - Agent Mode Metrics endpoint (around line 1849-1905)

### Current Implementation
```typescript
// Line 1889
const metrics: AgentModeMetricsData = calculateAgentModeMetrics(filteredOrders);
```

The `calculateAgentModeMetrics` function returns empty arrays for L7D data.

### Solution: Add L7D Calculation Functions

#### Step 1: Add helper function to calculate daily trends

Add this function before the `/api/agent-mode-metrics` endpoint:

```typescript
import type {
  NARAgentDailyTrend,
  NARAgentReviewDaily,
} from '../types/agentModeMetrics';
import { NAR_AUTH_STATUS, MEDICAL_ORDER_STATUS, MEDICAL_ORDER_REVIEW_STATUS } from '../types/agentModeMetrics';

/**
 * Calculate NAR daily trend data from orders
 */
function calculateNARDailyTrend(
  orders: UniqueOrderStatus[],
  startDate: string,
  endDate: string
): NARAgentDailyTrend[] {
  // Filter NAR orders
  const narOrders = orders.filter((o) => o.auth_status === NAR_AUTH_STATUS);

  // Group orders by date
  const dateMap = new Map<string, NARAgentDailyTrend>();

  // Initialize dates in range
  const start = new Date(startDate);
  const end = new Date(endDate);
  const dates: string[] = [];

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];
    dates.push(dateStr);
    dateMap.set(dateStr, {
      date: dateStr,
      yetToStart: 0,
      pending: 0,
      completedByHuman: 0,
      completedByAgent: 0,
      totalNAR: 0,
    });
  }

  // Count orders by date and status
  for (const order of narOrders) {
    // Use order_date or last_changed_at for grouping
    const orderDate = order.order_date || order.last_changed_at;
    if (!orderDate) continue;

    const dateStr = new Date(orderDate).toISOString().split('T')[0];
    const dayData = dateMap.get(dateStr);
    if (!dayData) continue;

    dayData.totalNAR++;

    switch (order.medical_order_status) {
      case MEDICAL_ORDER_STATUS.YET_TO_START:
        dayData.yetToStart++;
        break;
      case MEDICAL_ORDER_STATUS.IN_PROGRESS:
        dayData.pending++;
        break;
      case MEDICAL_ORDER_STATUS.COMPLETED_BY_HUMAN:
        dayData.completedByHuman++;
        break;
      case MEDICAL_ORDER_STATUS.COMPLETED_BY_AGENT:
        dayData.completedByAgent++;
        break;
    }
  }

  // Return last 7 days in descending order
  return dates
    .slice(-7)
    .map((date) => dateMap.get(date)!)
    .reverse();
}

/**
 * Calculate NAR agent review daily data
 */
function calculateNARReviewDaily(
  orders: UniqueOrderStatus[],
  startDate: string,
  endDate: string
): NARAgentReviewDaily[] {
  // Filter NAR orders completed by agent
  const narAgentOrders = orders.filter(
    (o) =>
      o.auth_status === NAR_AUTH_STATUS &&
      o.medical_order_status === MEDICAL_ORDER_STATUS.COMPLETED_BY_AGENT
  );

  // Group orders by date
  const dateMap = new Map<string, NARAgentReviewDaily>();

  // Initialize dates in range
  const start = new Date(startDate);
  const end = new Date(endDate);
  const dates: string[] = [];

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];
    dates.push(dateStr);
    dateMap.set(dateStr, {
      date: dateStr,
      totalNARAgentCompleted: 0,
      reviewPassed: 0,
      reviewRejected: 0,
      reviewPending: 0,
      reviewNotRequired: 0,
      passRatePct: 0,
    });
  }

  // Count orders by date and review status
  for (const order of narAgentOrders) {
    const orderDate = order.order_date || order.last_changed_at;
    if (!orderDate) continue;

    const dateStr = new Date(orderDate).toISOString().split('T')[0];
    const dayData = dateMap.get(dateStr);
    if (!dayData) continue;

    dayData.totalNARAgentCompleted++;

    switch (order.medical_order_review_status) {
      case MEDICAL_ORDER_REVIEW_STATUS.PASSED:
        dayData.reviewPassed++;
        break;
      case MEDICAL_ORDER_REVIEW_STATUS.REJECTED:
        dayData.reviewRejected++;
        break;
      case MEDICAL_ORDER_REVIEW_STATUS.PENDING:
        dayData.reviewPending++;
        break;
      case MEDICAL_ORDER_REVIEW_STATUS.NOT_REQUIRED:
        dayData.reviewNotRequired++;
        break;
    }
  }

  // Calculate pass rates
  for (const dayData of dateMap.values()) {
    const totalReviewed = dayData.reviewPassed + dayData.reviewRejected;
    dayData.passRatePct =
      totalReviewed > 0 ? (dayData.reviewPassed / totalReviewed) * 100 : 0;
  }

  // Return last 7 days in descending order
  return dates
    .slice(-7)
    .map((date) => dateMap.get(date)!)
    .reverse();
}
```

#### Step 2: Update the API endpoint

Replace the metrics calculation section (around line 1888-1896) with:

```typescript
// Calculate base metrics
const baseMetrics = calculateAgentModeMetrics(filteredOrders);

// Calculate L7D trends
const narDailyTrend = calculateNARDailyTrend(
  filteredOrders,
  startDate as string,
  endDate as string
);

const narReviewDaily = calculateNARReviewDaily(
  filteredOrders,
  startDate as string,
  endDate as string
);

// Combine all metrics
const metrics: AgentModeMetricsData = {
  ...baseMetrics,
  narDailyTrend,
  narL7DAverage: null, // Frontend calculates this
  narReviewDaily,
  narReviewL7DAverage: null, // Frontend calculates this
};

const duration = Date.now() - startTime;
console.log(`[Agent Mode API] Completed in ${duration}ms`);
console.log(`[Agent Mode API] Daily trend days: ${narDailyTrend.length}`);
console.log(`[Agent Mode API] Review daily days: ${narReviewDaily.length}`);

res.json({
  success: true,
  data: metrics,
});
```

## Alternative: Use order_date vs last_changed_at

The current implementation uses `order_date` or falls back to `last_changed_at` for grouping. You may want to:

1. **Use `order_date`** - Groups by when the order was created
2. **Use `last_changed_at`** - Groups by when the order status last changed
3. **Use a specific status change timestamp** - If you track when status changed to completed

Choose based on your business requirements.

## Testing

After implementing, test with:

```bash
curl "http://localhost:3001/api/agent-mode-metrics?startDate=2026-01-28&endDate=2026-02-04&organizationIds=HhwIHO4npKhrxyylkC33"
```

You should see `narDailyTrend` and `narReviewDaily` arrays with 7 days of data.

## Expected Response Structure

```json
{
  "success": true,
  "data": {
    "overview": { ... },
    "narAgentReview": { ... },
    "narOrdersByPlan": [ ... ],
    "narDailyTrend": [
      {
        "date": "2026-02-04",
        "yetToStart": 10,
        "pending": 15,
        "completedByHuman": 25,
        "completedByAgent": 50,
        "totalNAR": 100
      },
      // ... 6 more days
    ],
    "narL7DAverage": null,
    "narReviewDaily": [
      {
        "date": "2026-02-04",
        "totalNARAgentCompleted": 50,
        "reviewPassed": 45,
        "reviewRejected": 3,
        "reviewPending": 2,
        "reviewNotRequired": 0,
        "passRatePct": 93.75
      },
      // ... 6 more days
    ],
    "narReviewL7DAverage": null
  }
}
```

## Notes

- The frontend will automatically calculate the L7D averages from the daily data
- Make sure to import the required types and constants at the top of the file
- The date range should ideally be 7 days, but the function will handle any range and return the last 7 days
- Orders without dates will be skipped
