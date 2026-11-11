/* ==========================================================================
   js/core/state.js — Kho trạng thái dùng chung (store + pub/sub tối giản)
   Dev by Thkc
   ========================================================================== */

/* --------------------------------------------------------------------------
   Hằng số
   -------------------------------------------------------------------------- */

/** Nguồn đề hợp lệ (chỉ có "Đề trường" và "Đề ngoài"). */
export const SOURCES = Object.freeze({
  TRUONG: 'truong',
  NGOAI: 'ngoai',
});

export const SOURCE_LABELS = Object.freeze({
  truong: 'Đề trường',
  ngoai: 'Đề ngoài',
});

/** Các phần ôn (dạng câu hỏi) theo format đề mới. */
export const QUIZ_PARTS = Object.freeze([
  { id: 1, type: 'mcq', label: 'Phần 1: Trắc nghiệm nhiều lựa chọn' },
  { id: 2, type: 'truefalse', label: 'Phần 2: Trắc nghiệm Đúng/Sai' },
  { id: 3, type: 'short', label: 'Phần 3: Trắc nghiệm Trả lời ngắn' },
]);

/** Cài đặt mặc định (được đồng bộ lên users/{uid}.settings). */
export const DEFAULT_SETTINGS = Object.freeze({
  timeLimit: 15,            // phút; 0 = không giới hạn
  shuffleQuestions: false,
  shuffleOptions: false,
  viewMode: 'scroll',       // 'scroll' | 'single'
  explainMode: 'after',     // 'instant' (ngay khi chọn sai) | 'after' (sau khi nộp)
});

const SETTINGS_CACHE_PREFIX = 'thkc_settings_';

/* --------------------------------------------------------------------------
   Trạng thái
   -------------------------------------------------------------------------- */

/**
 * @typedef {Object} QuizState
 * @property {string|null} subjectId
 * @property {string}      subjectName
 * @property {string|null} source
 * @property {string|null} categoryId
 * @property {string|null} categoryName
 * @property {string|null} lessonId
 * @property {string|null} lessonName
 * @property {number[]}    parts         Các phần ôn được chọn (1, 2, 3)
 * @property {Array<Object>} questions   Danh sách câu (đã lọc phần + xáo trộn)
 * @property {Object<string, any>} answers Map qid -> câu trả lời người dùng
 * @property {Object<string, boolean>} checked Map qid -> đã chấm tức thì (instant mode)
 * @property {number}  currentIndex      Vị trí câu ở chế độ Từng câu
 * @property {number}  startedAt         Date.now() khi bắt đầu
 * @property {number}  durationSec       Tổng thời gian cho phép (0 = không giới hạn)
 * @property {boolean} submitted
 * @property {boolean} isRetry           Đang làm lại câu sai
 */

/** @returns {QuizState} */
export function createEmptyQuiz() {
  return {
    subjectId: null,
    subjectName: '',
    source: null,
    categoryId: null,
    categoryName: null,
    lessonId: null,
    lessonName: null,
    parts: [1, 2, 3],
    questions: [],
    answers: {},
    checked: {},
    currentIndex: 0,
    startedAt: 0,
    durationSec: 0,
    submitted: false,
    isRetry: false,
  };
}

const state = {
  /** @type {{uid: string, email: string} | null} */
  user: null,
  settings: { ...DEFAULT_SETTINGS },
  /** @type {Array<{id: string, name: string, icon: string, sources: string[]}>} */
  subjects: [],
  selection: {
    /** @type {'1'|'2'|'2b'|'3'|number} */
    wizardStep: 1,
    subjectId: null,
    source: SOURCES.TRUONG,
    categoryId: null,
    categoryName: null,
    lessonId: null,
    lessonName: null,
    parts: [1, 2, 3],
  },
  quiz: createEmptyQuiz(),
  /** Kết quả lần nộp gần nhất (dùng cho màn Kết quả & "làm lại câu sai") */
  lastResult: null,
  online: typeof navigator !== 'undefined' ? navigator.onLine : true,
  pendingCount: 0,
};

/** @type {Map<string, Set<Function>>} */
const listeners = new Map();

/* --------------------------------------------------------------------------
   API đọc/ghi
   -------------------------------------------------------------------------- */

/**
 * Đọc 1 nhánh trạng thái (hoặc toàn bộ nếu không truyền key).
 * @param {keyof typeof state} [key]
 */
export function getState(key) {
  return key ? state[key] : state;
}

/**
 * Ghi đè 1 nhánh trạng thái và phát sự kiện.
 * @param {keyof typeof state} key
 * @param {any} value
 */
export function setState(key, value) {
  if (!(key in state)) {
    console.warn(`[state] Key không hợp lệ: ${key}`);
    return;
  }
  const prev = state[key];
  state[key] = value;
  emit(key, value, prev);
}

/**
 * Gộp nông (shallow merge) vào 1 nhánh dạng object.
 * @param {keyof typeof state} key
 * @param {Object} partial
 */
export function patchState(key, partial) {
  const prev = state[key];
  setState(key, { ...prev, ...partial });
}

/**
 * Đăng ký lắng nghe thay đổi. Dùng '*' để nghe mọi thay đổi.
 * @param {string} key
 * @param {(value: any, prev: any, key: string) => void} fn
 * @returns {() => void} Hàm hủy đăng ký
 */
export function subscribe(key, fn) {
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key).add(fn);
  return () => listeners.get(key)?.delete(fn);
}

function emit(key, value, prev) {
  const run = (fn) => {
    try { fn(value, prev, key); } catch (err) { console.error(`[state] Listener "${key}" lỗi:`, err); }
  };
  listeners.get(key)?.forEach(run);
  listeners.get('*')?.forEach(run);
}

/* --------------------------------------------------------------------------
   Tiện ích nghiệp vụ
   -------------------------------------------------------------------------- */

/**
 * Chuẩn hóa & kiểm tra cài đặt (dữ liệu từ Firestore/localStorage có thể thiếu/sai).
 * @param {Partial<typeof DEFAULT_SETTINGS>} raw
 * @returns {typeof DEFAULT_SETTINGS}
 */
export function normalizeSettings(raw = {}) {
  const s = { ...DEFAULT_SETTINGS, ...(raw || {}) };
  const time = Number.parseInt(s.timeLimit, 10);
  return {
    timeLimit: Number.isFinite(time) ? Math.min(Math.max(time, 0), 180) : DEFAULT_SETTINGS.timeLimit,
    shuffleQuestions: Boolean(s.shuffleQuestions),
    shuffleOptions: Boolean(s.shuffleOptions),
    viewMode: s.viewMode === 'single' ? 'single' : 'scroll',
    explainMode: s.explainMode === 'instant' ? 'instant' : 'after',
  };
}

/**
 * Cập nhật cài đặt trong state + cache localStorage (để mở app offline vẫn đúng).
 * @param {Partial<typeof DEFAULT_SETTINGS>} partial
 */
export function updateSettings(partial) {
  const next = normalizeSettings({ ...state.settings, ...partial });
  setState('settings', next);
  if (state.user?.uid) cacheSettings(state.user.uid, next);
  return next;
}

/** Đọc cài đặt đã cache cho 1 user (null nếu chưa có). */
export function loadCachedSettings(uid) {
  if (!uid) return null;
  try {
    const raw = localStorage.getItem(SETTINGS_CACHE_PREFIX + uid);
    return raw ? normalizeSettings(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/** Ghi cache cài đặt cho 1 user. */
export function cacheSettings(uid, settings) {
  if (!uid) return;
  try {
    localStorage.setItem(SETTINGS_CACHE_PREFIX + uid, JSON.stringify(normalizeSettings(settings)));
  } catch (err) {
    console.warn('[state] Không thể cache cài đặt:', err);
  }
}

/** Làm sạch phiên làm bài. */
export function resetQuiz() {
  setState('quiz', createEmptyQuiz());
}

/** Xóa toàn bộ dữ liệu phiên khi đăng xuất (giữ danh sách môn đã tải). */
export function resetSession() {
  state.user = null;
  state.settings = { ...DEFAULT_SETTINGS };
  state.selection = {
    wizardStep: 1,
    subjectId: null,
    source: SOURCES.TRUONG,
    categoryId: null,
    categoryName: null,
    chapterId: null,
    chapterName: null,
    lessonId: null,
    lessonName: null,
    parts: [1, 2, 3],
  };
  state.quiz = createEmptyQuiz();
  state.lastResult = null;
  state.pendingCount = 0;
  emit('session', null, null);
}

/* Debug trong console (chỉ đọc): window.__thkcState */
if (typeof window !== 'undefined') {
  Object.defineProperty(window, '__thkcState', { get: () => state, configurable: true });
}
