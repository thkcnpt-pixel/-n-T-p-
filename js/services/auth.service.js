/* ==========================================================================
   js/services/auth.service.js — Đăng nhập / Đăng xuất (KHÔNG có Đăng ký)
   Tài khoản do Admin cấp trong Firebase Console > Authentication.
   Dev by Thkc
   ========================================================================== */

import {
  auth,
  authReady,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from '../core/firebase.js';

/** Bảng dịch mã lỗi Firebase Auth sang tiếng Việt. */
const AUTH_ERRORS = {
  'auth/invalid-email': 'Email không hợp lệ.',
  'auth/missing-password': 'Vui lòng nhập mật khẩu.',
  'auth/user-disabled': 'Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên.',
  'auth/user-not-found': 'Email hoặc mật khẩu không đúng.',
  'auth/wrong-password': 'Email hoặc mật khẩu không đúng.',
  'auth/invalid-credential': 'Email hoặc mật khẩu không đúng.',
  'auth/invalid-login-credentials': 'Email hoặc mật khẩu không đúng.',
  'auth/too-many-requests': 'Bạn thử sai quá nhiều lần. Vui lòng đợi vài phút rồi thử lại.',
  'auth/network-request-failed': 'Không có kết nối mạng. Lần đăng nhập đầu tiên cần Internet.',
  'auth/operation-not-allowed': 'Phương thức đăng nhập Email/Password chưa được bật.',
  'auth/internal-error': 'Lỗi hệ thống. Vui lòng thử lại.',
};

/**
 * Chuyển lỗi Firebase thành thông báo thân thiện.
 * @param {any} err
 * @returns {string}
 */
export function getAuthErrorMessage(err) {
  return AUTH_ERRORS[err?.code] || 'Đăng nhập thất bại. Vui lòng thử lại.';
}

/**
 * Đăng nhập bằng Email/Password.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<import('https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js').User>}
 * @throws {Error} err.message đã được dịch sang tiếng Việt, err.code giữ nguyên
 */
export async function login(email, password) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanPass = String(password || '');

  if (!cleanEmail || !cleanPass) {
    const err = new Error('Vui lòng nhập đầy đủ email và mật khẩu.');
    err.code = 'app/missing-fields';
    throw err;
  }

  await authReady;

  try {
    const cred = await signInWithEmailAndPassword(auth, cleanEmail, cleanPass);
    return cred.user;
  } catch (err) {
    const friendly = new Error(getAuthErrorMessage(err));
    friendly.code = err?.code;
    throw friendly;
  }
}

/** Đăng xuất. */
export async function logout() {
  await signOut(auth);
}

/**
 * Lắng nghe trạng thái đăng nhập (bao gồm khôi phục phiên khi mở lại app).
 * @param {(user: any|null) => void} callback
 * @returns {() => void} Hàm hủy lắng nghe
 */
export function watchAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

/** @returns {any|null} User hiện tại (đồng bộ) */
export function getCurrentUser() {
  return auth.currentUser;
}
