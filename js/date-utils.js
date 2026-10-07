function padNumber(value) {
  return String(value).padStart(2, "0");
}

export function toLocalDateKey(date = new Date()) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new TypeError("올바른 날짜가 필요합니다.");
  }

  return `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`;
}

export function parseDateKey(dateKey) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day, 12);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return { year, month, day, date };
}

export function isValidDateKey(dateKey) {
  return parseDateKey(dateKey) !== null;
}

export function getTodayKey() {
  return toLocalDateKey(new Date());
}

export function isFutureDateKey(dateKey, todayKey = getTodayKey()) {
  if (!isValidDateKey(dateKey) || !isValidDateKey(todayKey)) {
    throw new TypeError("비교할 날짜 형식이 올바르지 않습니다.");
  }

  return dateKey > todayKey;
}

export function toMonthKey(year, monthIndex) {
  if (!Number.isInteger(year) || !Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    throw new TypeError("올바른 연도와 월이 필요합니다.");
  }

  return `${String(year).padStart(4, "0")}-${padNumber(monthIndex + 1)}`;
}

export function parseMonthKey(monthKey) {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);

  if (month < 1 || month > 12) {
    return null;
  }

  return { year, monthIndex: month - 1 };
}

export function shiftMonth({ year, monthIndex }, amount) {
  if (!Number.isInteger(amount)) {
    throw new TypeError("이동할 월 수는 정수여야 합니다.");
  }

  const shifted = new Date(year, monthIndex + amount, 1, 12);
  return { year: shifted.getFullYear(), monthIndex: shifted.getMonth() };
}

export function formatKoreanDate(dateKey, { includeWeekday = true } = {}) {
  const parsed = parseDateKey(dateKey);

  if (!parsed) {
    throw new TypeError("날짜 형식이 올바르지 않습니다.");
  }

  const base = `${parsed.year}년 ${parsed.month}월 ${parsed.day}일`;
  if (!includeWeekday) {
    return base;
  }

  const weekday = new Intl.DateTimeFormat("ko-KR", { weekday: "long" }).format(parsed.date);
  return `${base} ${weekday}`;
}

export function formatKoreanMonth(year, monthIndex) {
  return `${year}년 ${monthIndex + 1}월`;
}

export function buildCalendarGrid(year, monthIndex) {
  const firstWeekday = new Date(year, monthIndex, 1, 12).getDay();

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(year, monthIndex, index - firstWeekday + 1, 12);
    return {
      dateKey: toLocalDateKey(date),
      day: date.getDate(),
      isCurrentMonth: date.getFullYear() === year && date.getMonth() === monthIndex,
    };
  });
}
