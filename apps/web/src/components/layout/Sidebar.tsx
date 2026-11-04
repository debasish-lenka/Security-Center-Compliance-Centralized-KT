import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ChevronLeft, ChevronRight, Shield } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { getVisibleSections, getVisibleItems, type UserRole } from '@/config/navigation.config';

export function Sidebar({ mobileOpen = false, onClose }: { mobileOpen?: boolean; onClose?: () => void }) {
  const [collapsedPref, setCollapsed] = useState(false);
  // the drawer on a small screen is always shown in full
  const collapsed = collapsedPref && !mobileOpen;
  const { user } = useAuth();
  const userRole = user?.role as UserRole | undefined;
  const visibleSections = getVisibleSections(userRole);

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-40 h-[100dvh] w-64 border-r bg-dbi-sidebar transition-transform duration-300 lg:translate-x-0 lg:transition-all',
        mobileOpen ? 'translate-x-0' : '-translate-x-full',
        collapsed && 'lg:w-16'
      )}
    >
      <div className="flex h-full flex-col">
        <div className="flex h-16 shrink-0 items-center justify-between border-b px-4">
          {!collapsed && (
            <Link to="/dashboard" className="flex items-center gap-2">
              <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500">
                <Shield className="h-5 w-5 text-background" />
              </div>
              <span className="font-semibold text-lg text-dbi-textPrimary">DBI Security Center</span>
            </Link>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => (mobileOpen ? onClose?.() : setCollapsed(!collapsedPref))}
            className="text-dbi-textSecondary hover:text-dbi-textPrimary"
            aria-label={mobileOpen ? 'Close menu' : collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <nav className="space-y-4 p-3 pb-6">
            {visibleSections.map((section) => (
              <div key={section.label} className="space-y-1">
                {!collapsed && (
                  <h3 className="px-3 text-xs font-semibold text-dbi-textMuted uppercase tracking-wider">
                    {section.label}
                  </h3>
                )}
                {getVisibleItems(section, userRole).map((item) => (
                  <NavLink
                    key={item.href}
                    to={item.href}
                    onClick={onClose}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors [@media(max-height:760px)]:py-1.5',
                        isActive
                          ? 'bg-dbi-cyan/10 text-dbi-cyan'
                          : 'text-dbi-textSecondary hover:bg-dbi-elevated hover:text-dbi-textPrimary',
                        collapsed && 'justify-center'
                      )
                    }
                    title={collapsed ? item.name : undefined}
                  >
                    <item.icon className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
                    {!collapsed && <span>{item.name}</span>}
                  </NavLink>
                ))}
                {!collapsed && section !== visibleSections[visibleSections.length - 1] && (
                  <Separator className="my-2" />
                )}
              </div>
            ))}
          </nav>
        </div>

        <div className="shrink-0 border-t p-3">
          {!collapsed && (
            <div className="flex items-center gap-3 px-3 py-2">
              <div className="h-8 w-8 rounded-full bg-dbi-cyan/20 flex items-center justify-center">
                <span className="text-sm font-medium text-dbi-cyan">
                  {user?.fullName?.charAt(0).toUpperCase() || 'U'}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-dbi-textPrimary truncate">{user?.fullName}</p>
                <p className="text-xs text-dbi-textSecondary capitalize">
                  {user?.role?.toLowerCase?.().replace('_', ' ')}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}