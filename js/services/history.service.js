/* ==========================================================================
   js/services/history.service.js — Lịch sử thi (users/{uid}/history/{id})
   - Lưu kết quả có dự phòng offline (localStorage queue).
   - ID document được sinh phía client TRƯỚC khi ghi => ghi lại nhiều lần
     (retry/flush) chỉ ghi đè cùng 1 document, KHÔNG tạo bản ghi trùng.
   - Auto-clean: xóa bản ghi cũ hơn 365 ngày, chạy ngầm mỗi lần đăng nhập.
   Dev by Thkc
   ========================================================================== */

import {
  auth,
  db,
  COLLECTIONS,
  doc,
  setDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  writeBatch,
  Timestamp,
  serverTimestamp,
} from '../core/firebase.js';

import {
  enqueue,
  getQueue,
  registerFlusher,
  withTimeout,
  isOnline,
} from './offline.service.js';

const RETENTION_DAYS = 365;
const DAY_MS = 24 * 60 * 60 * 1000;
const WRITE_TIMEOUT_MS = 8000;
const READ_TIMEOUT_MS = 6000;
const CLEAN_BATCH_SIZE = 400; // < 500 (giới hạn writeBatch)

/** @param {string} uid */
const historyCol = (uid) => collection(db, COLLECTIONS.USERS, uid, COLLECTIONS.HISTORY);

/**
 * @typedef {Object} HistoryRecord
 * @property {string}   id
 * @property {string}   subjectId
 * @property {string}   subjectName
 * @property {string}   source        'truong' | 'ngoai' | 'all'
 * @property {number}   score         Điểm thang 10 (làm tròn 2 chữ số)
 * @property {number}   correct
 * @property {number}   wrong
 * @property {number}   unanswered
 * @property {number}   total
 * @property {number}   durationSec
 * @property {string[]} wrongIds      Key các câu sai/bỏ trống
 * @property {boolean}  isRetry
 * @property {number}   createdAt     Epoch ms (ngày thi)
 * @property {boolean}  [pending]     Chỉ có ở client: đang chờ đồng bộ
 */

/**
 * Ghi 1 bản ghi lên Firestore (idempotent nhờ ID cố định).
 * @param {HistoryRecord} record
 * @param {string} uid
 */
async function writeRemote(record, uid) {
  const { id, createdAt, pending, ...rest } = record;
  await setDoc(doc(db, COLLECTIONS.USERS, uid, COLLECTIONS.HISTORY, id), {
    ...rest,
    createdAt: Timestamp.fromMillis(createdAt),
    syncedAt: serverTimestamp(),
  });
}

registerFlusher('history', writeRemote);

/**
 * Tạo bản ghi lịch sử thuần JSON từ kết quả chấm điểm.
 * @param {Object} result  Kết quả từ grader + thông tin bài
 * @param {string} uid
 * @returns {HistoryRecord}
 */
function buildRecord(result, uid) {
  const total = Number(result.total) || 0;
  const correct = Number(result.correct) || 0;
  return {
    id: doc(historyCol(uid)).id, // sinh ID offline được
    subjectId: String(result.subjectId || ''),
    subjectName: String(result.subjectName || ''),
    source: String(result.source || ''),
    categoryId: result.categoryId ? String(result.categoryId) : null,
    chapterId: result.chapterId ? String(result.chapterId) : null,
    lessonId: result.lessonId ? String(result.lessonId) : null,
    score: total ? Math.round((correct / total) * 1000) / 100 : 0,
    correct,
    wrong: Number(result.wrong) || 0,
    unanswered: Number(result.unanswered) || 0,
    total,
    durationSec: Math.max(0, Math.round(Number(result.durationSec) || 0)),
    wrongIds: Array.isArray(result.wrongIds) ? result.wrongIds.map(String) : [],
    isRetry: Boolean(result.isRetry),
    createdAt: Number(result.createdAt) || Date.now(),
  };
}

/* --------------------------------------------------------------------------
   Theo dõi trạng thái "Đã làm / Chưa làm" & phân loại màu theo điểm
   - Dưới 5đ (< 5): màu đỏ ('low')
   - 5đ đến dưới 8đ (5 <= score < 8): màu xanh dương ('mid')
   - 8đ đến 10đ (score >= 8): màu xanh lá ('good')
   -------------------------------------------------------------------------- */

const PROGRESS_STORAGE_PREFIX = 'thkc_progress_';

/** @type {Map<string, {score: number, correct: number, total: number, createdAt: number}>} */
const progressMap = new Map();

/**
 * Tạo khóa định danh duy nhất cho 1 đề / bài học / đề trường.
 * @param {{subjectId?: string|null, source?: string|null, categoryId?: string|null, chapterId?: string|null, lessonId?: string|null}} opts
 * @returns {string}
 */
export function buildProgressKey({ subjectId, source, categoryId, chapterId, lessonId } = {}) {
  const subj = String(subjectId || '').trim();
  const src = String(source || 'truong').trim();
  if (lessonId) {
    return `${subj}:${src}:${categoryId || ''}:${chapterId || ''}:${lessonId}`;
  }
  return `${subj}:${src}:::`;
}

/**
 * Suy luận khóa tiến độ từ bản ghi lịch sử (hỗ trợ cả bản ghi cũ chưa lưu lessonId).
 * @param {any} rec
 * @returns {string|null}
 */
function inferProgressKeyFromRecord(rec) {
  if (!rec || !rec.subjectId || !rec.source) return null;
  if (rec.lessonId) {
    return buildProgressKey(rec);
  }
  // Thử suy luận từ wrongIds (VD: "toan:ngoai:tonghop:chuong_6:bai_01:cau_01" hoặc "toan:ngoai:xacsuat:bai_01:cau_01")
  if (Array.isArray(rec.wrongIds) && rec.wrongIds.length > 0) {
    const parts = String(rec.wrongIds[0]).split(':');
    if (parts.length >= 6) {
      return buildProgressKey({
        subjectId: parts[0],
        source: parts[1],
        categoryId: parts[2],
        chapterId: parts[3],
        lessonId: parts[4],
      });
    }
    if (parts.length === 5) {
      return buildProgressKey({
        subjectId: parts[0],
        source: parts[1],
        categoryId: parts[2],
        chapterId: null,
        lessonId: parts[3],
      });
    }
  }
  // Nếu là đề phẳng (không phải Toán/Tin đề ngoài chia bài)
  if (!(rec.subjectId === 'toan' && rec.source === 'ngoai') && !(rec.subjectId === 'tinhoc' && rec.source === 'ngoai')) {
    return buildProgressKey({ subjectId: rec.subjectId, source: rec.source });
  }
  return null;
}

function saveProgressToLocal(uid) {
  if (!uid) return;
  try {
    const obj = Object.fromEntries(progressMap.entries());
    localStorage.setItem(`${PROGRESS_STORAGE_PREFIX}${uid}`, JSON.stringify(obj));
  } catch (err) {
    console.warn('[history] Không lưu được cache tiến độ vào localStorage:', err);
  }
}

function loadProgressFromLocal(uid) {
  progressMap.clear();
  if (!uid) return;
  try {
    const raw = localStorage.getItem(`${PROGRESS_STORAGE_PREFIX}${uid}`);
    if (!raw) return;
    const obj = JSON.parse(raw);
    if (obj && typeof obj === 'object') {
      for (const [k, v] of Object.entries(obj)) {
        if (v && typeof v.score === 'number') {
          progressMap.set(k, v);
        }
      }
    }
  } catch (err) {
    console.warn('[history] Lỗi đọc cache tiến độ từ localStorage:', err);
  }
}

function applyRecordToProgress(rec) {
  const key = inferProgressKeyFromRecord(rec);
  if (!key) return;
  const prev = progressMap.get(key);
  const createdAt = Number(rec.createdAt) || 0;
  // Lưu kết quả của lần làm bài mới nhất (hoặc nếu chưa có)
  if (!prev || createdAt >= (prev.createdAt || 0)) {
    progressMap.set(key, {
      score: Number(rec.score) || 0,
      correct: Number(rec.correct) || 0,
      total: Number(rec.total) || 0,
      createdAt,
    });
  }
}

/**
 * Lấy trạng thái Đã làm / Chưa làm và phân loại màu sắc theo điểm số:
 * - Chưa làm: `{ done: false, level: 'none', text: 'Chưa làm' }`
 * - Dưới 5đ (< 5): `{ done: true, level: 'low', score, text: 'Đã làm · Xđ' }` (Màu đỏ)
 * - Từ 5đ đến dưới 8đ (5 <= score < 8): `{ done: true, level: 'mid', score, text: 'Đã làm · Xđ' }` (Màu xanh dương)
 * - Từ 8đ đến 10đ (score >= 8): `{ done: true, level: 'good', score, text: 'Đã làm · Xđ' }` (Màu xanh lá)
 * @param {{subjectId?: string|null, source?: string|null, categoryId?: string|null, chapterId?: string|null, lessonId?: string|null}} opts
 */
export function getAttemptStatus(opts = {}) {
  const key = buildProgressKey(opts);
  const entry = progressMap.get(key);
  if (!entry) {
    return {
      done: false,
      level: 'none',
      score: null,
      text: 'Chưa làm',
    };
  }
  const score = Number(entry.score) || 0;
  const formattedScore = Number.isInteger(score) ? String(score) : score.toFixed(1).replace(/\.0$/, '');
  /** @type {'low'|'mid'|'good'} */
  let level = 'low';
  if (score >= 8) {
    level = 'good';
  } else if (score >= 5) {
    level = 'mid';
  }
  return {
    done: true,
    level,
    score,
    text: `Đã làm · ${formattedScore}đ`,
  };
}

/**
 * Tải toàn bộ lịch sử làm bài của user để đồng bộ trạng thái Đã làm / Chưa làm.
 * @param {number} [maxCount=150]
 */
export async function syncUserProgress(maxCount = 150) {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    progressMap.clear();
    return;
  }
  loadProgressFromLocal(uid);
  await fetchRecentHistory(maxCount);
  saveProgressToLocal(uid);
}

/**
 * Lưu kết quả bài thi. Không throw khi lỗi mạng — tự chuyển sang hàng đợi offline.
 * @param {Object} result
 * @returns {Promise<{status: 'synced'|'queued', record: HistoryRecord}>}
 */
export async function saveResult(result) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Chưa đăng nhập — không thể lưu kết quả.');

  const record = buildRecord(result, uid);
  applyRecordToProgress(record);
  saveProgressToLocal(uid);

  const queueIt = () => {
    enqueue({ type: 'history', uid, payload: record, dedupeKey: `history:${record.id}` });
    return { status: 'queued', record };
  };

  if (!isOnline()) return queueIt();

  try {
    await withTimeout(writeRemote(record, uid), WRITE_TIMEOUT_MS, 'Lưu kết quả');
    return { status: 'synced', record };
  } catch (err) {
    console.warn('[history] Lưu lên mây thất bại, chuyển sang localStorage:', err);
    return queueIt();
  }
}

/**
 * Lấy lịch sử gần đây: gộp bản trên mây + bản đang chờ đồng bộ.
 * @param {number} [count=5]
 * @returns {Promise<HistoryRecord[]>}
 */
export async function fetchRecentHistory(count = 5) {
  const uid = auth.currentUser?.uid;
  if (!uid) return [];

  /** @type {Map<string, HistoryRecord>} */
  const merged = new Map();

  getQueue(uid, 'history').forEach((item) => {
    const rec = { ...item.payload, pending: true };
    merged.set(item.payload.id, rec);
    applyRecordToProgress(rec);
  });

  if (isOnline()) {
    try {
      const snap = await withTimeout(
        getDocs(query(historyCol(uid), orderBy('createdAt', 'desc'), limit(count))),
        READ_TIMEOUT_MS,
        'Tải lịch sử'
      );
      snap.forEach((d) => {
        const data = d.data();
        const rec = {
          ...data,
          id: d.id,
          createdAt: data.createdAt?.toMillis?.() ?? 0,
          pending: false,
        };
        merged.set(d.id, rec);
        applyRecordToProgress(rec);
      });
      saveProgressToLocal(uid);
    } catch (err) {
      console.warn('[history] Không tải được lịch sử từ mây:', err);
    }
  }

  return [...merged.values()]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, count);
}

/* --------------------------------------------------------------------------
   Auto-clean: xóa lịch sử cũ hơn 365 ngày
   -------------------------------------------------------------------------- */

/** uid đã dọn trong phiên hiện tại (tránh chạy lặp khi auth state đổi nhiều lần) */
const cleanedThisSession = new Set();

/**
 * Quét và xóa các bản ghi cũ hơn RETENTION_DAYS của user hiện tại.
 * Truy vấn 1 trường (createdAt) nên không cần tạo composite index.
 * @returns {Promise<number>} Số bản ghi đã xóa
 */
export async function autoCleanHistory() {
  const uid = auth.currentUser?.uid;
  if (!uid || !isOnline() || cleanedThisSession.has(uid)) return 0;
  cleanedThisSession.add(uid);

  const cutoff = Timestamp.fromMillis(Date.now() - RETENTION_DAYS * DAY_MS);
  let deleted = 0;

  try {
    // Lặp theo lô cho tới khi hết bản ghi cũ
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const snap = await withTimeout(
        getDocs(query(historyCol(uid), where('createdAt', '<', cutoff), limit(CLEAN_BATCH_SIZE))),
        READ_TIMEOUT_MS,
        'Quét lịch sử cũ'
      );
      if (snap.empty) break;

      const batch = writeBatch(db);
      snap.docs.forEach((d) => batch.delete(d.ref));
      await withTimeout(batch.commit(), WRITE_TIMEOUT_MS, 'Xóa lịch sử cũ');

      deleted += snap.size;
      if (snap.size < CLEAN_BATCH_SIZE) break;
    }
    if (deleted) console.info(`[history] Auto-clean: đã xóa ${deleted} bản ghi > ${RETENTION_DAYS} ngày.`);
  } catch (err) {
    cleanedThisSession.delete(uid); // cho phép thử lại lần sau
    console.warn('[history] Auto-clean thất bại:', err);
  }

  return deleted;
}

/** Lên lịch auto-clean khi trình duyệt rảnh (không ảnh hưởng tốc độ mở app). */
export function scheduleAutoClean() {
  const run = () => { autoCleanHistory(); };
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(run, { timeout: 5000 });
  } else {
    setTimeout(run, 3000);
  }
}
