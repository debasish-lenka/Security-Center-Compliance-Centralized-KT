import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date, format: 'short' | 'long' | 'relative' = 'short'): string {
  const d = new Date(date);
  if (format === 'short') {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  if (format === 'long') {
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }
  // relative
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  return formatDate(d, 'short');
}

export function formatRelativeTime(date: string | Date): string {
  const d = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return formatDate(d, 'short');
}

export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function generateAvatarColor(name: string): string {
  const colors = [
    'bg-cyan-500',
    'bg-indigo-500',
    'bg-emerald-500',
    'bg-amber-500',
    'bg-rose-500',
    'bg-violet-500',
    'bg-sky-500',
    'bg-teal-500',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    NOT_STARTED: 'bg-slate-500/20 text-slate-400',
    ONGOING: 'bg-cyan-500/20 text-cyan-400',
    ON_HOLD: 'bg-amber-500/20 text-amber-400',
    COMPLETED: 'bg-emerald-500/20 text-emerald-400',
    OVERDUE: 'bg-rose-500/20 text-rose-400',
    AT_RISK: 'bg-orange-500/20 text-orange-400',
    DRAFT: 'bg-slate-500/20 text-slate-400',
    SUBMITTED: 'bg-indigo-500/20 text-indigo-400',
    APPROVED: 'bg-emerald-500/20 text-emerald-400',
    REJECTED: 'bg-rose-500/20 text-rose-400',
    TODO: 'bg-slate-500/20 text-slate-400',
    IN_PROGRESS: 'bg-cyan-500/20 text-cyan-400',
    REVIEW: 'bg-indigo-500/20 text-indigo-400',
    DONE: 'bg-emerald-500/20 text-emerald-400',
    BLOCKED: 'bg-rose-500/20 text-rose-400',
    LOW: 'bg-slate-500/20 text-slate-400',
    MEDIUM: 'bg-amber-500/20 text-amber-400',
    HIGH: 'bg-orange-500/20 text-orange-400',
    CRITICAL: 'bg-rose-500/20 text-rose-400',
    PENDING: 'bg-slate-500/20 text-slate-400',
    success: 'bg-emerald-500/20 text-emerald-400',
    failure: 'bg-rose-500/20 text-rose-400',
  };
  return colors[status] || 'bg-slate-500/20 text-slate-400';
}

export function getPriorityColor(priority: string): string {
  const colors: Record<string, string> = {
    LOW: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
    MEDIUM: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    HIGH: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    CRITICAL: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
  };
  return colors[priority] || colors.MEDIUM;
}

export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}