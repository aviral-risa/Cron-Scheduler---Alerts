import { BarChart3, Calendar, ListOrdered, Users, Activity, Bot, Cpu, Settings, Filter, Receipt } from 'lucide-react'
import { FEATURE_FLAGS } from './features'

export interface NavItem {
  id: string
  label: string
  path: string
  icon: React.ComponentType<{ className?: string }>
  enabled: boolean
}

export const NAV_ITEMS: NavItem[] = [
  {
    id: 'business',
    label: 'Business Metrics',
    path: '/',
    icon: BarChart3,
    enabled: true,
  },
  {
    id: 'funnel',
    label: 'Funnel Metrics',
    path: '/funnel-metrics',
    icon: Filter,
    enabled: FEATURE_FLAGS.ENABLE_FUNNEL_METRICS,
  },
  {
    id: 'agent',
    label: 'Agent Mode',
    path: '/agent-mode',
    icon: Cpu,
    enabled: FEATURE_FLAGS.ENABLE_AGENT_MODE_METRICS,
  },
  {
    id: 'queue',
    label: 'Queue Status',
    path: '/queue',
    icon: ListOrdered,
    enabled: FEATURE_FLAGS.ENABLE_QUEUE_VIEW,
  },
  {
    id: 'daily',
    label: 'Daily Performance',
    path: '/daily',
    icon: Calendar,
    enabled: FEATURE_FLAGS.ENABLE_DAILY_VIEW,
  },
  {
    id: 'people',
    label: 'People Metrics',
    path: '/people',
    icon: Users,
    enabled: FEATURE_FLAGS.ENABLE_PEOPLE_VIEW,
  },
  {
    id: 'ev',
    label: 'EV Metrics',
    path: '/ev-metrics',
    icon: Activity,
    enabled: FEATURE_FLAGS.ENABLE_EV_METRICS,
  },
  {
    id: 'rpa',
    label: 'RPA Metrics',
    path: '/rpa-metrics',
    icon: Bot,
    enabled: FEATURE_FLAGS.ENABLE_RPA_METRICS,
  },
  {
    id: 'billing-analytics',
    label: 'Billing Analytics',
    path: '/billing-analytics',
    icon: Receipt,
    enabled: FEATURE_FLAGS.ENABLE_BILLING_ANALYTICS,
  },
  {
    id: 'system-config',
    label: 'System Config',
    path: '/system-config',
    icon: Settings,
    enabled: FEATURE_FLAGS.ENABLE_SYSTEM_CONFIG,
  },
]
