export const BUSINESS_METRIC_DEFINITIONS = {
  opd: {
    title: 'OPD - Orders Per Person Per Day',
    description: 'Average number of orders completed per active team member per working day. Calculated as: Total Billable Orders ÷ Active Users ÷ Working Days. Excludes Risa Agent from user count.',
  },
  totalOrdersLoaded: {
    title: 'Total Orders Loaded',
    description: 'Total number of prior authorization orders loaded into the system during the selected date range.',
  },
  totalOrdersWorked: {
    title: 'Total Orders Worked',
    description: 'Total number of orders completed by the team during the selected date range. Represents actual work output.',
  },
  approvalRate: {
    title: 'Approval Rate',
    description: 'Success rate of newly initiated authorizations. Calculated as: (Auth by Risa) ÷ (Auth by Risa + Denial by Risa) × 100. Measures effectiveness of initial authorization attempts.',
  },
  authorizationRate: {
    title: 'Authorization Rate',
    description: 'Percentage of completed auth-related orders that were successfully authorized. Calculated as: (Auth by RISA + NAR + Auth on File) ÷ (All Completed Orders) × 100. Higher is better.',
  },
  authByRisa: {
    title: 'Auth by Risa',
    description: 'Orders where authorization was successfully obtained by the Risa team. Represents new authorizations secured.',
  },
  authOnFile: {
    title: 'Auth on File',
    description: 'Orders where authorization was already on file and no new authorization was needed. Leverages existing approvals.',
  },
  noAuthRequired: {
    title: 'No Auth Required (NAR)',
    description: 'Orders that did not require prior authorization based on payer policies. These orders can proceed without authorization.',
  },
  denialByRisa: {
    title: 'Denial by Risa',
    description: 'Orders where the initial authorization attempt was denied by the payer. May require appeal or additional documentation.',
  },
  denialAfterQuery: {
    title: 'Denial After Query',
    description: 'Orders denied after additional information was provided in response to payer queries. Final denial after follow-up attempts.',
  },
}
