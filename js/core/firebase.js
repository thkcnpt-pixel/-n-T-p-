/* ==========================================================================
   js/core/firebase.js — Khởi tạo Firebase (Modular SDK v9, nhúng qua CDN)
   Mọi module khác chỉ import Firebase từ file này để dễ nâng cấp phiên bản.
   Dev by Thkc
   ========================================================================== */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js';

import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js';

import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  addDoc,
  deleteDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  writeBatch,
  serverTimestamp,
  Timestamp,
} from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';

/* ---------- Cấu hình dự án ---------- */
const firebaseConfig = {
  apiKey: 'AIzaSyBz1LR3gGgOX6OGyvfW_tmDwBWZ8xbo0eo',
  authDomain: 'thkc-project.firebaseapp.com',
  projectId: 'thkc-project',
  storageBucket: 'thkc-project.firebasestorage.app',
  messagingSenderId: '474335712323',
  appId: '1:474335712323:web:b4ebc1395896bbad72b0f6',
  measurementId: 'G-H70T7ZL5YH',
};

/* ---------- Hằng số dùng chung ---------- */
/** Email quản trị duy nhất được đọc login_logs (phải khớp firestore.rules). */
export const ADMIN_EMAIL = 'thkcnpt@gmail.com';

/** Tên các collection — tránh gõ sai chuỗi ở nhiều nơi. */
export const COLLECTIONS = Object.freeze({
  USERS: 'users',
  HISTORY: 'history',        // sub-collection: users/{uid}/history/{id}
  LOGIN_LOGS: 'login_logs',
});

/* ---------- Khởi tạo ---------- */
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
auth.languageCode = 'vi';

/*
 * LƯU Ý THIẾT KẾ: KHÔNG bật enableIndexedDbPersistence() cho Firestore.
 * Khi bật, lệnh ghi lúc offline sẽ "treo" chờ mạng thay vì báo lỗi, khiến
 * cơ chế dự phòng localStorage (offline.service.js) không phát hiện được.
 * Việc lưu offline do ứng dụng tự kiểm soát để minh bạch với người dùng.
 */
export const db = getFirestore(app);

/**
 * Giữ phiên đăng nhập qua các lần mở app (kể cả khi offline).
 * Gọi 1 lần trước khi đăng nhập; lỗi không nghiêm trọng nên chỉ cảnh báo.
 */
export const authReady = setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.warn('[firebase] Không thể đặt persistence:', err);
});

/* ---------- Re-export API để các module khác dùng ---------- */
export {
  // Auth
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  // Firestore
  doc,
  getDoc,
  setDoc,
  addDoc,
  deleteDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  writeBatch,
  serverTimestamp,
  Timestamp,
};
