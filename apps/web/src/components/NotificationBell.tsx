import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Bell, Check, CheckCheck, X } from 'lucide-react';
import { useNotifications } from '@/hooks/useNotifications';
import { formatRelativeTime } from '@/lib/utils';

interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  createdAt: string;
  link: string | null;
}

const typeIcons: Record<string, React.ReactNode> = {
  SECURITY_ALERT: <Bell className="h-4 w-4 text-rose-400" />,
  SUCCESS: <CheckCheck className="h-4 w-4 text-emerald-400" />,
  WARNING: <Bell className="h-4 w-4 text-amber-400" />,
  ERROR: <Bell className="h-4 w-4 text-rose-400" />,
  INFO: <Bell className="h-4 w-4 text-cyan-400" />,
  CRITICAL: <Bell className="h-4 w-4 text-red-400" />,
  PROJECT_UPDATE: <Bell className="h-4 w-4 text-indigo-400" />,
  KT_REPORT: <Bell className="h-4 w-4 text-purple-400" />,
  COMPLIANCE: <Bell className="h-4 w-4 text-blue-400" />,
  SYSTEM: <Bell className="h-4 w-4 text-gray-400" />,
};

const typeColors: Record<string, string> = {
  SECURITY_ALERT: 'bg-rose-500/20 text-rose-300',
  SUCCESS: 'bg-emerald-500/20 text-emerald-300',
  WARNING: 'bg-amber-500/20 text-amber-300',
  ERROR: 'bg-rose-500/20 text-rose-300',
  INFO: 'bg-cyan-500/20 text-cyan-300',
  CRITICAL: 'bg-red-500/20 text-red-300',
  PROJECT_UPDATE: 'bg-indigo-500/20 text-indigo-300',
  KT_REPORT: 'bg-purple-500/20 text-purple-300',
  COMPLIANCE: 'bg-blue-500/20 text-blue-300',
  SYSTEM: 'bg-gray-500/20 text-gray-300',
};

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  const { notifications, unreadCount, isLoading, markAsRead, markAllAsRead, deleteNotification } = useNotifications();

  const handleMarkAsRead = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    await markAsRead(id);
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    await deleteNotification(id);
  };

  const handleClickNotification = (notification: Notification, e: React.MouseEvent) => {
    if (!notification.read) {
      markAsRead(notification.id);
    }
    if (notification.link) {
      e.preventDefault();
      navigate(notification.link);
      setIsOpen(false);
    }
  };

  const handleMarkAllRead = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    await markAllAsRead();
  };

  const handleViewAll = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigate('/notifications');
    setIsOpen(false);
  };

  // Get latest 5 notifications for dropdown
  const recentNotifications = notifications.slice(0, 5);

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 rounded-lg text-dbi-textSecondary hover:text-dbi-textPrimary hover:bg-dbi-elevated"
          aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-dbi-critical text-[10px] font-bold text-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80 max-h-[400px] overflow-hidden">
        <DropdownMenuLabel className="flex items-center justify-between px-2 py-1">
          <span className="font-medium">Notifications</span>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={handleMarkAllRead} className="text-xs h-6 px-2">
              <Check className="mr-1 h-3 w-3" />
              Mark all read
            </Button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {isLoading ? (
          <div className="p-4 space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-16 animate-pulse bg-dbi-elevated rounded-lg" />
            ))}
          </div>
        ) : recentNotifications.length === 0 ? (
          <div className="p-8 text-center">
            <Bell className="mx-auto h-12 w-12 text-dbi-textSecondary" />
            <p className="mt-2 text-sm text-dbi-textSecondary">No notifications</p>
            <p className="text-xs text-dbi-textSecondary">You're all caught up!</p>
          </div>
        ) : (
          <div className="max-h-64 overflow-y-auto">
            {recentNotifications.map((notification: Notification) => (
              <DropdownMenuItem
                key={notification.id}
                className={`relative flex flex-col items-start gap-1 p-3 hover:bg-dbi-elevated/50 ${!notification.read ? 'bg-dbi-cyan/5' : ''}`}
                onClick={(e) => handleClickNotification(notification, e)}
                inset
              >
                <div className="flex items-start gap-2 w-full">
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 ${typeColors[notification.type] || 'bg-indigo-500/20 text-indigo-300'}`}>
                    {typeIcons[notification.type] || typeIcons.INFO}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${!notification.read ? 'font-medium text-dbi-textPrimary' : 'text-dbi-textSecondary'}`}>
                      {notification.title}
                    </p>
                    <p className="text-xs text-dbi-textSecondary truncate">{notification.message}</p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs text-dbi-textSecondary">{formatRelativeTime(notification.createdAt)}</span>
                      <div className="flex items-center gap-1">
                        {!notification.read && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-dbi-cyan hover:text-dbi-cyan"
                            onClick={(e) => handleMarkAsRead(notification.id, e)}
                            title="Mark as read"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-dbi-critical hover:text-dbi-critical"
                          onClick={(e) => handleDelete(notification.id, e)}
                          title="Delete"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </DropdownMenuItem>
            ))}
          </div>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleViewAll}
          className="text-center text-dbi-cyan hover:bg-dbi-cyan/10"
          inset
        >
          View all notifications
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}