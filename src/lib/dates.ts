/** Все даты в данных — местное время Перми (UTC+5, без перехода на летнее время). */
export const TZ = 'Asia/Yekaterinburg';
const OFFSET = '+05:00';

/** '2026-10-24T20:00' → Date */
export function parseLocal(value: string): Date {
  return new Date(`${value}:00${OFFSET}`);
}

const fmt = (opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('ru-RU', { timeZone: TZ, ...opts });

const dayFmt = fmt({ day: 'numeric' });
const monthShortFmt = fmt({ month: 'short' });
const weekdayShortFmt = fmt({ weekday: 'short' });
const longFmt = fmt({ day: 'numeric', month: 'long' });
const weekdayLongFmt = fmt({ weekday: 'short' });
const timeFmt = fmt({ hour: '2-digit', minute: '2-digit' });

const clean = (s: string) => s.replace('.', '');

export function dateParts(d: Date) {
  return {
    day: dayFmt.format(d),
    month: clean(monthShortFmt.format(d)),
    weekday: clean(weekdayShortFmt.format(d)),
    long: longFmt.format(d),
    longWithWeekday: `${longFmt.format(d)}, ${clean(weekdayLongFmt.format(d))}`,
    time: timeFmt.format(d),
  };
}

/** Начало недели (понедельник 00:00 по Перми) для группировки афиши */
export function weekKey(d: Date): string {
  const local = new Date(d.getTime() + 5 * 3600_000);
  const dow = (local.getUTCDay() + 6) % 7;
  local.setUTCDate(local.getUTCDate() - dow);
  return local.toISOString().slice(0, 10);
}

export function toIcsStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}
