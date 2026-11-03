import { useState, useEffect, useCallback, useRef } from 'react';
import { notificationsApi } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';

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

interface UseNotificationsOptions {
  enabled?: boolean;
  pollInterval?: number; // in milliseconds
  onNewNotification?: (notification: Notification) => void;
}

export function useNotifications(options: UseNotificationsOptions = {}) {
  const { enabled = true, pollInterval = 30000, onNewNotification } = options;

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const eventSourceRef = useRef<EventSource | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  // latest list for the poll callback; reading state there would make startPolling change on every fetch and restart the effect in a loop
  const notificationsRef = useRef<Notification[]>([]);
  notificationsRef.current = notifications;

  // Fetch notifications from API
  const fetchNotifications = useCallback(async (params?: Record<string, string>) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await notificationsApi.list(params);
      const data = response.data?.items || [];
      setNotifications(data);
      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch notifications';
      setError(errorMessage);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch unread count
  const fetchUnreadCount = useCallback(async () => {
    try {
      const response = await notificationsApi.getUnreadCount();
      const count = response.data?.count || 0;
      setUnreadCount(count);
      return count;
    } catch (err) {
      console.error('Failed to fetch unread count:', err);
      return 0;
    }
  }, []);

  // Mark notification as read
  const markAsRead = useCallback(async (id: string) => {
    try {
      await notificationsApi.markAsRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
      fetchUnreadCount();
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to mark as read', variant: 'destructive' });
    }
  }, [fetchUnreadCount, toast]);

  // Mark all notifications as read
  const markAllAsRead = useCallback(async () => {
    try {
      await notificationsApi.markAllAsRead();
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
      toast({ title: 'Success', description: 'All notifications marked as read' });
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to mark all as read', variant: 'destructive' });
    }
  }, [toast]);

  // Delete notification
  const deleteNotification = useCallback(async (id: string) => {
    try {
      await notificationsApi.delete(id);
      setNotifications(prev => prev.filter(n => n.id !== id));
      fetchUnreadCount();
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to delete notification', variant: 'destructive' });
    }
  }, [fetchUnreadCount, toast]);

  // Handle new notification from real-time connection
  const handleNewNotification = useCallback((notification: Notification) => {
    // Check if we already have this notification
    setNotifications(prev => {
      if (prev.some(n => n.id === notification.id)) {
        return prev;
      }
      // Add new notification at the beginning
      const updated = [notification, ...prev];
      setUnreadCount(prevCount => prevCount + 1);
      return updated;
    });

    // Show toast for new notification
    const typeColors: Record<string, 'default' | 'destructive' | 'success'> = {
      CRITICAL: 'destructive',
      ERROR: 'destructive',
      WARNING: 'default',
      SUCCESS: 'success',
      INFO: 'default',
      SECURITY_ALERT: 'destructive',
      PROJECT_UPDATE: 'default',
      KT_REPORT: 'default',
      COMPLIANCE: 'default',
      SYSTEM: 'default',
    };

    toast({
      title: notification.title,
      description: notification.message,
      variant: typeColors[notification.type] || 'default',
      action: notification.link ? (
        <ToastAction altText="View notification" onClick={() => window.location.href = notification.link || '#'}>
          View
        </ToastAction>
      ) : undefined
    });

    // Call optional callback
    if (onNewNotification) {
      onNewNotification(notification);
    }
  }, [onNewNotification, toast]);

  // Initialize SSE connection
  const connectSSE = useCallback(() => {
    if (!enabled || typeof window === 'undefined') return;

    try {
      // In mock mode, we'll simulate SSE with polling
      // In production, this would connect to a real SSE endpoint
      const apiUrl = import.meta.env.VITE_API_URL || '/api';
      const sseUrl = `${apiUrl}/v1/notifications/stream`;

      // For mock mode, we'll use polling instead
      if (import.meta.env.VITE_MOCK_MODE !== 'false') {
        startPolling();
        return;
      }

      const eventSource = new EventSource(sseUrl, { withCredentials: true });
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        setIsConnected(true);
        console.log('SSE connection established');
      };

      eventSource.onmessage = (event) => {
        try {
          const notification = JSON.parse(event.data);
          handleNewNotification(notification);
        } catch (err) {
          console.error('Failed to parse SSE message:', err);
        }
      };

      eventSource.onerror = (err) => {
        console.error('SSE error:', err);
        setIsConnected(false);
        eventSource.close();
        // Fallback to polling
        startPolling();
      };
    } catch (err) {
      console.error('Failed to establish SSE connection:', err);
      startPolling();
    }
  }, [enabled, handleNewNotification]);

  // Initialize WebSocket connection (alternative to SSE)
  const connectWebSocket = useCallback(() => {
    if (!enabled || typeof window === 'undefined') return;

    try {
      const wsUrl = (import.meta.env.VITE_WS_URL || 'ws://localhost:3001').replace('http', 'ws');
      const ws = new WebSocket(`${wsUrl}/v1/notifications/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        console.log('WebSocket connection established');
      };

      ws.onmessage = (event) => {
        try {
          const notification = JSON.parse(event.data);
          handleNewNotification(notification);
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
        }
      };

      ws.onerror = (err) => {
        console.error('WebSocket error:', err);
        setIsConnected(false);
      };

      ws.onclose = () => {
        setIsConnected(false);
        // Reconnect after 5 seconds
        setTimeout(() => connectWebSocket(), 5000);
      };
    } catch (err) {
      console.error('Failed to establish WebSocket connection:', err);
      startPolling();
    }
  }, [enabled, handleNewNotification]);

  // Start polling as fallback
  const startPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }

    // Initial fetch
    fetchNotifications();
    fetchUnreadCount();

    // Set up polling interval
    pollIntervalRef.current = setInterval(async () => {
      const before = notificationsRef.current;
      const fresh = await fetchNotifications();
      // announce notifications that were not in the list before
      if (before.length > 0) {
        fresh.filter((n: Notification) => !before.some((b) => b.id === n.id)).forEach((n: Notification) => handleNewNotification(n));
      }
      fetchUnreadCount();
    }, pollInterval);

    setIsConnected(true); // Polling is "connected" in a sense
  }, [fetchNotifications, fetchUnreadCount, handleNewNotification, pollInterval]);

  // Stop polling
  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    if (!enabled) return;

    // Try WebSocket first, fallback to SSE, then polling
    const useWebSocket = import.meta.env.VITE_USE_WEBSOCKET === 'true';

    if (useWebSocket) {
      connectWebSocket();
    } else if (import.meta.env.VITE_USE_SSE === 'true') {
      connectSSE();
    } else {
      // The API has no /notifications/stream endpoint; poll instead of failing an EventSource on every load
      startPolling();
    }

    return () => {
      stopPolling();
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [enabled, connectSSE, connectWebSocket, startPolling, stopPolling]);

  // Initial load
  useEffect(() => {
    if (enabled) {
      fetchNotifications();
      fetchUnreadCount();
    }
  }, [enabled, fetchNotifications, fetchUnreadCount]);

  return {
    notifications,
    unreadCount,
    isLoading,
    error,
    isConnected,
    fetchNotifications,
    fetchUnreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    refetch: fetchNotifications,
  };
}

// Hook for just the unread count (lightweight)
export function useUnreadCount(pollInterval = 30000) {
  const [count, setCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const fetchCount = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await notificationsApi.getUnreadCount();
      setCount(response.data?.count || 0);
    } catch (err) {
      console.error('Failed to fetch unread count:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCount();
    const interval = setInterval(fetchCount, pollInterval);
    return () => clearInterval(interval);
  }, [fetchCount, pollInterval]);

  return { count, isLoading, refetch: fetchCount };
}