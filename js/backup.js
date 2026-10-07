import { BACKUP_APPLICATION, DATA_VERSION } from "./constants.js";
import { getTodayKey } from "./date-utils.js";
import { StorageError, assertValidData, readData, replaceAllData } from "./storage.js";

export class BackupError extends Error {
  constructor(message, code = "BACKUP_ERROR", options) {
    super(message, options);
    this.name = "BackupError";
    this.code = code;
  }
}

export function createBackupPayload(data = readData(), exportedAt = new Date()) {
  assertValidData(data);

  if (!(exportedAt instanceof Date) || Number.isNaN(exportedAt.getTime())) {
    throw new BackupError("백업 시각이 올바르지 않습니다.", "INVALID_TIMESTAMP");
  }

  return {
    application: BACKUP_APPLICATION,
    version: DATA_VERSION,
    exportedAt: exportedAt.toISOString(),
    entries: Object.fromEntries(
      Object.entries(data.entries).map(([dateKey, entry]) => [dateKey, { ...entry }]),
    ),
  };
}

export function serializeBackup(payload = createBackupPayload()) {
  return JSON.stringify(payload, null, 2);
}

export function getBackupFileName(dateKey = getTodayKey()) {
  return `감정일기-백업-${dateKey}.json`;
}

export function parseBackupText(text) {
  let payload;

  try {
    payload = JSON.parse(text);
  } catch (error) {
    throw new BackupError("JSON 형식이 올바르지 않은 파일입니다.", "INVALID_JSON", {
      cause: error,
    });
  }

  if (
    payload === null ||
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    payload.application !== BACKUP_APPLICATION
  ) {
    throw new BackupError("감정일기에서 만든 백업 파일이 아닙니다.", "INVALID_APPLICATION");
  }

  if (payload.version !== DATA_VERSION) {
    throw new BackupError("지원하지 않는 버전의 백업 파일입니다.", "UNSUPPORTED_VERSION");
  }

  const exportedTimestamp = Date.parse(payload.exportedAt);
  if (
    typeof payload.exportedAt !== "string" ||
    Number.isNaN(exportedTimestamp) ||
    new Date(exportedTimestamp).toISOString() !== payload.exportedAt
  ) {
    throw new BackupError("백업 생성 시각이 올바르지 않습니다.", "INVALID_BACKUP");
  }

  const data = { version: DATA_VERSION, entries: payload.entries };
  try {
    assertValidData(data);
  } catch (error) {
    if (error instanceof StorageError) {
      throw new BackupError(
        "백업 파일에 올바르지 않은 기록이 있습니다. 현재 기록은 변경되지 않았습니다.",
        "INVALID_BACKUP",
        { cause: error },
      );
    }
    throw error;
  }

  return createBackupPayload(data, new Date(payload.exportedAt));
}

export function prepareBackupDownload(link) {
  const payload = createBackupPayload();
  link.href = `data:application/json;charset=utf-8,${encodeURIComponent(serializeBackup(payload))}`;
  link.download = getBackupFileName();
  window.setTimeout(() => {
    link.href = "#";
  }, 1000);
  return link.download;
}

export function restoreBackupPayload(payload) {
  const verifiedPayload = parseBackupText(JSON.stringify(payload));
  replaceAllData({ version: DATA_VERSION, entries: verifiedPayload.entries });
}
