import { format, isSameDay } from 'date-fns';
import type { StudySession } from '../types';

export function formatDuration(milliseconds: number): string {
  const minutes = Math.floor(milliseconds / 60000);
  if (minutes < 1) return '< 1 分钟';
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} 小时 ${rest} 分` : `${hours} 小时`;
}

export function sessionDuration(session: StudySession): number {
  const start = new Date(session.startedAt).getTime();
  const end = new Date(session.endedAt ?? session.startedAt).getTime();
  return Math.max(0, end - start);
}

export function isToday(iso?: string): boolean {
  return iso ? isSameDay(new Date(iso), new Date()) : false;
}

export function dayKey(date: Date | string): string {
  return format(new Date(date), 'yyyy-MM-dd');
}
