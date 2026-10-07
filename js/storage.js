import {
  DATA_VERSION,
  MAX_CONTENT_LENGTH,
  STORAGE_KEY,
  isEmotionId,
} from "./constants.js";
import { isFutureDateKey, isValidDateKey, parseMonthKey } from "./date-utils.js";

export class StorageError extends Error {
  constructor(message, code = "STORAGE_ERROR", options) {
    super(message, options);
    this.name = "StorageError";
    this.code = code;
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isValidIsoTimestamp(value) {
  if (typeof value !== "string") {
    return false;
  }

  const timestamp = Date.parse(value);
  return !Number.isNaN(timestamp) && new Date(timestamp).toISOString() === value;
}

function cloneEntry(entry) {
  return { ...entry };
}

function cloneData(data) {
  return {
    version: DATA_VERSION,
    entries: Object.fromEntries(
      Object.entries(data.entries).map(([dateKey, entry]) => [dateKey, cloneEntry(entry)]),
    ),
  };
}

export function createEmptyData() {
  return { version: DATA_VERSION, entries: {} };
}

export function validateEntry(entry, expectedDate) {
  if (!isPlainObject(entry)) {
    return false;
  }

  const keys = Object.keys(entry).sort();
  const expectedKeys = ["content", "createdAt", "date", "emotion", "updatedAt"];

  return (
    keys.length === expectedKeys.length &&
    keys.every((key, index) => key === expectedKeys[index]) &&
    entry.date === expectedDate &&
    isValidDateKey(entry.date) &&
    isEmotionId(entry.emotion) &&
    typeof entry.content === "string" &&
    entry.content === entry.content.trim() &&
    entry.content.length >= 1 &&
    entry.content.length <= MAX_CONTENT_LENGTH &&
    isValidIsoTimestamp(entry.createdAt) &&
    isValidIsoTimestamp(entry.updatedAt)
  );
}

export function assertValidData(data) {
  if (!isPlainObject(data) || data.version !== DATA_VERSION || !isPlainObject(data.entries)) {
    throw new StorageError("저장된 일기 데이터의 형식이 올바르지 않습니다.", "INVALID_DATA");
  }

  for (const [dateKey, entry] of Object.entries(data.entries)) {
    if (!validateEntry(entry, dateKey)) {
      throw new StorageError(
        `${dateKey} 기록의 형식이 올바르지 않습니다. 백업 파일로 복구해 주세요.`,
        "INVALID_DATA",
      );
    }
  }

  return true;
}

function getLocalStorage() {
  if (!globalThis.localStorage) {
    throw new StorageError("이 브라우저에서는 일기를 저장할 수 없습니다.", "UNAVAILABLE");
  }

  return globalThis.localStorage;
}

export function readData() {
  let serialized;

  try {
    serialized = getLocalStorage().getItem(STORAGE_KEY);
  } catch (error) {
    throw new StorageError("저장된 일기를 읽지 못했습니다.", "READ_FAILED", { cause: error });
  }

  if (serialized === null) {
    return createEmptyData();
  }

  let data;
  try {
    data = JSON.parse(serialized);
  } catch (error) {
    throw new StorageError(
      "저장된 일기 데이터가 손상되었습니다. 기존 데이터는 그대로 보존됩니다.",
      "INVALID_DATA",
      { cause: error },
    );
  }

  assertValidData(data);
  return cloneData(data);
}

function writeData(data) {
  assertValidData(data);

  let serialized;
  try {
    serialized = JSON.stringify(data);
  } catch (error) {
    throw new StorageError("일기 데이터를 변환하지 못했습니다.", "WRITE_FAILED", { cause: error });
  }

  try {
    getLocalStorage().setItem(STORAGE_KEY, serialized);
  } catch (error) {
    throw new StorageError(
      "저장 공간이 부족하거나 사용할 수 없습니다. 백업 후 공간을 확인해 주세요.",
      "WRITE_FAILED",
      { cause: error },
    );
  }
}

export function getEntry(dateKey) {
  if (!isValidDateKey(dateKey)) {
    throw new StorageError("날짜 형식이 올바르지 않습니다.", "INVALID_DATE");
  }

  const entry = readData().entries[dateKey];
  return entry ? cloneEntry(entry) : null;
}

export function getEntriesForMonth(monthKey) {
  if (!parseMonthKey(monthKey)) {
    throw new StorageError("연월 형식이 올바르지 않습니다.", "INVALID_MONTH");
  }

  return Object.values(readData().entries)
    .filter(({ date }) => date.startsWith(`${monthKey}-`))
    .sort((first, second) => first.date.localeCompare(second.date))
    .map(cloneEntry);
}

export function saveEntry({ date, emotion, content }, now = new Date()) {
  if (!isValidDateKey(date)) {
    throw new StorageError("날짜 형식이 올바르지 않습니다.", "INVALID_DATE");
  }

  if (isFutureDateKey(date)) {
    throw new StorageError("미래 날짜에는 일기를 저장할 수 없습니다.", "FUTURE_DATE");
  }

  if (!isEmotionId(emotion)) {
    throw new StorageError("오늘의 감정을 하나 선택해 주세요.", "INVALID_EMOTION");
  }

  const normalizedContent = typeof content === "string" ? content.trim() : "";
  if (normalizedContent.length === 0) {
    throw new StorageError("오늘 있었던 일을 작성해 주세요.", "EMPTY_CONTENT");
  }

  if (normalizedContent.length > MAX_CONTENT_LENGTH) {
    throw new StorageError(
      `오늘 있었던 일은 ${MAX_CONTENT_LENGTH.toLocaleString("ko-KR")}자까지 작성할 수 있습니다.`,
      "CONTENT_TOO_LONG",
    );
  }

  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new StorageError("저장 시각이 올바르지 않습니다.", "INVALID_TIMESTAMP");
  }

  const data = readData();
  const existingEntry = data.entries[date];
  const timestamp = now.toISOString();
  const entry = {
    date,
    emotion,
    content: normalizedContent,
    createdAt: existingEntry?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };

  data.entries[date] = entry;
  writeData(data);
  return cloneEntry(entry);
}

export function deleteEntry(dateKey) {
  if (!isValidDateKey(dateKey)) {
    throw new StorageError("날짜 형식이 올바르지 않습니다.", "INVALID_DATE");
  }

  const data = readData();
  if (!data.entries[dateKey]) {
    return false;
  }

  delete data.entries[dateKey];
  writeData(data);
  return true;
}

export function replaceAllData(data) {
  assertValidData(data);
  writeData(cloneData(data));
}
