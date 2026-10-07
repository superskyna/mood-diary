import { parseBackupText, prepareBackupDownload, restoreBackupPayload } from "./backup.js";
import { EMOTIONS, MAX_CONTENT_LENGTH } from "./constants.js";
import {
  buildCalendarGrid,
  formatKoreanDate,
  formatKoreanMonth,
  getTodayKey,
  isFutureDateKey,
  parseDateKey,
  shiftMonth,
} from "./date-utils.js";
import { confirmAction, showToast } from "./common-ui.js";
import { deleteEntry, getEntry, readData, saveEntry } from "./storage.js";

const todayKey = getTodayKey();
const today = parseDateKey(todayKey);
const state = {
  selectedDate: todayKey,
  selectedEmotion: null,
  displayedMonth: { year: today.year, monthIndex: today.month - 1 },
};

const elements = {
  calendarTitle: document.querySelector("#calendar-title"),
  calendarGrid: document.querySelector("#calendar-grid"),
  previousMonth: document.querySelector("#calendar-previous"),
  nextMonth: document.querySelector("#calendar-next"),
  entryTitle: document.querySelector("#entry-title"),
  entryStatus: document.querySelector("#entry-status"),
  form: document.querySelector("#entry-form"),
  emotionOptions: document.querySelector("#emotion-options"),
  emotionError: document.querySelector("#emotion-error"),
  content: document.querySelector("#entry-content"),
  contentError: document.querySelector("#content-error"),
  contentCount: document.querySelector("#content-count"),
  saveButton: document.querySelector("#save-entry"),
  deleteButton: document.querySelector("#delete-entry"),
  backupButton: document.querySelector("#backup-button"),
  restoreButton: document.querySelector("#restore-button"),
  restoreFile: document.querySelector("#restore-file"),
};

let storageErrorShown = false;

function closeDataMenu() {
  document.querySelector(".data-menu")?.removeAttribute("open");
}

function reportError(error) {
  showToast(error?.message ?? "예상하지 못한 오류가 발생했습니다.", { type: "error", duration: 5200 });
}

function readEntriesSafely() {
  try {
    storageErrorShown = false;
    return readData().entries;
  } catch (error) {
    if (!storageErrorShown) {
      storageErrorShown = true;
      reportError(error);
    }
    return {};
  }
}

function createEmotionButtons() {
  const fragment = document.createDocumentFragment();

  EMOTIONS.forEach((emotion) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "emotion-button";
    button.dataset.emotion = emotion.id;
    button.style.setProperty("--emotion-color", emotion.color);
    button.setAttribute("aria-pressed", "false");

    const emoji = document.createElement("span");
    emoji.className = "emotion-emoji";
    emoji.setAttribute("aria-hidden", "true");
    emoji.textContent = emotion.emoji;

    const label = document.createElement("span");
    label.textContent = emotion.label;

    button.append(emoji, label);
    button.addEventListener("click", () => {
      state.selectedEmotion = emotion.id;
      elements.emotionError.textContent = "";
      updateEmotionButtons();
    });
    fragment.append(button);
  });

  elements.emotionOptions.replaceChildren(fragment);
}

function updateEmotionButtons() {
  elements.emotionOptions.querySelectorAll(".emotion-button").forEach((button) => {
    const selected = button.dataset.emotion === state.selectedEmotion;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
}

function renderCalendar() {
  const { year, monthIndex } = state.displayedMonth;
  const entries = readEntriesSafely();
  elements.calendarTitle.textContent = formatKoreanMonth(year, monthIndex);

  const fragment = document.createDocumentFragment();
  buildCalendarGrid(year, monthIndex).forEach((calendarDay) => {
    const entry = entries[calendarDay.dateKey];
    const emotion = entry ? EMOTIONS.find(({ id }) => id === entry.emotion) : null;
    const isFuture = isFutureDateKey(calendarDay.dateKey, todayKey);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "calendar-day";
    button.dataset.date = calendarDay.dateKey;
    button.disabled = isFuture;
    button.classList.toggle("is-outside", !calendarDay.isCurrentMonth);
    button.classList.toggle("is-today", calendarDay.dateKey === todayKey);
    button.classList.toggle("is-selected", calendarDay.dateKey === state.selectedDate);
    button.classList.toggle("has-entry", Boolean(entry));
    button.style.setProperty("--entry-color", emotion?.color ?? "transparent");
    button.setAttribute("role", "gridcell");

    const dateLabel = formatKoreanDate(calendarDay.dateKey);
    button.setAttribute(
      "aria-label",
      `${dateLabel}${emotion ? `, ${emotion.label} 기록 있음` : ""}${isFuture ? ", 선택할 수 없는 미래 날짜" : ""}`,
    );

    const dayNumber = document.createElement("span");
    dayNumber.className = "calendar-day-number";
    dayNumber.textContent = String(calendarDay.day);
    button.append(dayNumber);

    if (emotion) {
      const marker = document.createElement("span");
      marker.className = "calendar-emotion";
      marker.setAttribute("aria-hidden", "true");
      marker.textContent = emotion.emoji;
      button.append(marker);
    }

    button.addEventListener("click", () => selectDate(calendarDay.dateKey));
    fragment.append(button);
  });

  elements.calendarGrid.replaceChildren(fragment);
}

function clearFieldErrors() {
  elements.emotionError.textContent = "";
  elements.contentError.textContent = "";
}

function updateCharacterCount() {
  elements.contentCount.value = `${elements.content.value.length.toLocaleString("ko-KR")} / ${MAX_CONTENT_LENGTH.toLocaleString("ko-KR")}`;
  elements.contentCount.textContent = elements.contentCount.value;
}

function loadSelectedEntry() {
  clearFieldErrors();
  elements.entryTitle.textContent = formatKoreanDate(state.selectedDate);

  let entry = null;
  try {
    entry = getEntry(state.selectedDate);
  } catch (error) {
    reportError(error);
  }

  state.selectedEmotion = entry?.emotion ?? null;
  elements.content.value = entry?.content ?? "";
  elements.entryStatus.textContent = entry ? "저장된 기록" : "새 기록";
  elements.saveButton.textContent = entry ? "수정하기" : "저장하기";
  elements.deleteButton.hidden = !entry;
  updateEmotionButtons();
  updateCharacterCount();
}

function selectDate(dateKey) {
  state.selectedDate = dateKey;
  const parsed = parseDateKey(dateKey);
  state.displayedMonth = { year: parsed.year, monthIndex: parsed.month - 1 };
  renderCalendar();
  loadSelectedEntry();
}

function validateForm() {
  clearFieldErrors();
  const content = elements.content.value.trim();

  if (!state.selectedEmotion) {
    elements.emotionError.textContent = "오늘의 감정을 하나 선택해 주세요.";
  }

  if (!content) {
    elements.contentError.textContent = "오늘 있었던 일을 작성해 주세요.";
  }

  if (!state.selectedEmotion) {
    elements.emotionOptions.querySelector("button")?.focus();
    return null;
  }

  if (!content) {
    elements.content.focus();
    return null;
  }

  return content;
}

elements.form.addEventListener("submit", (event) => {
  event.preventDefault();
  const content = validateForm();
  if (!content) {
    return;
  }

  const wasExisting = !elements.deleteButton.hidden;
  try {
    saveEntry({ date: state.selectedDate, emotion: state.selectedEmotion, content });
    renderCalendar();
    loadSelectedEntry();
    showToast(wasExisting ? "기록을 수정했어요." : "오늘의 기록을 저장했어요.");
  } catch (error) {
    reportError(error);
  }
});

elements.deleteButton.addEventListener("click", async () => {
  const approved = await confirmAction({
    title: "이 기록을 삭제할까요?",
    message: "삭제한 기록은 되돌릴 수 없습니다. 백업이 필요하다면 먼저 내려받아 주세요.",
    confirmLabel: "삭제하기",
    danger: true,
  });

  if (!approved) {
    return;
  }

  try {
    deleteEntry(state.selectedDate);
    renderCalendar();
    loadSelectedEntry();
    showToast("기록을 삭제했어요.");
  } catch (error) {
    reportError(error);
  }
});

elements.content.addEventListener("input", () => {
  if (elements.content.value.length > MAX_CONTENT_LENGTH) {
    elements.content.value = elements.content.value.slice(0, MAX_CONTENT_LENGTH);
  }
  elements.contentError.textContent = "";
  updateCharacterCount();
});

elements.previousMonth.addEventListener("click", () => {
  state.displayedMonth = shiftMonth(state.displayedMonth, -1);
  renderCalendar();
});

elements.nextMonth.addEventListener("click", () => {
  state.displayedMonth = shiftMonth(state.displayedMonth, 1);
  renderCalendar();
});

elements.backupButton.addEventListener("click", (event) => {
  try {
    const fileName = prepareBackupDownload(elements.backupButton);
    closeDataMenu();
    showToast(`${fileName} 파일을 내려받았어요.`);
  } catch (error) {
    event.preventDefault();
    reportError(error);
  }
});

elements.restoreButton.addEventListener("click", () => {
  closeDataMenu();
  elements.restoreFile.click();
});

elements.restoreFile.addEventListener("change", async () => {
  const [file] = elements.restoreFile.files;
  elements.restoreFile.value = "";

  if (!file) {
    return;
  }

  try {
    const payload = parseBackupText(await file.text());
    const entryCount = Object.keys(payload.entries).length;
    const approved = await confirmAction({
      title: "백업 기록으로 교체할까요?",
      message: `현재 기록 전체가 백업 파일의 ${entryCount.toLocaleString("ko-KR")}개 기록으로 교체됩니다. 이 작업은 되돌릴 수 없습니다.`,
      confirmLabel: "복구하기",
      danger: true,
    });

    if (!approved) {
      showToast("복구를 취소했어요.", { type: "info" });
      return;
    }

    restoreBackupPayload(payload);
    renderCalendar();
    loadSelectedEntry();
    showToast("백업 기록을 복구했어요.");
  } catch (error) {
    reportError(error);
  }
});

window.addEventListener("storage", () => {
  renderCalendar();
  loadSelectedEntry();
});

createEmotionButtons();
renderCalendar();
loadSelectedEntry();
