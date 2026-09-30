/**
 * Date Utilities
 * ReviewAI SaaS Platform
 * Common date formatting and manipulation functions
 */

export function formatISO(date: Date = new Date()): string {
  return date.toISOString();
}

export function parseISO(dateString: string): Date {
  return new Date(dateString);
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

export function startOfDay(date: Date = new Date()): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

export function endOfDay(date: Date = new Date()): Date {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
}

export function startOfMonth(date: Date = new Date()): Date {
  const result = new Date(date);
  result.setDate(1);
  result.setHours(0, 0, 0, 0);
  return result;
}

export function endOfMonth(date: Date = new Date()): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + 1);
  result.setDate(0);
  result.setHours(23, 59, 59, 999);
  return result;
}

export function isPast(date: Date): boolean {
  return date < new Date();
}

export function isFuture(date: Date): boolean {
  return date > new Date();
}

export function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}

export function getPeriodRange(period: 'day' | 'week' | 'month' | 'quarter' | 'year', date: Date = new Date()) {
  let start: Date;
  let end: Date;

  switch (period) {
    case 'day':
      start = startOfDay(date);
      end = endOfDay(date);
      break;
    case 'week':
      start = new Date(date);
      start.setDate(date.getDate() - date.getDay());
      start = startOfDay(start);
      end = new Date(start);
      end.setDate(start.getDate() + 6);
      end = endOfDay(end);
      break;
    case 'month':
      start = startOfMonth(date);
      end = endOfMonth(date);
      break;
    case 'quarter':
      start = new Date(date);
      start.setMonth(Math.floor(date.getMonth() / 3) * 3);
      start = startOfMonth(start);
      end = new Date(start);
      end.setMonth(start.getMonth() + 3);
      end = endOfMonth(end);
      break;
    case 'year':
      start = new Date(date.getFullYear(), 0, 1);
      end = new Date(date.getFullYear(), 11, 31, 23, 59, 59, 999);
      break;
  }

  return { start, end };
}

export function getDaysInRange(startDate: string, endDate: string): string[] {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const days: string[] = [];

  const current = new Date(start);
  while (current <= end) {
    days.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }

  return days;
}

export function getWeeksInRange(startDate: string, endDate: string): string[] {
  const start = startOfWeek(new Date(startDate));
  const end = endOfWeek(new Date(endDate));
  const weeks: string[] = [];

  const current = new Date(start);
  while (current <= end) {
    weeks.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 7);
  }

  return weeks;
}

export function getMonthsInRange(startDate: string, endDate: string): string[] {
  const start = startOfMonth(new Date(startDate));
  const end = endOfMonth(new Date(endDate));
  const months: string[] = [];

  const current = new Date(start);
  while (current <= end) {
    months.push(current.toISOString().split('T')[0]);
    current.setMonth(current.getMonth() + 1);
  }

  return months;
}

function startOfWeek(date: Date): Date {
  const result = new Date(date);
  const day = result.getDay();
  const diff = result.getDate() - day;
  result.setDate(diff);
  result.setHours(0, 0, 0, 0);
  return result;
}

function endOfWeek(date: Date): Date {
  const start = startOfWeek(date);
  const result = new Date(start);
  result.setDate(start.getDate() + 6);
  result.setHours(23, 59, 59, 999);
  return result;
}