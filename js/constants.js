export const STORAGE_KEY = "mood-diary.entries.v1";
export const DATA_VERSION = 1;
export const BACKUP_APPLICATION = "감정일기";
export const MAX_CONTENT_LENGTH = 1000;

export const EMOTIONS = Object.freeze([
  Object.freeze({ id: "happy", label: "행복", emoji: "😊", color: "#F6C85F" }),
  Object.freeze({ id: "calm", label: "평온", emoji: "😌", color: "#7BC8A4" }),
  Object.freeze({ id: "excited", label: "설렘", emoji: "🥰", color: "#F59AB3" }),
  Object.freeze({ id: "sad", label: "슬픔", emoji: "😢", color: "#7DA7D9" }),
  Object.freeze({ id: "anxious", label: "불안", emoji: "😟", color: "#A78BFA" }),
  Object.freeze({ id: "angry", label: "화남", emoji: "😠", color: "#F28482" }),
]);

export function getEmotion(emotionId) {
  return EMOTIONS.find(({ id }) => id === emotionId) ?? null;
}

export function isEmotionId(value) {
  return getEmotion(value) !== null;
}
