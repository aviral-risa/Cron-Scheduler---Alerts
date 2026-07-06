import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { FEATURE_FLAGS } from '@/config/features';

export function Navigation() {
  const location = useLocation();

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  return (
    <nav className="flex gap-2 mb-6">
      <Link to="/">
        <Button
          variant={isActive('/') ? 'default' : 'outline'}
          className="min-w-[120px]"
        >
          Business View
        </Button>
      </Link>
      <Link to="/daily">
        <Button
          variant={isActive('/daily') ? 'default' : 'outline'}
          className="min-w-[120px]"
        >
          Daily View
        </Button>
      </Link>
      {FEATURE_FLAGS.ENABLE_QUEUE_VIEW && (
        <Link to="/queue">
          <Button
            variant={isActive('/queue') ? 'default' : 'outline'}
            className="min-w-[120px]"
          >
            Queue View
          </Button>
        </Link>
      )}
      {FEATURE_FLAGS.ENABLE_PEOPLE_VIEW && (
        <Link to="/people">
          <Button
            variant={isActive('/people') ? 'default' : 'outline'}
            className="min-w-[120px]"
          >
            People View
          </Button>
        </Link>
      )}
      {FEATURE_FLAGS.ENABLE_EV_METRICS && (
        <Link to="/ev-metrics">
          <Button
            variant={isActive('/ev-metrics') ? 'default' : 'outline'}
            className="min-w-[120px]"
          >
            EV Metrics
          </Button>
        </Link>
      )}
      {FEATURE_FLAGS.ENABLE_RPA_METRICS && (
        <Link to="/rpa-metrics">
          <Button
            variant={isActive('/rpa-metrics') ? 'default' : 'outline'}
            className="min-w-[120px]"
          >
            RPA Metrics
          </Button>
        </Link>
      )}
      {FEATURE_FLAGS.ENABLE_AGENT_MODE_METRICS && (
        <Link to="/agent-mode">
          <Button
            variant={isActive('/agent-mode') ? 'default' : 'outline'}
            className="min-w-[120px]"
          >
            NAR Agent Mode
          </Button>
        </Link>
      )}
    </nav>
  );
}
