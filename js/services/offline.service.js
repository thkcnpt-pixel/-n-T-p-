/* ==========================================================================
   js/services/offline.service.js — Hàng đợi offline (localStorage) & tiện ích mạng
   - Khi ghi Firestore thất bại / mất mạng: dữ liệu được xếp hàng trong localStorage.
   - Lắng nghe window 'online' để tự động đẩy hàng đợi lên Firebase.
   - Cơ chế "flusher" theo loại dữ liệu: các service khác tự đăng ký hàm ghi,
     nhờ vậy module này không phụ thuộc ngược (tránh import vòng).
   Dev by Thkc
   ========================================================================== */

import { auth } from '../core/firebase.js';
import { setState } from '../core/state.js';

const QUEUE_KEY = 'thkc_offline_queue_v1';
const MAX_ATTEMPTS = 5;          // lỗi KHÔNG phải do mạng quá 5 lần -> bỏ item
const FLUSH_DELAY_MS = 1500;     // chờ mạng ổn định sau sự kiện 'online'
const FLUSH_TIMEOUT_MS = 10000;

/**
 * @typedef {Object} QueueItem
 * @property {string} id
 * @property {string} type        'history' | 'settings' | ...
 * @property {string} uid         Chủ sở hữu (chỉ đẩy khi đúng user đang đăng nhập)
 * @property {any}    payload     Dữ liệu thuần JSON
 * @property {string} [dedupeKey] Item mới cùng key sẽ thay thế item cũ
 * @property {number} attempts
 * @property {number} createdAt
 */

/** @type {Map<string, (payload: any, uid: string) => Promise<void>>} */
const flushers = new Map();

/** @type {Promise<any>|null} */
let flushing = null;
let initialized = false;

/* --------------------------------------------------------------------------
   Tiện ích mạng
   -------------------------------------------------------------------------- */

export class TimeoutError extends Error {
  constructor(label = 'Yêu cầu') {
    super(`${label} quá thời gian chờ`);
    this.name = 'TimeoutError';
    this.code = 'timeout';
  }
}

/**
 * Giới hạn thời gian cho 1 Promise (Firestore có thể treo rất lâu khi mạng yếu).
 * @template T
 * @param {Promise<T>} promise
 * @param {number} [ms=8000]
 * @param {string} [label]
 * @returns {Promise<T>}
 */
export function withTimeout(promise, ms = 8000, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(label)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** @returns {boolean} */
export function isOnline() {
  return typeof navigator === 'undefined' ? true : navigator.onLine !== false;
}

/**
 * Lỗi có phải do mạng (đáng thử lại) hay không.
 * @param {any} err
 */
export function isNetworkError(err) {
  if (!isOnline()) return true;
  const code = err?.code || '';
  return (
    code === 'timeout' ||
    code === 'unavailable' ||
    code === 'deadline-exceeded' ||
    code === 'auth/network-request-failed' ||
    err instanceof TypeError // fetch() thất bại
  );
}

/* --------------------------------------------------------------------------
   Thao tác hàng đợi
   -------------------------------------------------------------------------- */

/** @returns {QueueItem[]} */
function readQueue() {
  try {
    const parsed = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** @param {QueueItem[]} queue */
function writeQueue(queue) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch (err) {
    // QuotaExceededError: localStorage đầy (~5MB)
    console.error('[offline] Không thể ghi hàng đợi vào localStorage:', err);
  }
}

function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Thêm 1 item vào hàng đợi.
 * @param {{type: string, uid: string, payload: any, dedupeKey?: string}} input
 * @returns {QueueItem}
 */
export function enqueue({ type, uid, payload, dedupeKey }) {
  if (!type || !uid) throw new Error('[offline] enqueue cần type và uid');

  /** @type {QueueItem} */
  const item = {
    id: makeId(),
    type,
    uid,
    payload,
    dedupeKey,
    attempts: 0,
    createdAt: Date.now(),
  };

  let queue = readQueue();
  if (dedupeKey) queue = queue.filter((i) => i.dedupeKey !== dedupeKey);
  queue.push(item);
  writeQueue(queue);
  refreshPendingCount();
  return item;
}

/**
 * Lấy các item đang chờ (lọc theo uid / type nếu truyền).
 * @param {string} [uid]
 * @param {string} [type]
 * @returns {QueueItem[]}
 */
export function getQueue(uid, type) {
  return readQueue().filter((i) => (!uid || i.uid === uid) && (!type || i.type === type));
}

/** @param {string} id */
function removeItem(id) {
  writeQueue(readQueue().filter((i) => i.id !== id));
}

/**
 * Tăng số lần thất bại; quá MAX_ATTEMPTS thì loại bỏ.
 * @param {string} id
 * @param {any} err
 */
function bumpAttempts(id, err) {
  const queue = readQueue();
  const item = queue.find((i) => i.id === id);
  if (!item) return;
  item.attempts = (item.attempts || 0) + 1;
  if (item.attempts >= MAX_ATTEMPTS) {
    console.error(`[offline] Bỏ item "${item.type}" sau ${MAX_ATTEMPTS} lần lỗi:`, err, item);
    writeQueue(queue.filter((i) => i.id !== id));
  } else {
    writeQueue(queue);
  }
}

/** Cập nhật state.pendingCount theo user hiện tại (UI hiển thị badge). */
export function refreshPendingCount() {
  const uid = auth.currentUser?.uid;
  setState('pendingCount', uid ? getQueue(uid).length : 0);
}

/**
 * Đăng ký hàm đẩy dữ liệu cho 1 loại item.
 * Hàm phải idempotent (ghi lại nhiều lần vẫn cho cùng kết quả).
 * @param {string} type
 * @param {(payload: any, uid: string) => Promise<void>} fn
 */
export function registerFlusher(type, fn) {
  flushers.set(type, fn);
}

/* --------------------------------------------------------------------------
   Đồng bộ
   -------------------------------------------------------------------------- */

/**
 * Đẩy toàn bộ hàng đợi của user hiện tại lên Firebase (tuần tự, theo thứ tự thời gian).
 * Gọi nhiều lần đồng thời sẽ dùng chung 1 tiến trình.
 * @returns {Promise<{synced: number, remaining: number}>}
 */
export function flushQueue() {
  if (flushing) return flushing;
  flushing = doFlush().finally(() => { flushing = null; });
  return flushing;
}

async function doFlush() {
  const uid = auth.currentUser?.uid;
  if (!uid || !isOnline()) {
    return { synced: 0, remaining: uid ? getQueue(uid).length : 0 };
  }

  let synced = 0;
  const snapshot = getQueue(uid).sort((a, b) => a.createdAt - b.createdAt);

  for (const item of snapshot) {
    const fn = flushers.get(item.type);
    if (!fn) {
      console.warn(`[offline] Chưa có flusher cho loại "${item.type}" — giữ lại.`);
      continue;
    }
    try {
      await withTimeout(fn(item.payload, item.uid), FLUSH_TIMEOUT_MS, 'Đồng bộ');
      removeItem(item.id);
      synced += 1;
    } catch (err) {
      if (isNetworkError(err)) {
        console.warn('[offline] Mạng chưa ổn định, tạm dừng đồng bộ.', err);
        break;
      }
      bumpAttempts(item.id, err);
    }
  }

  refreshPendingCount();
  const remaining = getQueue(uid).length;

  if (synced > 0) {
    window.dispatchEvent(new CustomEvent('thkc:synced', { detail: { synced, remaining } }));
  }
  return { synced, remaining };
}

/**
 * Khởi động cơ chế tự đồng bộ. Gọi 1 lần trong app.js.
 * - 'online'  -> cập nhật state + đẩy hàng đợi
 * - 'offline' -> cập nhật state
 * - Quay lại tab -> thử đẩy hàng đợi
 */
export function initOfflineSync() {
  if (initialized) return;
  initialized = true;

  window.addEventListener('online', () => {
    setState('online', true);
    setTimeout(() => { flushQueue(); }, FLUSH_DELAY_MS);
  });

  window.addEventListener('offline', () => {
    setState('online', false);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && isOnline()) flushQueue();
  });

  setState('online', isOnline());
}
