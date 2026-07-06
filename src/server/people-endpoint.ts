/**
 * People View API Endpoint
 * This code should be inserted into api.ts before the health check endpoint
 */

// Add this endpoint to api.ts:

/**
 * API: Fetch person performance data for People View
 * Query params: personId, startDate, endDate, includeWeekends
 */
app.get('/api/people-metrics/person-performance', async (req, res) => {
  try {
    const { personId, startDate, endDate, includeWeekends } = req.query;

    // Validate required parameters
    if (!personId || !startDate || !endDate) {
      return res.status(400).json({
        error: 'personId, startDate, and endDate are required'
      });
    }

    // Find person in team members
    const person = TEAM_MEMBERS.find(m => m.id === personId);
    if (!person) {
      return res.status(404).json({ error: 'Person not found' });
    }

    const personName = person.name;
    const sheets = getSheetsClient();

    // Fetch orders_raw_hourly data
    console.log(`[People API] Fetching orders for ${personName} from ${startDate} to ${endDate}`);
    const ordersResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEETS_ID,
      range: 'orders_raw_hourly!A:N',
    });
    const orderRows = (ordersResponse.data.values || []).slice(1); // Skip header

    // Fetch person_hourly_performance data
    const personMetricsResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEETS_ID,
      range: 'person_hourly_performance!A:N',
    });
    const personMetricsRows = (personMetricsResponse.data.values || []).slice(1); // Skip header

    // Fetch working days config
    const workingDays = await getWorkingDaysInRange(startDate as string, endDate as string);
    const workingDaySet = new Set(
      workingDays.filter(wd => wd.is_working_day).map(wd => wd.date)
    );

    // Filter orders by person and date range
    // Column indices: [0]=snapshot_timestamp, [1]=snapshot_hour_ist, [2]=order_id, [3]=facility_id,
    // [4]=provider_name, [5]=master_auth_status, [6]=created_at, [7]=created_at_date,
    // [8]=assigned_at, [9]=date_of_work, [10]=is_assigned, [11]=is_worked
    const personOrders = orderRows.filter(row => {
      const providerName = row[4];
      const createdAtDate = row[7];
      const isWorked = row[11] === 'TRUE' || row[11] === 'true';

      return (
        providerName === personName &&
        createdAtDate >= startDate &&
        createdAtDate <= endDate &&
        isWorked
      );
    });

    console.log(`[People API] Found ${personOrders.length} orders for ${personName}`);

    // Group orders by date
    const ordersByDate = new Map<string, any[]>();
    personOrders.forEach(order => {
      const date = order[7]; // created_at_date
      if (!ordersByDate.has(date)) {
        ordersByDate.set(date, []);
      }
      ordersByDate.get(date)!.push(order);
    });

    // Helper function to count status
    const countStatus = (orders: any[], status: string): number => {
      return orders.filter(o => o[5] === status).length;
    };

    // Helper function to calculate status breakdown
    const getStatusBreakdown = (orders: any[]): StatusBreakdown => {
      return {
        authByRisa: countStatus(orders, 'auth_by_risa'),
        authOnFile: countStatus(orders, 'auth_on_file'),
        noAuthRequired: countStatus(orders, 'no_auth_required'),
        denialByRisa: countStatus(orders, 'denial_by_risa'),
        denialAfterQuery: countStatus(orders, 'denial_after_query'),
        existingDenial: countStatus(orders, 'existing_denial'),
        query: countStatus(orders, 'query'),
        pending: countStatus(orders, 'pending'),
        hold: countStatus(orders, 'hold'),
        authRequired: countStatus(orders, 'auth_required'),
        other: orders.length - [
          'auth_by_risa', 'auth_on_file', 'no_auth_required',
          'denial_by_risa', 'denial_after_query', 'existing_denial',
          'query', 'pending', 'hold', 'auth_required'
        ].reduce((sum, status) => sum + countStatus(orders, status), 0),
      };
    };

    // Helper function to parse time and calculate hours
    const calculateHours = (loginTime: string | null, logoffTime: string | null): number | null => {
      if (!loginTime || !logoffTime) return null;

      const [loginHours, loginMinutes] = loginTime.split(':').map(Number);
      const [logoffHours, logoffMinutes] = logoffTime.split(':').map(Number);

      if (isNaN(loginHours) || isNaN(loginMinutes) || isNaN(logoffHours) || isNaN(logoffMinutes)) {
        return null;
      }

      return (logoffHours + logoffMinutes / 60) - (loginHours + loginMinutes / 60);
    };

    // Build daily breakdown
    const dailyBreakdown: DailyPersonPerformance[] = [];
    const allDates = Array.from(ordersByDate.keys()).sort();

    for (const date of allDates) {
      const ordersForDate = ordersByDate.get(date)!;

      // Get unique organizations worked
      const facilitiesWorked = [...new Set(ordersForDate.map(o => o[3]))];
      const organizations = facilitiesWorked.map(fid => {
        const org = ORGANIZATIONS.find(o => o.facilityId === fid);
        return org ? org.id.toUpperCase() : fid;
      });

      // Count assigned vs worked
      const ordersAssigned = ordersForDate.filter(o => o[10] === 'TRUE' || o[10] === 'true').length;
      const ordersWorked = ordersForDate.filter(o => o[11] === 'TRUE' || o[11] === 'true').length;
      const ordersNotWorked = ordersAssigned - ordersWorked;
      const completionRate = ordersAssigned > 0 ? (ordersWorked / ordersAssigned) * 100 : null;

      // Get person metrics for this date
      const personMetric = personMetricsRows.find(row => {
        const rowDate = row[2]; // created_at_date column
        const rowProviderName = row[4]; // provider_name column
        return rowDate === date && rowProviderName === personName;
      });

      const loginTime = personMetric ? personMetric[10] : null; // login_time column
      const logoffTime = personMetric ? personMetric[11] : null; // logoff_time column
      const hoursWorked = calculateHours(loginTime, logoffTime);
      const paceVsAvg = personMetric ? parseFloat(personMetric[9]) || 0 : 0; // person_pace_vs_avg column
      const paceStatus = personMetric ? personMetric[13] : 'ON_PACE'; // person_pace_status column

      // Map pace status to performance status
      let performanceStatus: 'above' | 'on_pace' | 'below' = 'on_pace';
      if (paceStatus === 'AHEAD') performanceStatus = 'above';
      else if (paceStatus === 'BEHIND') performanceStatus = 'below';

      // Format login/logoff times
      const formatTime = (time: string | null): string | null => {
        if (!time) return null;
        const parts = time.split(':');
        return `${parts[0]}:${parts[1]}`; // HH:MM
      };

      dailyBreakdown.push({
        date,
        dayOfWeek: new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' }),
        isWorkingDay: workingDaySet.has(date),
        organizations,
        ordersAssigned,
        ordersWorked,
        ordersNotWorked,
        completionRate,
        statusBreakdown: getStatusBreakdown(ordersForDate),
        loginTime: formatTime(loginTime),
        logoffTime: formatTime(logoffTime),
        hoursWorked,
        performanceStatus,
        paceVsAvg,
      });
    }

    // Apply weekend filter if needed
    let filteredDailyBreakdown = dailyBreakdown;
    if (includeWeekends === 'false') {
      filteredDailyBreakdown = dailyBreakdown.filter(day => day.isWorkingDay);
    }

    // Calculate summary metrics
    const totalOrdersCreated = [...new Set(personOrders.map(o => o[2]))].length; // Unique order_ids
    const totalOrdersAssigned = filteredDailyBreakdown.reduce((sum, day) => sum + day.ordersAssigned, 0);
    const totalOrdersCompleted = filteredDailyBreakdown.reduce((sum, day) => sum + day.ordersWorked, 0);
    const completionRate = totalOrdersAssigned > 0 ? (totalOrdersCompleted / totalOrdersAssigned) * 100 : null;

    // Calculate status breakdown for all orders
    const allOrders = filteredDailyBreakdown.flatMap(day => ordersByDate.get(day.date) || []);
    const statusBreakdown = getStatusBreakdown(allOrders);

    // Calculate approval rate and authorization rate
    const authByRisa = statusBreakdown.authByRisa;
    const denialByRisa = statusBreakdown.denialByRisa;
    const approvalRate = (authByRisa + denialByRisa) > 0
      ? (authByRisa / (authByRisa + denialByRisa)) * 100
      : null;

    const authorized = statusBreakdown.authByRisa + statusBreakdown.authOnFile + statusBreakdown.noAuthRequired;
    const denied = statusBreakdown.denialByRisa + statusBreakdown.denialAfterQuery + statusBreakdown.existingDenial;
    const authorizationRate = (authorized + denied) > 0
      ? (authorized / (authorized + denied)) * 100
      : null;

    // Calculate hours worked
    const totalHoursWorked = filteredDailyBreakdown.reduce((sum, day) => sum + (day.hoursWorked || 0), 0);
    const avgHoursPerDay = filteredDailyBreakdown.length > 0
      ? totalHoursWorked / filteredDailyBreakdown.length
      : 0;

    // Build summary
    const summary: PersonPerformanceSummary = {
      personName,
      personId: personId as string,
      organization: person.organization,
      totalOrdersCreated,
      totalOrdersAssigned,
      totalOrdersCompleted,
      completionRate,
      approvalRate,
      authorizationRate,
      statusBreakdown,
      totalHoursWorked,
      avgHoursPerDay,
      dateRange: {
        startDate: startDate as string,
        endDate: endDate as string,
      },
      workingDaysCount: filteredDailyBreakdown.length,
    };

    console.log(`[People API] Returning summary for ${personName}: ${totalOrdersCompleted} orders completed`);

    res.json({
      summary,
      dailyBreakdown: filteredDailyBreakdown,
    });
  } catch (error) {
    console.error('[People API] Error fetching person performance:', error);
    res.status(500).json({
      error: 'Failed to fetch person performance data',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});
