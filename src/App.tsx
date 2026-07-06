import { Routes, Route, Navigate } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { AppLayout } from './components/layout/AppLayout';
import { DailyView } from './views/DailyView';
import { BusinessView } from './views/BusinessView';
import { QueueView } from './views/QueueView';
import { PeopleView } from './views/PeopleView';
import { EVMetricsView } from './views/EVMetricsView';
import { RPAMetricsView } from './views/RPAMetricsView';
import { AgentModeMetricsView } from './views/AgentModeMetricsView';
import { SystemConfigView } from './views/SystemConfigView';
import { FunnelMetricsView } from './views/FunnelMetricsView';
import { BillingAnalyticsView } from './views/BillingAnalyticsView';
import { FEATURE_FLAGS } from './config/features';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

function App() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <AuthProvider>
        <ProtectedRoute>
          <AppLayout>
            <Routes>
              <Route path="/" element={<BusinessView />} />
              {FEATURE_FLAGS.ENABLE_DAILY_VIEW && (
                <Route path="/daily" element={<DailyView />} />
              )}
              {FEATURE_FLAGS.ENABLE_QUEUE_VIEW && (
                <Route path="/queue" element={<QueueView />} />
              )}
              {FEATURE_FLAGS.ENABLE_PEOPLE_VIEW && (
                <Route path="/people" element={<PeopleView />} />
              )}
              {FEATURE_FLAGS.ENABLE_EV_METRICS && (
                <Route path="/ev-metrics" element={<EVMetricsView />} />
              )}
              {FEATURE_FLAGS.ENABLE_RPA_METRICS && (
                <Route path="/rpa-metrics" element={<RPAMetricsView />} />
              )}
              {FEATURE_FLAGS.ENABLE_AGENT_MODE_METRICS && (
                <Route path="/agent-mode" element={<AgentModeMetricsView />} />
              )}
              {FEATURE_FLAGS.ENABLE_FUNNEL_METRICS && (
                <Route path="/funnel-metrics" element={<FunnelMetricsView />} />
              )}
              {FEATURE_FLAGS.ENABLE_BILLING_ANALYTICS && (
                <Route path="/billing-analytics" element={<BillingAnalyticsView />} />
              )}
              {FEATURE_FLAGS.ENABLE_SYSTEM_CONFIG && (
                <Route path="/system-config" element={<SystemConfigView />} />
              )}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AppLayout>
        </ProtectedRoute>
      </AuthProvider>
    </GoogleOAuthProvider>
  );
}

export default App;
