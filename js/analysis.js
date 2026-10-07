import { EMOTIONS } from "./constants.js";
import {
  formatKoreanDate,
  formatKoreanMonth,
  getTodayKey,
  parseDateKey,
  shiftMonth,
  toMonthKey,
} from "./date-utils.js";
import { showToast } from "./common-ui.js";
import { getEntriesForMonth } from "./storage.js";

const today = parseDateKey(getTodayKey());
const state = {
  displayedMonth: { year: today.year, monthIndex: today.month - 1 },
  selectedEmotion: null,
};

const elements = {
  title: document.querySelector("#monthly-title"),
  previousMonth: document.querySelector("#analysis-previous"),
  nextMonth: document.querySelector("#analysis-next"),
  stats: document.querySelector("#emotion-stats"),
  recordListTitle: document.querySelector("#record-list-title"),
  recordList: document.querySelector("#record-list"),
};

function reportError(error) {
  showToast(error?.message ?? "분석 데이터를 불러오지 못했습니다.", {
    type: "error",
    duration: 5200,
  });
}

function readMonthEntries() {
  const { year, monthIndex } = state.displayedMonth;
  try {
    return getEntriesForMonth(toMonthKey(year, monthIndex));
  } catch (error) {
    reportError(error);
    return [];
  }
}

function countEmotions(entries) {
  const counts = Object.fromEntries(EMOTIONS.map(({ id }) => [id, 0]));
  entries.forEach(({ emotion }) => {
    counts[emotion] += 1;
  });
  return counts;
}

function chooseMostFrequentEmotion(counts) {
  let selectedId = null;
  let highestCount = 0;

  EMOTIONS.forEach(({ id }) => {
    if (counts[id] > highestCount) {
      highestCount = counts[id];
      selectedId = id;
    }
  });

  return selectedId;
}

function renderStats(entries) {
  const counts = countEmotions(entries);
  const fragment = document.createDocumentFragment();

  EMOTIONS.forEach((emotion) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "emotion-stat-card";
    button.dataset.emotion = emotion.id;
    button.style.setProperty("--emotion-color", emotion.color);
    const isSelected = state.selectedEmotion === emotion.id;
    button.classList.toggle("is-selected", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
    button.setAttribute("aria-label", `${emotion.label} ${counts[emotion.id]}회`);

    const emoji = document.createElement("span");
    emoji.className = "stat-emoji";
    emoji.setAttribute("aria-hidden", "true");
    emoji.textContent = emotion.emoji;

    const name = document.createElement("strong");
    name.textContent = emotion.label;

    const count = document.createElement("span");
    count.className = "stat-count";
    count.textContent = `${counts[emotion.id].toLocaleString("ko-KR")}회`;

    button.append(emoji, name, count);
    button.addEventListener("click", () => {
      state.selectedEmotion = emotion.id;
      renderStats(entries);
      renderRecords(entries);
    });
    fragment.append(button);
  });

  elements.stats.replaceChildren(fragment);
}

function createEmptyState(message, { showHomeLink = false } = {}) {
  const empty = document.createElement("div");
  empty.className = "records-empty";

  const icon = document.createElement("span");
  icon.className = "placeholder-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = "🌿";

  const text = document.createElement("p");
  text.textContent = message;
  empty.append(icon, text);

  if (showHomeLink) {
    const link = document.createElement("a");
    link.className = "text-link";
    link.href = "index.html";
    link.textContent = "홈에서 기록하기";
    empty.append(link);
  }

  return empty;
}

function renderRecords(entries) {
  if (entries.length === 0) {
    elements.recordListTitle.textContent = "이 달의 기록";
    elements.recordList.replaceChildren(
      createEmptyState("아직 기록이 없어요. 홈에서 오늘의 감정을 남겨보세요.", {
        showHomeLink: true,
      }),
    );
    return;
  }

  const emotion = EMOTIONS.find(({ id }) => id === state.selectedEmotion);
  const filteredEntries = entries.filter(({ emotion: emotionId }) => emotionId === emotion.id);
  elements.recordListTitle.textContent = `${emotion.emoji} ${emotion.label} 기록 ${filteredEntries.length.toLocaleString("ko-KR")}개`;

  if (filteredEntries.length === 0) {
    elements.recordList.replaceChildren(
      createEmptyState("이 달에는 해당 감정의 기록이 없어요."),
    );
    return;
  }

  const list = document.createElement("div");
  list.className = "record-list";

  filteredEntries.forEach((entry) => {
    const article = document.createElement("article");
    article.className = "record-card";
    article.style.setProperty("--emotion-color", emotion.color);

    const header = document.createElement("header");
    const date = document.createElement("time");
    date.dateTime = entry.date;
    date.textContent = formatKoreanDate(entry.date);

    const badge = document.createElement("span");
    badge.className = "emotion-badge";
    badge.textContent = `${emotion.emoji} ${emotion.label}`;
    header.append(date, badge);

    const content = document.createElement("p");
    content.textContent = entry.content;
    article.append(header, content);
    list.append(article);
  });

  elements.recordList.replaceChildren(list);
}

function renderMonth({ chooseInitial = false } = {}) {
  const { year, monthIndex } = state.displayedMonth;
  const entries = readMonthEntries();
  const counts = countEmotions(entries);
  elements.title.textContent = `${formatKoreanMonth(year, monthIndex)}의 감정`;

  if (chooseInitial) {
    state.selectedEmotion = chooseMostFrequentEmotion(counts);
  }

  renderStats(entries);
  renderRecords(entries);
}

function moveMonth(amount) {
  state.displayedMonth = shiftMonth(state.displayedMonth, amount);
  renderMonth({ chooseInitial: true });
}

elements.previousMonth.addEventListener("click", () => moveMonth(-1));
elements.nextMonth.addEventListener("click", () => moveMonth(1));
window.addEventListener("storage", () => renderMonth({ chooseInitial: true }));

renderMonth({ chooseInitial: true });
