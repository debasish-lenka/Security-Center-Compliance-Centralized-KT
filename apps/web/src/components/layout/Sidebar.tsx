import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { ChevronLeft, ChevronRight, Shield } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { getVisibleSections, getVisibleItems, type UserRole } from '@/config/navigation.config';

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const { user } = useAuth();
  const userRole = user?.role as UserRole | undefined;
  const visibleSections = getVisibleSections(userRole);

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-40 h-screen border-r bg-dbi-sidebar transition-all duration-300',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      <div className="flex h-full flex-col">
        <div className="flex h-16 items-center justify-between border-b px-4">
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
            onClick={() => setCollapsed(!collapsed)}
            className="text-dbi-textSecondary hover:text-dbi-textPrimary"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <nav className="flex-1 p-3 space-y-4">
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
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
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
        </ScrollArea>

        <div className="border-t p-3">
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