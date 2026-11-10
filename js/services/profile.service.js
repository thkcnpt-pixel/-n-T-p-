/* ==========================================================================
   js/services/profile.service.js — Hồ sơ & đồng bộ cài đặt (users/{uid})
   Thứ tự ưu tiên khi tải: cache localStorage (hiện ngay) -> Firestore (ghi đè nếu có).
   Nếu đang có thay đổi cài đặt chưa đồng bộ trong hàng đợi, bản local được ưu tiên.
   Dev by Thkc
   ========================================================================== */

import {
  auth,
  db,
  COLLECTIONS,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from '../core/firebase.js';

import {
  getState,
  setState,
  normalizeSettings,
  loadCachedSettings,
  cacheSettings,
  updateSettings,
  DEFAULT_SETTINGS,
} from '../core/state.js';

import {
  enqueue,
  getQueue,
  registerFlusher,
  withTimeout,
  isOnline,
} from './offline.service.js';

const READ_TIMEOUT_MS = 6000;
const WRITE_TIMEOUT_MS = 6000;

/** @param {string} uid */
const userDoc = (uid) => doc(db, COLLECTIONS.USERS, uid);

/**
 * Ghi cài đặt lên Firestore (idempotent — dùng merge).
 * @param {Object} settings
 * @param {string} uid
 */
async function writeSettingsRemote(settings, uid) {
  await setDoc(
    userDoc(uid),
    { settings: normalizeSettings(settings), settingsUpdatedAt: serverTimestamp() },
    { merge: true }
  );
}

// Cho phép offline.service đẩy cài đặt khi có mạng lại
registerFlusher('settings', writeSettingsRemote);

/**
 * Tải cài đặt của user vào state. Không throw.
 * @param {{uid: string, email: string|null}} user
 * @returns {Promise<Object>} Cài đặt cuối cùng
 */
export async function loadUserProfile(user) {
  const uid = user?.uid;
  if (!uid) return getState('settings');

  // 1) Hiện ngay bản cache (mở app offline vẫn đúng cấu hình)
  setState('settings', loadCachedSettings(uid) || { ...DEFAULT_SETTINGS });

  if (!isOnline()) return getState('settings');

  // 2) Lấy bản trên mây
  try {
    const snap = await withTimeout(getDoc(userDoc(uid)), READ_TIMEOUT_MS, 'Tải hồ sơ');
    const hasPendingLocal = getQueue(uid, 'settings').length > 0;

    if (snap.exists() && snap.data()?.settings && !hasPendingLocal) {
      const remote = normalizeSettings(snap.data().settings);
      setState('settings', remote);
      cacheSettings(uid, remote);
    } else if (!snap.exists()) {
      // Lần đầu đăng nhập: khởi tạo document hồ sơ
      await withTimeout(
        setDoc(
          userDoc(uid),
          {
            email: user.email || null,
            settings: normalizeSettings(getState('settings')),
            createdAt: serverTimestamp(),
          },
          { merge: true }
        ),
        WRITE_TIMEOUT_MS,
        'Khởi tạo hồ sơ'
      );
    }
  } catch (err) {
    console.warn('[profile] Không tải được hồ sơ, dùng cài đặt cục bộ:', err);
  }

  return getState('settings');
}

/**
 * Lưu cài đặt: cập nhật state + cache ngay, sau đó đẩy lên Firestore.
 * Mất mạng/lỗi -> xếp hàng đợi, tự đồng bộ khi online.
 * @param {Partial<typeof DEFAULT_SETTINGS>} partial
 * @returns {Promise<{status: 'synced'|'queued'|'local', settings: Object}>}
 */
export async function saveSettings(partial) {
  const settings = updateSettings(partial);
  const uid = auth.currentUser?.uid;
  if (!uid) return { status: 'local', settings };

  const queueIt = () => {
    enqueue({ type: 'settings', uid, payload: settings, dedupeKey: `settings:${uid}` });
    return { status: 'queued', settings };
  };

  if (!isOnline()) return queueIt();

  try {
    await withTimeout(writeSettingsRemote(settings, uid), WRITE_TIMEOUT_MS, 'Lưu cài đặt');
    return { status: 'synced', settings };
  } catch (err) {
    console.warn('[profile] Lưu cài đặt lên mây thất bại, xếp hàng đợi:', err);
    return queueIt();
  }
}

/**
 * Cập nhật thời điểm đăng nhập gần nhất (chạy nền, bỏ qua lỗi).
 * @param {{uid: string, email: string|null}} user
 */
export function touchLastLogin(user) {
  if (!user?.uid || !isOnline()) return;
  setDoc(
    userDoc(user.uid),
    { email: user.email || null, lastLoginAt: serverTimestamp() },
    { merge: true }
  ).catch((err) => console.warn('[profile] touchLastLogin lỗi:', err));
}
