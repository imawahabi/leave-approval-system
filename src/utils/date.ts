import type { LeaveStatus } from '@/types';

export function formatRankName(rank: string | null | undefined, name: string | null | undefined): string {
  if (!name) return '-';
  if (!rank) return name;
  return `${rank} / ${name}`;
}

export function formatRankNameParts(rank: string | null | undefined, name: string | null | undefined): { rank: string; name: string } {
  return { rank: rank ?? '-', name: name ?? '-' };
}

export function toEnglishDigits(value: string | number): string {
  // Convert Arabic-Indic digits (٠١٢٣٤٥٦٧٨٩) to Western Arabic (0-9)
  return String(value).replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

export function formatDate(date: string | Date): string {
  if (!date) return '-';
  const d = typeof date === 'string' ? new Date(date + (date.length === 10 ? 'T00:00:00' : '')) : date;
  if (isNaN(d.getTime())) return '-';
  const months = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
  ];
  // Always produce Western Arabic (English) numerals
  const day = d.getDate();
  const year = d.getFullYear();
  return `${day} ${months[d.getMonth()]} ${year}`;
}

export function formatDateShort(date: string | Date): string {
  if (!date) return '-';
  const d = typeof date === 'string' ? new Date(date + (date.length === 10 ? 'T00:00:00' : '')) : date;
  if (isNaN(d.getTime())) return '-';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${d.getFullYear()}`;
}

export function toISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Calendar date in the ministry's operating timezone, independent of the device timezone. */
export function todayInKuwait(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kuwait', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function addDays(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

export function parseISODate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function daysBetween(start: string, end: string): number {
  const startDate = parseISODate(start);
  const endDate = parseISODate(end);
  const diff = endDate.getTime() - startDate.getTime();
  return Math.round(diff / (1000 * 60 * 60 * 24)) + 1;
}

export function daysUntil(dateStr: string): number {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [todayYear, todayMonth, todayDay] = todayInKuwait().split('-').map(Number);
  const target = Date.UTC(year, month - 1, day);
  const today = Date.UTC(todayYear, todayMonth - 1, todayDay);
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
}

export function isToday(dateStr: string): boolean {
  return daysUntil(dateStr) === 0;
}

export function getLeaveStatus(start: string, end: string, status: LeaveStatus): LeaveStatus {
  if (status === 'cancelled') return 'cancelled';
  const daysToStart = daysUntil(start);
  const daysToEnd = daysUntil(end);
  if (daysToStart > 0) return 'upcoming';
  if (daysToStart <= 0 && daysToEnd >= 0) {
    if (daysToEnd <= 3) return 'returning_soon';
    return 'active';
  }
  return 'completed';
}

export function getDaysRemaining(endDate: string): number {
  return daysUntil(endDate);
}

export function isCurrentlyOnLeave(start: string, end: string, status: LeaveStatus): boolean {
  if (status === 'cancelled') return false;
  const daysToStart = daysUntil(start);
  const daysToEnd = daysUntil(end);
  return daysToStart <= 0 && daysToEnd >= 0;
}

export function hasUpcomingLeave(start: string, status: LeaveStatus): boolean {
  if (status === 'cancelled') return false;
  return daysUntil(start) > 0;
}

export function getRelativeDaysLabel(dateStr: string): string {
  const days = daysUntil(dateStr);
  if (days === 0) return 'اليوم';
  if (days === 1) return 'غدًا';
  if (days === -1) return 'أمس';
  if (days === 2) return 'بعد يومين';
  if (days === -2) return 'منذ يومين';
  if (days > 0) return `بعد ${formatDayCount(days)}`;
  return `منذ ${formatDayCount(Math.abs(days))}`;
}

const arabicDayRules = new Intl.PluralRules('ar');

export function formatDayCount(days: number): string {
  if (days === 1) return 'يوم واحد';
  if (days === 2) return 'يومين';
  const form = arabicDayRules.select(days);
  return `${days} ${form === 'few' ? 'أيام' : form === 'many' ? 'يومًا' : 'يوم'}`;
}

export function getRemainingLabel(endDate: string): string {
  const days = daysUntil(endDate);
  if (days < 0) return 'انتهت الإجازة';
  if (days === 0) return 'تنتهي الإجازة اليوم';
  if (days === 1) return 'تنتهي الإجازة غدًا';
  if (days === 2) return 'تنتهي الإجازة بعد يومين';
  return `تنتهي الإجازة بعد ${formatDayCount(days)}`;
}
