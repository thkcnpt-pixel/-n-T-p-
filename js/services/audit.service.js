/* ==========================================================================
   js/services/audit.service.js — Audit Log đăng nhập
   Ghi vào collection `login_logs`: timestamp, userAgent, ip (+ uid, email để truy vết).
   CHỈ gọi sau khi người dùng chủ động đăng nhập thành công qua form
   (không gọi khi Firebase tự khôi phục phiên lúc mở lại app).
   Dev by Thkc
   ========================================================================== */

import { db, COLLECTIONS, collection, addDoc, serverTimestamp } from '../core/firebase.js';
import { withTimeout } from './offline.service.js';

const IP_API = 'https://api.ipify.org?format=json';

/**
 * Lấy IP public hiện tại. Không bao giờ throw — lỗi trả về 'unknown'
 * (ipify có thể bị AdBlock / mạng trường chặn).
 * @param {number} [timeoutMs=4000]
 * @returns {Promise<string>}
 */
export async function fetchPublicIp(timeoutMs = 4000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(IP_API, { signal: controller.signal, cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return typeof data?.ip === 'string' && data.ip ? data.ip : 'unknown';
  } catch (err) {
    console.warn('[audit] Không lấy được IP:', err?.message || err);
    return 'unknown';
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Ghi 1 bản ghi đăng nhập. Chạy nền, không chặn luồng đăng nhập.
 * @param {{uid: string, email: string|null}} user
 * @returns {Promise<boolean>} true nếu ghi thành công
 */
export async function logLogin(user) {
  if (!user?.uid) return false;

  try {
    const ip = await fetchPublicIp();
    await withTimeout(
      addDoc(collection(db, COLLECTIONS.LOGIN_LOGS), {
        timestamp: serverTimestamp(),                  // giờ máy chủ (tin cậy)
        clientTime: new Date().toISOString(),          // giờ thiết bị (tham khảo)
        userAgent: navigator.userAgent || 'unknown',
        ip,
        uid: user.uid,
        email: user.email || null,
      }),
      8000,
      'Ghi audit log'
    );
    return true;
  } catch (err) {
    console.warn('[audit] Ghi login_logs thất bại:', err);
    return false;
  }
}
