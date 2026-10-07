export const STORAGE_KEY = "mood-diary.entries.v1";
export const DATA_VERSION = 1;
export const BACKUP_APPLICATION = "감정일기";
export const MAX_CONTENT_LENGTH = 1000;

export const EMOTIONS = Object.freeze([
  Object.freeze({ id: "happy", label: "행복", emoji: "😊", color: "#111111" }),
  Object.freeze({ id: "calm", label: "평온", emoji: "😌", color: "#2D2D2D" }),
  Object.freeze({ id: "excited", label: "설렘", emoji: "🥰", color: "#494949" }),
  Object.freeze({ id: "sad", label: "슬픔", emoji: "😢", color: "#656565" }),
  Object.freeze({ id: "anxious", label: "불안", emoji: "😟", color: "#808080" }),
  Object.freeze({ id: "angry", label: "화남", emoji: "😠", color: "#000000" }),
]);

export function getEmotion(emotionId) {
  return EMOTIONS.find(({ id }) => id === emotionId) ?? null;
}

export function isEmotionId(value) {
  return getEmotion(value) !== null;
}
