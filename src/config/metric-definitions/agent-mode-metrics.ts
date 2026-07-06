export const AGENT_MODE_METRIC_DEFINITIONS = {
  agentCompletionPct: {
    title: 'Agent Completion %',
    description: 'Percentage of orders completed by the AI agent vs human team members. Calculated as: (Completed by Agent) ÷ (Total Completed by Agent + Human) × 100. Measures automation penetration.',
  },
  noTouchPct: {
    title: 'No Touch %',
    description: 'Percentage of orders completed end-to-end by the agent without human intervention. Calculated as: (Agent Orders with Review Passed) ÷ (Total Completed + In Progress) × 100. True automation metric.',
  },
  narPassRate: {
    title: 'NAR Agent Pass Rate',
    description: 'Success rate of AI agent on No Auth Required (NAR) orders. Calculated as: (Review Passed) ÷ (Review Passed + Review Rejected) × 100. Measures agent accuracy on NAR orders specifically.',
  },
  completedByAgent: {
    title: 'Completed by Agent',
    description: 'Total number of orders completed by the AI agent during the selected period. Represents automated workflow volume.',
  },
  completedByHuman: {
    title: 'Completed by Human',
    description: 'Total number of orders completed by human team members during the selected period. Represents manual workflow volume.',
  },
  agentReviewPassed: {
    title: 'Agent Review Passed',
    description: 'Number of agent-completed orders that passed human quality review. Indicates high-quality agent work requiring no corrections.',
  },
  agentReviewRejected: {
    title: 'Agent Review Rejected',
    description: 'Number of agent-completed orders that failed human quality review. Requires rework or correction by human team members.',
  },
}
