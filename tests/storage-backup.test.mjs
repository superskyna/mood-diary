import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";

import { STORAGE_KEY } from "../js/constants.js";
import {
  BackupError,
  createBackupPayload,
  getBackupFileName,
  parseBackupText,
  restoreBackupPayload,
  serializeBackup,
} from "../js/backup.js";
import {
  StorageError,
  deleteEntry,
  getEntriesForMonth,
  getEntry,
  readData,
  saveEntry,
} from "../js/storage.js";

class MemoryStorage {
  #values = new Map();

  getItem(key) {
    return this.#values.has(key) ? this.#values.get(key) : null;
  }

  setItem(key, value) {
    this.#values.set(key, String(value));
  }

  clear() {
    this.#values.clear();
  }
}

globalThis.localStorage = new MemoryStorage();

beforeEach(() => {
  localStorage.clear();
});

test("빈 저장소는 기본 데이터로 읽는다", () => {
  assert.deepEqual(readData(), { version: 1, entries: {} });
});

test("기록을 저장하고 앞뒤 공백을 제거한다", () => {
  const saved = saveEntry(
    { date: "2020-01-02", emotion: "happy", content: "  좋은 하루  " },
    new Date("2026-09-30T00:00:00.000Z"),
  );

  assert.equal(saved.content, "좋은 하루");
  assert.deepEqual(getEntry("2020-01-02"), saved);
});

test("수정 시 최초 작성 시각을 유지하고 수정 시각만 바꾼다", () => {
  const first = saveEntry(
    { date: "2020-01-02", emotion: "happy", content: "처음" },
    new Date("2026-09-29T00:00:00.000Z"),
  );
  const updated = saveEntry(
    { date: "2020-01-02", emotion: "calm", content: "수정" },
    new Date("2026-09-30T00:00:00.000Z"),
  );

  assert.equal(updated.createdAt, first.createdAt);
  assert.notEqual(updated.updatedAt, first.updatedAt);
  assert.equal(updated.emotion, "calm");
});

test("월별 기록을 날짜 오름차순으로 읽고 삭제한다", () => {
  saveEntry({ date: "2020-01-20", emotion: "sad", content: "둘째" });
  saveEntry({ date: "2020-01-02", emotion: "happy", content: "첫째" });
  saveEntry({ date: "2020-02-01", emotion: "calm", content: "다음 달" });

  assert.deepEqual(
    getEntriesForMonth("2020-01").map(({ date }) => date),
    ["2020-01-02", "2020-01-20"],
  );
  assert.equal(deleteEntry("2020-01-02"), true);
  assert.equal(getEntry("2020-01-02"), null);
});

test("빈 내용, 잘못된 감정, 미래 날짜를 저장하지 않는다", () => {
  assert.throws(
    () => saveEntry({ date: "2020-01-01", emotion: "happy", content: "   " }),
    StorageError,
  );
  assert.throws(
    () => saveEntry({ date: "2020-01-01", emotion: "unknown", content: "내용" }),
    StorageError,
  );
  assert.throws(
    () => saveEntry({ date: "9999-12-31", emotion: "happy", content: "미래" }),
    StorageError,
  );
  assert.deepEqual(readData(), { version: 1, entries: {} });
});

test("내용은 1,000자까지 저장하고 1,001자는 거부한다", () => {
  assert.equal(
    saveEntry({ date: "2020-01-01", emotion: "happy", content: "가".repeat(1000) }).content.length,
    1000,
  );
  assert.throws(
    () => saveEntry({ date: "2020-01-02", emotion: "happy", content: "가".repeat(1001) }),
    StorageError,
  );
});

test("손상된 저장 데이터는 자동으로 덮어쓰지 않는다", () => {
  localStorage.setItem(STORAGE_KEY, "{not-json");
  assert.throws(() => readData(), StorageError);
  assert.equal(localStorage.getItem(STORAGE_KEY), "{not-json");
});

test("백업을 만들고 전체 기록을 복구한다", () => {
  saveEntry({ date: "2020-01-02", emotion: "excited", content: "백업할 기록" });
  const payload = createBackupPayload(readData(), new Date("2026-09-30T01:00:00.000Z"));

  deleteEntry("2020-01-02");
  restoreBackupPayload(payload);

  assert.equal(getEntry("2020-01-02")?.content, "백업할 기록");
});

test("백업 파일명과 JSON 규격이 설계와 일치한다", () => {
  saveEntry({ date: "2020-01-02", emotion: "excited", content: "백업 규격" });
  const payload = createBackupPayload(readData(), new Date("2026-09-30T01:00:00.000Z"));
  const serialized = serializeBackup(payload);

  assert.equal(getBackupFileName("2026-09-30"), "감정일기-백업-2026-09-30.json");
  assert.deepEqual(JSON.parse(serialized), payload);
  assert.deepEqual(parseBackupText(serialized), payload);
});

test("복구는 기존 전체 기록을 백업 기록으로 교체한다", () => {
  saveEntry({ date: "2020-01-01", emotion: "angry", content: "교체될 기록" });
  const replacement = {
    application: "감정일기",
    version: 1,
    exportedAt: "2026-09-30T01:00:00.000Z",
    entries: {
      "2020-02-02": {
        date: "2020-02-02",
        emotion: "calm",
        content: "복구된 기록",
        createdAt: "2026-09-29T01:00:00.000Z",
        updatedAt: "2026-09-30T01:00:00.000Z",
      },
    },
  };

  restoreBackupPayload(replacement);
  assert.equal(getEntry("2020-01-01"), null);
  assert.equal(getEntry("2020-02-02")?.content, "복구된 기록");
});

test("잘못된 백업은 거부하고 현재 데이터를 유지한다", () => {
  saveEntry({ date: "2020-01-02", emotion: "calm", content: "지켜야 할 기록" });
  const before = localStorage.getItem(STORAGE_KEY);

  assert.throws(
    () => parseBackupText('{"application":"다른 앱","version":1,"entries":{}}'),
    BackupError,
  );
  assert.equal(localStorage.getItem(STORAGE_KEY), before);
});
