/* ==========================================================================
   service-worker.js — PWA Service Worker (Chiến lược Cache-First cho tài nguyên)
   - Precache toàn bộ App Shell (HTML, CSS, JS, JSON câu hỏi, hình ảnh, icon,
     KaTeX CSS/JS và Firebase Modular SDK) ngay khi cài đặt.
   - Chiến lược Cache-First cho toàn bộ tài nguyên tĩnh, hình ảnh, file JSON,
     font chữ KaTeX (.woff2/.woff/.ttf) từ jsDelivr và SDK từ gstatic để mở
     app và làm bài hoàn toàn bình thường khi thiết bị Offline 100%.
   - Không can thiệp (Network-Only) đối với các API động: Firebase Auth/Firestore
     (`googleapis.com`, `firebaseio.com`) và API lấy IP (`api.ipify.org`).
   Dev by Thkc
   ========================================================================== */

const CACHE_VERSION = 'thkc-quiz-v1.7.0';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

/** Danh sách tài nguyên cốt lõi cần lưu sẵn ngay khi cài đặt Service Worker. */
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',

  // CSS
  './css/variables.css',
  './css/base.css',
  './css/layout.css',
  './css/components.css',

  // JS Core
  './js/app.js',
  './js/core/firebase.js',
  './js/core/router.js',
  './js/core/state.js',

  // JS Services
  './js/services/auth.service.js',
  './js/services/audit.service.js',
  './js/services/profile.service.js',
  './js/services/history.service.js',
  './js/services/offline.service.js',
  './js/services/data.service.js',

  // JS Quiz
  './js/quiz/shuffle.js',
  './js/quiz/grader.js',
  './js/quiz/renderer.js',
  './js/quiz/controller.js',

  // JS UI
  './js/ui/smart-header.js',
  './js/ui/swipe.js',
  './js/ui/accordion.js',
  './js/ui/settings-modal.js',

  // Data JSON (6 môn)
  './data/subjects.json',
  './data/toan-truong.json',
  './data/toan-ngoai.json',
  './data/vatly-truong.json',
  './data/vatly-ngoai.json',
  './data/tinhoc-truong.json',
  './data/tinhoc-ngoai.json',
  './data/hoahoc-truong.json',
  './data/sinhhoc-truong.json',
  './data/gdqp-truong.json',

  // Hình ảnh & Icons
  './images/sample.jpg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',

  // CDN: KaTeX & Firebase v9 Modular SDK
  'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css',
  'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js',
  'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js',
];

/** Các tên miền CDN tĩnh được phép áp dụng Cache-First (KaTeX fonts, Firebase SDK). */
const CACHEABLE_CDN_HOSTS = new Set([
  'cdn.jsdelivr.net',
  'www.gstatic.com',
]);

/** Các tên miền API động tuyệt đối KHÔNG lưu cache trong Service Worker. */
const BYPASS_HOSTS = [
  'api.ipify.org',
  'googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'firestore.googleapis.com',
  'firebaseinstallations.googleapis.com',
];

/* --------------------------------------------------------------------------
   Lifecycle: Install (Precache)
   -------------------------------------------------------------------------- */
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      // Tải từng tài nguyên độc lập để nếu 1 CDN chậm cũng không làm hỏng toàn bộ quá trình cài đặt
      await Promise.allSettled(
        PRECACHE_ASSETS.map(async (url) => {
          try {
            const req = new Request(url, { cache: 'reload' });
            const res = await fetch(req);
            if (res.ok || res.type === 'opaque') {
              await cache.put(url, res);
            }
          } catch (err) {
            console.warn('[sw] Không precache được:', url, err);
          }
        })
      );
      await self.skipWaiting();
    })()
  );
});

/* --------------------------------------------------------------------------
   Lifecycle: Activate (Xóa cache phiên bản cũ)
   -------------------------------------------------------------------------- */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

/* --------------------------------------------------------------------------
   Fetch: Chiến lược Cache-First
   -------------------------------------------------------------------------- */
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Chỉ xử lý request GET
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // Bỏ qua các API động (Firestore, Auth, ipify)
  if (BYPASS_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) {
    return;
  }

  const isSameOrigin = url.origin === self.location.origin;
  const isCacheableCdn = CACHEABLE_CDN_HOSTS.has(url.hostname);

  if (!isSameOrigin && !isCacheableCdn) return;

  // Điều hướng trang (HTML navigation): Cache-First, fallback về ./index.html
  if (request.mode === 'navigate') {
    event.respondWith(handleNavigationRequest(request));
    return;
  }

  // Toàn bộ tài nguyên tĩnh (CSS, JS, JSON, Ảnh, Font KaTeX): Cache-First
  event.respondWith(cacheFirst(request));
});

/**
 * Chiến lược Cache-First chuẩn:
 * 1) Tìm trong bộ nhớ Cache (bỏ qua query string nếu là file nội bộ).
 * 2) Nếu có -> trả về ngay lập tức (kể cả khi Offline).
 * 3) Nếu chưa có -> tải từ mạng, lưu vào RUNTIME_CACHE rồi trả về.
 * @param {Request} request
 * @returns {Promise<Response>}
 */
async function cacheFirst(request) {
  const cached = await caches.match(request, { ignoreSearch: false });
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response && (response.ok || response.type === 'opaque')) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    // Fallback cuối cùng nếu có bản cache trùng đường dẫn không tính query
    const fallback = await caches.match(request, { ignoreSearch: true });
    if (fallback) return fallback;
    throw err;
  }
}

/**
 * Xử lý điều hướng SPA khi mở app từ màn hình chính lúc Offline.
 * @param {Request} request
 * @returns {Promise<Response>}
 */
async function handleNavigationRequest(request) {
  const cachedPage =
    (await caches.match(request)) ||
    (await caches.match('./index.html')) ||
    (await caches.match('./'));

  if (cachedPage) return cachedPage;

  try {
    const networkResponse = await fetch(request);
    const cache = await caches.open(STATIC_CACHE);
    cache.put('./index.html', networkResponse.clone());
    return networkResponse;
  } catch {
    return new Response(
      '<!doctype html><html lang="vi"><meta charset="utf-8"><title>Offline</title><body style="background:#1e1f24;color:#e4e6eb;font-family:sans-serif;display:grid;place-items:center;min-height:100vh;margin:0"><div><h1>Bạn đang Offline</h1><p>Vui lòng mở ứng dụng khi có mạng lần đầu để tải bộ đệm.</p></div></body></html>',
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
}
