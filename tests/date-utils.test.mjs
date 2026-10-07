import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCalendarGrid,
  formatKoreanDate,
  isFutureDateKey,
  parseDateKey,
  shiftMonth,
  toLocalDateKey,
  toMonthKey,
} from "../js/date-utils.js";

test("현지 날짜 키를 YYYY-MM-DD 형식으로 만든다", () => {
  assert.equal(toLocalDateKey(new Date(2026, 8, 3, 23, 30)), "2026-09-03");
});

test("윤년과 잘못된 날짜를 구분한다", () => {
  assert.ok(parseDateKey("2024-02-29"));
  assert.equal(parseDateKey("2025-02-29"), null);
  assert.equal(parseDateKey("2026-13-01"), null);
});

test("연도 경계를 넘어 월을 이동한다", () => {
  assert.deepEqual(shiftMonth({ year: 2026, monthIndex: 0 }, -1), {
    year: 2025,
    monthIndex: 11,
  });
  assert.deepEqual(shiftMonth({ year: 2026, monthIndex: 11 }, 1), {
    year: 2027,
    monthIndex: 0,
  });
});

test("달력은 앞뒤 날짜를 포함한 42칸을 만든다", () => {
  const grid = buildCalendarGrid(2026, 8);
  assert.equal(grid.length, 42);
  assert.equal(grid[0].dateKey, "2026-08-30");
  assert.equal(grid[41].dateKey, "2026-10-10");
  assert.equal(grid.filter(({ isCurrentMonth }) => isCurrentMonth).length, 30);
});

test("미래 날짜를 문자열 날짜 기준으로 판별한다", () => {
  assert.equal(isFutureDateKey("2026-10-01", "2026-09-30"), true);
  assert.equal(isFutureDateKey("2026-09-30", "2026-09-30"), false);
});

test("한국어 날짜와 월 제목을 만든다", () => {
  assert.match(formatKoreanDate("2026-09-30"), /^2026년 9월 30일 /);
  assert.equal(toMonthKey(2026, 8), "2026-09");
});
