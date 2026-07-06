import { Link, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { NAV_ITEMS } from '@/config/navigation'
import { UserMenu } from '../auth/UserMenu'

export function Sidebar() {
  const location = useLocation()

  return (
    <aside className="peer fixed left-0 top-0 h-screen bg-card border-r border-border w-16 hover:w-60 transition-all duration-300 ease-in-out group overflow-hidden z-10">
      <div className="flex flex-col h-full pt-6">
        {/* Logo/Brand */}
        <div className="h-16 flex items-center px-4 border-b border-border mb-2">
          <div className="flex items-center gap-3 min-w-max">
            <div className="w-8 h-8 bg-primary rounded-md flex items-center justify-center">
              <span className="text-white font-bold text-sm">PA</span>
            </div>
            <span className="text-sm font-semibold text-foreground opacity-0 group-hover:opacity-100 transition-opacity">
              PA Analytics
            </span>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 py-4">
          {NAV_ITEMS.filter(item => item.enabled).map((item) => {
            const Icon = item.icon
            const isActive = location.pathname === item.path

            return (
              <Link
                key={item.id}
                to={item.path}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 mx-2 rounded-md transition-colors min-w-max",
                  isActive
                    ? "bg-primary text-white"
                    : "text-muted-foreground hover:bg-primary-50 hover:text-primary"
                )}
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                <span className="text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                  {item.label}
                </span>
              </Link>
            )
          })}
        </nav>

        {/* User Menu */}
        <div className="border-t border-border py-4">
          <UserMenu />
        </div>
      </div>
    </aside>
  )
}
