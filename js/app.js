/* ==========================================================================
   js/app.js — Điểm khởi chạy ứng dụng (Entry Point)
   - Đăng ký Service Worker (PWA Offline-first).
   - Khởi tạo Router, UI modules (Smart Header, Swipe, Accordion, Settings,
     Confirm Dialog, Toast, Thanh trạng thái mạng).
   - Theo dõi trạng thái đăng nhập Firebase:
     + Khi đăng nhập qua Form -> gọi Audit Log (`ipify` -> `login_logs`).
     + Khi có phiên đăng nhập -> tải song song cài đặt (`users/{uid}`),
       đẩy hàng đợi offline (`localStorage` -> Firestore), lên lịch `autoClean`
       (> 365 ngày) và dựng Trang chủ (chọn môn + chọn nguồn đề).
   Dev by Thkc
   ========================================================================== */

import {
  getState,
  setState,
  patchState,
  subscribe,
  resetSession,
  SOURCES,
  SOURCE_LABELS,
} from './core/state.js';

import {
  initRouter,
  onScreen,
  navigate,
  setAccessControl,
  currentScreen,
} from './core/router.js';

import { login, logout, watchAuth } from './services/auth.service.js';
import { logLogin } from './services/audit.service.js';
import { loadUserProfile, touchLastLogin } from './services/profile.service.js';
import { fetchRecentHistory, scheduleAutoClean } from './services/history.service.js';
import {
  initOfflineSync,
  flushQueue,
  refreshPendingCount,
} from './services/offline.service.js';
import {
  loadSubjects,
  loadQuestions,
  countQuestions,
  getSubjectById,
} from './services/data.service.js';

import {
  initQuizController,
  startQuiz,
  cleanupQuizScreen,
  nextQuestion,
  prevQuestion,
  updateResultSyncBadge,
} from './quiz/controller.js';

import { initSmartHeader, resetSmartHeader } from './ui/smart-header.js';
import { initSwipeGesture } from './ui/swipe.js';
import { initAccordion } from './ui/accordion.js';
import { initSettingsModal } from './ui/settings-modal.js';

/** Đánh dấu người dùng vừa bấm nút Đăng nhập (để chỉ ghi Audit Log đúng thời điểm này) */
let explicitLoginPending = false;

/* ==========================================================================
   KHỞI ĐỘNG ỨNG DỤNG
   ========================================================================== */

function bootstrap() {
  registerServiceWorker();

  // 1) Khởi tạo Router & quyền truy cập màn hình
  initRouter();
  setAccessControl((target) => {
    const user = getState('user');
    if (!user && target !== 'login') return 'login';
    if (user && target === 'login') return 'home';
    return true;
  });

  onScreen('home', {
    enter: () => {
      refreshHomeHistory();
      updateQuestionCountPreview();
    },
  });

  onScreen('quiz', {
    enter: () => resetSmartHeader(),
    leave: () => cleanupQuizScreen(),
  });

  // 2) Khởi tạo các module UI & Offline
  initOfflineSync();
  initSmartHeader();
  initAccordion();
  initSettingsModal({ toast: showToast });
  initQuizController({ confirm: showConfirm, toast: showToast });
  initSwipeGesture(document.getElementById('quiz-container'), {
    onSwipeLeft: () => nextQuestion(),
    onSwipeRight: () => prevQuestion(),
  });

  bindAuthEvents();
  bindHomeEvents();
  bindNetworkIndicators();

  // 3) Tải sẵn danh sách môn học (từ cache SW hoặc mạng)
  loadSubjects()
    .then((subjects) => renderSubjectCards(subjects))
    .catch((err) => console.error('[app] Không tải được danh sách môn:', err));

  // 4) Lắng nghe trạng thái xác thực Firebase
  watchAuth(handleAuthStateChange);
}

/* ==========================================================================
   SERVICE WORKER (PWA)
   ========================================================================== */

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./service-worker.js')
      .catch((err) => console.warn('[pwa] Không đăng ký được Service Worker:', err));
  });
}

/* ==========================================================================
   XÁC THỰC & ĐỒNG BỘ KHI ĐĂNG NHẬP
   ========================================================================== */

async function handleAuthStateChange(fbUser) {
  const loader = document.getElementById('app-loader');

  if (!fbUser) {
    explicitLoginPending = false;
    resetSession();
    await navigate('login', { replace: true, force: true });
    hideLoader(loader);
    return;
  }

  const user = { uid: fbUser.uid, email: fbUser.email || '' };
  setState('user', user);

  const emailEl = document.getElementById('user-email');
  if (emailEl) emailEl.textContent = user.email || 'Học sinh';

  // Nếu vừa đăng nhập qua form -> đẩy Audit Log (IP + User-Agent + Timestamp)
  if (explicitLoginPending) {
    explicitLoginPending = false;
    logLogin(user);
  }
  touchLastLogin(user);

  // Tải cài đặt của user + cập nhật số bài chờ đồng bộ
  refreshPendingCount();
  await loadUserProfile(user);

  // Đảm bảo danh sách môn đã được dựng trên Trang chủ
  if (!getState('subjects').length) {
    try {
      const subjects = await loadSubjects();
      renderSubjectCards(subjects);
    } catch (err) {
      console.warn('[app] Thử tải lại subjects lỗi:', err);
    }
  }

  // Chuyển vào Trang chủ
  if (!currentScreen() || currentScreen() === 'login') {
    await navigate('home', { replace: true, force: true });
  }
  hideLoader(loader);

  // Chạy ngầm: đẩy hàng đợi offline & dọn lịch sử cũ hơn 365 ngày
  flushQueue().then(({ synced }) => {
    if (synced > 0) refreshHomeHistory();
  });
  scheduleAutoClean();
}

function hideLoader(loader) {
  if (!loader || loader.classList.contains('is-done')) return;
  loader.classList.add('is-done');
  loader.setAttribute('aria-hidden', 'true');
}

function bindAuthEvents() {
  const form = /** @type {HTMLFormElement} */ (document.getElementById('login-form'));
  const emailInput = /** @type {HTMLInputElement} */ (document.getElementById('login-email'));
  const passInput = /** @type {HTMLInputElement} */ (document.getElementById('login-password'));
  const togglePassBtn = /** @type {HTMLButtonElement} */ (document.getElementById('btn-toggle-password'));
  const errorEl = /** @type {HTMLElement} */ (document.getElementById('login-error'));
  const loginBtn = /** @type {HTMLButtonElement} */ (document.getElementById('btn-login'));
  const logoutBtn = /** @type {HTMLButtonElement} */ (document.getElementById('btn-logout'));

  // Ẩn/hiện mật khẩu
  togglePassBtn?.addEventListener('click', () => {
    const isPassword = passInput.type === 'password';
    passInput.type = isPassword ? 'text' : 'password';
    togglePassBtn.setAttribute('aria-pressed', isPassword ? 'true' : 'false');
    togglePassBtn.setAttribute('aria-label', isPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu');
  });

  // Submit form Đăng nhập
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (errorEl) errorEl.hidden = true;
    emailInput?.removeAttribute('aria-invalid');
    passInput?.removeAttribute('aria-invalid');

    loginBtn?.classList.add('is-loading');
    explicitLoginPending = true;

    try {
      await login(emailInput.value, passInput.value);
      form.reset();
    } catch (err) {
      explicitLoginPending = false;
      if (errorEl) {
        errorEl.textContent = err.message || 'Đăng nhập thất bại.';
        errorEl.hidden = false;
      }
      if (err.code === 'auth/invalid-email') {
        emailInput?.setAttribute('aria-invalid', 'true');
        emailInput?.focus();
      } else {
        passInput?.setAttribute('aria-invalid', 'true');
        passInput?.focus();
      }
    } finally {
      loginBtn?.classList.remove('is-loading');
    }
  });

  // Đăng xuất
  logoutBtn?.addEventListener('click', async () => {
    const pending = getState('pendingCount');
    const msg = pending > 0
      ? `Bạn đang có ${pending} mục chờ đồng bộ. Dữ liệu vẫn được giữ an toàn trên máy và sẽ đồng bộ khi bạn đăng nhập lại. Bạn muốn đăng xuất?`
      : 'Bạn có chắc chắn muốn đăng xuất khỏi tài khoản?';

    const ok = await showConfirm({
      title: 'Đăng xuất',
      message: msg,
      okText: 'Đăng xuất',
    });
    if (!ok) return;

    try {
      await logout();
      showToast('Đã đăng xuất.', 'info');
    } catch (err) {
      showToast('Không thể đăng xuất. Vui lòng thử lại.', 'error');
    }
  });
}

/* ==========================================================================
   TRANG CHỦ: CHỌN MÔN, CHỌN NGUỒN ĐỀ & LỊCH SỬ
   ========================================================================== */

function bindHomeEvents() {
  // Chọn nguồn đề: truong | ngoai | all
  document.querySelectorAll('input[name="source"]').forEach((radio) => {
    radio.addEventListener('change', (e) => {
      const val = /** @type {HTMLInputElement} */ (e.target).value;
      patchState('selection', { source: val });
      updateQuestionCountPreview();
    });
  });

  // Nút Bắt đầu làm bài
  const startBtn = /** @type {HTMLButtonElement} */ (document.getElementById('btn-start'));
  startBtn?.addEventListener('click', async () => {
    const { subjectId, source } = getState('selection');
    const subject = getSubjectById(subjectId);
    if (!subject) {
      showToast('Vui lòng chọn một môn học.', 'warning');
      return;
    }

    startBtn.disabled = true;
    try {
      const questions = await loadQuestions(subjectId, source);
      if (!questions.length) {
        showToast('Nguồn đề này hiện chưa có câu hỏi nào.', 'warning');
        return;
      }
      await startQuiz({
        subjectId: subject.id,
        subjectName: subject.name,
        source,
        questions,
        isRetry: false,
      });
    } catch (err) {
      console.error('[app] Lỗi tải đề:', err);
      showToast('Không tải được bộ câu hỏi. Vui lòng kiểm tra kết nối.', 'error');
    } finally {
      updateQuestionCountPreview();
    }
  });
}

function renderSubjectCards(subjects) {
  const wrap = document.getElementById('subject-list');
  const tpl = /** @type {HTMLTemplateElement} */ (document.getElementById('tpl-subject'));
  if (!wrap || !tpl) return;

  wrap.innerHTML = '';
  const frag = document.createDocumentFragment();
  const currentSubjectId = getState('selection').subjectId || subjects[0]?.id || null;

  subjects.forEach((subj) => {
    const card = /** @type {HTMLElement} */ (tpl.content.firstElementChild.cloneNode(true));
    const input = /** @type {HTMLInputElement} */ (card.querySelector('.subject-card__input'));
    const iconEl = card.querySelector('.subject-card__icon');
    const nameEl = card.querySelector('.subject-card__name');

    input.value = subj.id;
    input.checked = subj.id === currentSubjectId;
    iconEl.textContent = subj.icon;
    nameEl.textContent = subj.name;

    input.addEventListener('change', () => {
      if (input.checked) {
        patchState('selection', { subjectId: subj.id });
        updateQuestionCountPreview();
      }
    });

    frag.appendChild(card);
  });

  wrap.appendChild(frag);

  if (currentSubjectId) {
    patchState('selection', { subjectId: currentSubjectId });
    updateQuestionCountPreview();
  }
}

async function updateQuestionCountPreview() {
  const infoEl = document.getElementById('question-count-info');
  const startBtn = /** @type {HTMLButtonElement} */ (document.getElementById('btn-start'));
  const { subjectId, source } = getState('selection');
  const subject = getSubjectById(subjectId);

  if (!subject) {
    if (infoEl) infoEl.textContent = 'Hãy chọn một môn học.';
    if (startBtn) startBtn.disabled = true;
    return;
  }

  const count = await countQuestions(subjectId, source);
  const srcLabel = SOURCE_LABELS[source] || source;

  if (count === null) {
    if (infoEl) infoEl.textContent = `Không đọc được dữ liệu ${subject.name} (${srcLabel}).`;
    if (startBtn) startBtn.disabled = true;
  } else if (count === 0) {
    if (infoEl) {
      infoEl.textContent = source === SOURCES.NGOAI
        ? `${subject.name} · ${srcLabel}: Chưa có câu hỏi (file dự phòng trống). Hãy chọn "Đề trường" hoặc "Gộp cả hai".`
        : `${subject.name} · ${srcLabel}: Hiện có 0 câu hỏi.`;
    }
    if (startBtn) startBtn.disabled = true;
  } else {
    if (infoEl) infoEl.textContent = `Sẵn sàng: ${count} câu hỏi (${subject.name} · ${srcLabel}).`;
    if (startBtn) startBtn.disabled = false;
  }
}

async function refreshHomeHistory() {
  const listEl = document.getElementById('history-list');
  const tpl = /** @type {HTMLTemplateElement} */ (document.getElementById('tpl-history-item'));
  if (!listEl || !tpl || !getState('user')) return;

  const records = await fetchRecentHistory(5);
  listEl.innerHTML = '';

  if (!records.length) {
    const empty = document.createElement('li');
    empty.className = 'muted small';
    empty.textContent = 'Chưa có lịch sử làm bài.';
    listEl.appendChild(empty);
    return;
  }

  const frag = document.createDocumentFragment();
  records.forEach((rec) => {
    const li = /** @type {HTMLElement} */ (tpl.content.firstElementChild.cloneNode(true));
    const subjEl = li.querySelector('.history-item__subject');
    const dateEl = li.querySelector('.history-item__date');
    const scoreEl = li.querySelector('.history-item__score');

    const srcLabel = SOURCE_LABELS[rec.source] || '';
    subjEl.textContent = `${rec.subjectName || rec.subjectId}${srcLabel ? ` · ${srcLabel}` : ''}`;
    dateEl.textContent = formatDateTime(rec.createdAt);
    scoreEl.textContent = `${rec.score} đ (${rec.correct}/${rec.total})`;

    if (rec.pending) {
      li.classList.add('is-pending');
      li.title = 'Đang chờ đồng bộ lên đám mây';
    }
    frag.appendChild(li);
  });

  listEl.appendChild(frag);
}

function formatDateTime(epochMs) {
  if (!epochMs) return '';
  try {
    return new Intl.DateTimeFormat('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(epochMs));
  } catch {
    return new Date(epochMs).toLocaleString('vi-VN');
  }
}

/* ==========================================================================
   THANH TRẠNG THÁI MẠNG & ĐỒNG BỘ OFFLINE
   ========================================================================== */

function bindNetworkIndicators() {
  const netBar = document.getElementById('net-status');
  const netText = document.getElementById('net-status-text');
  const pendingBadge = document.getElementById('pending-badge');
  let hideTimer = null;

  subscribe('online', (online) => {
    if (!netBar || !netText) return;
    clearTimeout(hideTimer);

    if (!online) {
      netBar.classList.remove('is-online');
      netText.textContent = 'Bạn đang offline — bài làm sẽ được lưu vào máy';
      netBar.hidden = false;
    } else {
      netBar.classList.add('is-online');
      netText.textContent = 'Đã kết nối mạng trở lại';
      netBar.hidden = false;
      hideTimer = setTimeout(() => { netBar.hidden = true; }, 2800);
    }
  });

  subscribe('pendingCount', (count) => {
    if (!pendingBadge) return;
    if (count > 0) {
      pendingBadge.textContent = `${count} chờ đồng bộ`;
      pendingBadge.hidden = false;
    } else {
      pendingBadge.hidden = true;
    }
  });

  // Khi offline.service đẩy xong dữ liệu lên Firebase
  window.addEventListener('thkc:synced', (e) => {
    const synced = e.detail?.synced || 0;
    showToast(`Đã đồng bộ ${synced} mục lên đám mây.`, 'success');
    if (currentScreen() === 'home') refreshHomeHistory();
    if (currentScreen() === 'result') updateResultSyncBadge('synced');
  });
}

/* ==========================================================================
   HỘP THOẠI XÁC NHẬN & TOAST THÔNG BÁO
   ========================================================================== */

/**
 * Hiển thị hộp thoại `<dialog id="confirm-dialog">`.
 * @param {{title?: string, message: string, okText?: string}} opts
 * @returns {Promise<boolean>}
 */
export function showConfirm({ title = 'Xác nhận', message = '', okText = 'Đồng ý' } = {}) {
  const dialog = /** @type {HTMLDialogElement} */ (document.getElementById('confirm-dialog'));
  const titleEl = document.getElementById('confirm-title');
  const msgEl = document.getElementById('confirm-message');
  const okBtn = document.getElementById('confirm-ok');

  if (!dialog || typeof dialog.showModal !== 'function') {
    return Promise.resolve(window.confirm(message));
  }

  if (titleEl) titleEl.textContent = title;
  if (msgEl) msgEl.textContent = message;
  if (okBtn) okBtn.textContent = okText;

  return new Promise((resolve) => {
    const handleClose = () => {
      dialog.removeEventListener('close', handleClose);
      resolve(dialog.returnValue === 'ok');
    };
    dialog.addEventListener('close', handleClose);
    dialog.showModal();
  });
}

/**
 * Hiển thị thông báo nhỏ (toast) tự đóng sau 3.2 giây.
 * @param {string} message
 * @param {'info'|'success'|'warning'|'error'} [type='info']
 */
export function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container || !message) return;

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('is-leaving');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
    setTimeout(() => toast.remove(), 400);
  }, 3200);
}

/* Khởi chạy */
bootstrap();
