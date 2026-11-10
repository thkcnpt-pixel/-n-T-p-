/* ==========================================================================
   js/app.js — Điểm khởi chạy ứng dụng (Entry Point)
   - Đăng ký Service Worker (PWA Offline-first).
   - Khởi tạo Router, UI modules (Smart Header, Swipe, Accordion, Settings,
     Confirm Dialog, Toast, Thanh trạng thái mạng).
   - Theo dõi trạng thái đăng nhập Firebase:
     + Khi đăng nhập qua Form -> gọi Audit Log (`ipify` -> `login_logs`).
     + Khi có phiên đăng nhập -> tải song song cài đặt (`users/{uid}`),
       đẩy hàng đợi offline (`localStorage` -> Firestore), lên lịch `autoClean`
       (> 365 ngày) và dựng Trang chủ theo luồng **Wizard 3 bước**:
       * Màn 1: Chọn môn (bấm 1 môn -> nếu môn có 2 nguồn thì sang Màn 2;
         nếu môn chỉ có "Đề trường" như Hóa, Sinh, GDQP thì auto-skip nhảy thẳng sang Màn 3).
       * Màn 2: Chọn nguồn đề ("Đề trường" hoặc "Đề ngoài" — đã xóa hoàn toàn "Gộp cả hai").
       * Màn 3: Chọn phần ôn (Phần 1: MCQ, Phần 2: Đúng/Sai, Phần 3: Trả lời ngắn)
         + Tùy chỉnh thời gian/chế độ xem + Nút CTA "Bắt đầu làm bài ngay".
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
  getQuestionBreakdown,
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
import { initSettingsModal, syncStep3InlineSettingsUI } from './ui/settings-modal.js';

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
      const step = getState('selection').wizardStep || 1;
      goToWizardStep(step);
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
  bindHomeWizardEvents();
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
  syncStep3InlineSettingsUI();

  // Đảm bảo danh sách môn đã được dựng trên Trang chủ
  if (!getState('subjects').length) {
    try {
      const subjects = await loadSubjects();
      renderSubjectCards(subjects);
    } catch (err) {
      console.warn('[app] Thử tải lại subjects lỗi:', err);
    }
  }

  // Luôn bắt đầu ở Bước 1 của Wizard khi mới đăng nhập vào Trang chủ
  patchState('selection', { wizardStep: 1 });
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
   TRANG CHỦ: LUỒNG WIZARD 3 BƯỚC & CHỌN PHẦN ÔN
   ========================================================================== */

function bindHomeWizardEvents() {
  // Nút Quay lại ở Màn hình 2 -> lùi về Màn hình 1
  document.getElementById('btn-back-step-2')?.addEventListener('click', () => {
    goToWizardStep(1);
  });

  // Nút Quay lại ở Màn hình 3:
  // Nếu môn đang chọn chỉ có 1 nguồn ("Đề trường" -> đã auto-skip Màn 2), lùi thẳng về Màn 1.
  // Ngược lại (Toán, Lý, Tin có 2 nguồn), lùi về Màn 2.
  document.getElementById('btn-back-step-3')?.addEventListener('click', () => {
    const subj = getSubjectById(getState('selection').subjectId);
    const hasMultipleSources = subj && Array.isArray(subj.sources) && subj.sources.length > 1;
    goToWizardStep(hasMultipleSources ? 2 : 1);
  });

  // Màn hình 2: Bấm vào 1 nút nguồn đề ("Đề trường" hoặc "Đề ngoài") -> tự chuyển sang Màn hình 3
  document.querySelectorAll('[data-source-btn]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const src = /** @type {HTMLElement} */ (btn).dataset.sourceBtn;
      const validSource = src === SOURCES.NGOAI ? SOURCES.NGOAI : SOURCES.TRUONG;
      patchState('selection', { source: validSource });
      goToWizardStep(3);
    });
  });

  // Màn hình 3: Checkbox chọn Phần ôn (Phần 1, Phần 2, Phần 3)
  document.querySelectorAll('input[name="quizPart"]').forEach((chk) => {
    chk.addEventListener('change', () => {
      syncSelectedPartsFromDOM();
      updateStep3BreakdownAndPreview();
    });
  });

  // Nút "Chọn tất cả" các phần ôn ở Màn hình 3
  document.getElementById('btn-select-all-parts')?.addEventListener('click', () => {
    document.querySelectorAll('input[name="quizPart"]').forEach((chk) => {
      /** @type {HTMLInputElement} */ (chk).checked = true;
    });
    syncSelectedPartsFromDOM();
    updateStep3BreakdownAndPreview();
  });

  // Nút CTA "Bắt đầu làm bài ngay" ở cuối Màn hình 3
  const startBtn = /** @type {HTMLButtonElement} */ (document.getElementById('btn-start'));
  startBtn?.addEventListener('click', async () => {
    const { subjectId, source, parts } = getState('selection');
    const subject = getSubjectById(subjectId);
    if (!subject) {
      showToast('Vui lòng chọn một môn học.', 'warning');
      goToWizardStep(1);
      return;
    }

    if (!parts || parts.length === 0) {
      showToast('Vui lòng chọn ít nhất 1 phần ôn tập.', 'warning');
      return;
    }

    startBtn.disabled = true;
    try {
      const questions = await loadQuestions(subjectId, source, parts);
      if (!questions.length) {
        showToast('Không có câu hỏi nào khớp với phần ôn bạn đã chọn.', 'warning');
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
      updateStep3BreakdownAndPreview();
    }
  });
}

function syncSelectedPartsFromDOM() {
  const selected = [];
  document.querySelectorAll('input[name="quizPart"]').forEach((el) => {
    const input = /** @type {HTMLInputElement} */ (el);
    if (input.checked) selected.push(Number(input.value));
  });
  patchState('selection', { parts: selected });
}

/**
 * Render danh sách 6 môn học ở Màn hình 1 của Wizard.
 * Khi bấm vào 1 môn:
 * - Nếu môn có cả "Đề trường" và "Đề ngoài" (Toán, Vật lý, Tin học) -> chuyển sang Màn hình 2.
 * - Nếu môn chỉ có "Đề trường" (Hóa học, Sinh học, GDQP) -> auto-skip Màn hình 2,
 *   tự gán `source: 'truong'` và nhảy thẳng sang Màn hình 3!
 * @param {Array<{id: string, name: string, icon: string, sources: string[]}>} subjects
 */
function renderSubjectCards(subjects) {
  const wrap = document.getElementById('subject-list');
  const tpl = /** @type {HTMLTemplateElement} */ (document.getElementById('tpl-subject'));
  if (!wrap || !tpl) return;

  wrap.innerHTML = '';
  const frag = document.createDocumentFragment();

  subjects.forEach((subj) => {
    const card = /** @type {HTMLButtonElement} */ (tpl.content.firstElementChild.cloneNode(true));
    const iconEl = card.querySelector('.subject-card__icon');
    const nameEl = card.querySelector('.subject-card__name');
    const metaEl = card.querySelector('.subject-card__meta');

    card.dataset.subjectId = subj.id;
    iconEl.textContent = subj.icon;
    nameEl.textContent = subj.name;
    if (metaEl) {
      metaEl.textContent = subj.sources.length > 1 ? 'Đề trường · Đề ngoài' : 'Đề trường';
    }

    card.addEventListener('click', () => {
      handleSubjectPick(subj);
    });

    frag.appendChild(card);
  });

  wrap.appendChild(frag);
}

/**
 * Xử lý khi học sinh bấm chọn 1 môn ở Màn hình 1.
 * @param {{id: string, name: string, icon: string, sources: string[]}} subj
 */
function handleSubjectPick(subj) {
  // Đánh dấu thẻ môn đang chọn
  document.querySelectorAll('.subject-card').forEach((el) => {
    el.classList.toggle('is-selected', /** @type {HTMLElement} */ (el).dataset.subjectId === subj.id);
  });

  const hasMultipleSources = Array.isArray(subj.sources) && subj.sources.length > 1;
  if (hasMultipleSources) {
    // Toán, Vật lý, Tin học -> sang Màn hình 2 để chọn "Đề trường" hoặc "Đề ngoài"
    patchState('selection', { subjectId: subj.id });
    goToWizardStep(2);
  } else {
    // Hóa học, Sinh học, GDQP -> chỉ có "Đề trường", auto-skip Màn hình 2 nhảy thẳng sang Màn hình 3
    patchState('selection', { subjectId: subj.id, source: SOURCES.TRUONG });
    goToWizardStep(3);
  }
}

/**
 * Chuyển đổi mượt mà giữa 3 màn hình con trong Wizard Trang chủ (không tải lại trang).
 * @param {1|2|3} step
 */
export function goToWizardStep(step) {
  const selection = getState('selection');
  const subject = getSubjectById(selection.subjectId);

  // Nếu chưa chọn môn mà đòi vào bước 2 hoặc 3 -> đưa về bước 1
  const targetStep = !subject && step > 1 ? 1 : step;
  patchState('selection', { wizardStep: targetStep });

  // Ẩn/hiện 3 khung wizard-pane
  for (let i = 1; i <= 3; i += 1) {
    const pane = document.getElementById(`wizard-step-${i}`);
    if (pane) pane.hidden = i !== targetStep;
  }

  // Cập nhật thanh chỉ báo tiến trình Wizard (1 - 2 - 3)
  document.querySelectorAll('[data-step-indicator]').forEach((el) => {
    const s = Number(/** @type {HTMLElement} */ (el).dataset.stepIndicator);
    el.classList.toggle('is-active', s === targetStep);
    el.classList.toggle('is-done', s < targetStep);
  });

  if (targetStep === 2 && subject) {
    populateStep2Sources(subject);
  } else if (targetStep === 3 && subject) {
    populateStep3Config(subject);
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Cập nhật giao diện Màn hình 2 (Chọn nguồn đề: chỉ Đề trường / Đề ngoài).
 * @param {{id: string, name: string, icon: string, sources: string[]}} subject
 */
async function populateStep2Sources(subject) {
  const badgeEl = document.getElementById('step2-subject-badge');
  if (badgeEl) badgeEl.textContent = `${subject.icon} ${subject.name}`;

  // Ẩn/hiện nút nguồn đề tùy theo cấu hình môn học
  document.querySelectorAll('[data-source-btn]').forEach((btn) => {
    const src = /** @type {HTMLElement} */ (btn).dataset.sourceBtn;
    /** @type {HTMLElement} */ (btn).hidden = !subject.sources.includes(src);
  });

  // Hiển thị số câu hỏi của từng nguồn đề
  const truongInfo = document.getElementById('source-count-truong');
  const ngoaiInfo = document.getElementById('source-count-ngoai');

  const [cTruong, cNgoai] = await Promise.all([
    countQuestions(subject.id, SOURCES.TRUONG),
    subject.sources.includes(SOURCES.NGOAI)
      ? countQuestions(subject.id, SOURCES.NGOAI)
      : Promise.resolve(null),
  ]);

  if (truongInfo) {
    truongInfo.textContent = cTruong !== null
      ? `Đề cương chính khóa · Hiện có ${cTruong} câu`
      : 'Đề cương & ngân hàng câu hỏi chính khóa';
  }
  if (ngoaiInfo) {
    ngoaiInfo.textContent = cNgoai !== null
      ? (cNgoai > 0 ? `Đề mở rộng · Hiện có ${cNgoai} câu` : 'Đề mở rộng · Chưa có câu hỏi (0 câu)')
      : 'Đề sưu tầm & luyện tập mở rộng';
  }
}

/**
 * Cập nhật giao diện Màn hình 3 (Chọn phần ôn + Tùy chỉnh + Nút Bắt đầu làm bài).
 * @param {{id: string, name: string, icon: string, sources: string[]}} subject
 */
async function populateStep3Config(subject) {
  const { source } = getState('selection');
  const subjBadge = document.getElementById('step3-subject-badge');
  const srcBadge = document.getElementById('step3-source-badge');
  const backBtn = document.getElementById('btn-back-step-3');

  if (subjBadge) subjBadge.textContent = `${subject.icon} ${subject.name}`;
  if (srcBadge) srcBadge.textContent = SOURCE_LABELS[source] || 'Đề trường';
  if (backBtn) {
    backBtn.textContent = subject.sources.length > 1
      ? '← Quay lại chọn nguồn đề'
      : '← Quay lại chọn môn';
  }

  syncStep3InlineSettingsUI();
  await updateStep3BreakdownAndPreview();
}

/**
 * Tính toán số câu hỏi của từng Phần (Phần 1, Phần 2, Phần 3) và tổng số câu
 * sẽ có trong đề dựa trên các Checkbox phần ôn đang được tích chọn.
 */
async function updateStep3BreakdownAndPreview() {
  const infoEl = document.getElementById('question-count-info');
  const startBtn = /** @type {HTMLButtonElement} */ (document.getElementById('btn-start'));
  const { subjectId, source, parts } = getState('selection');
  const subject = getSubjectById(subjectId);

  if (!subject) {
    if (infoEl) infoEl.textContent = 'Hãy chọn một môn học.';
    if (startBtn) startBtn.disabled = true;
    return;
  }

  const breakdown = await getQuestionBreakdown(subjectId, source);
  const srcLabel = SOURCE_LABELS[source] || 'Đề trường';

  if (!breakdown) {
    if (infoEl) infoEl.textContent = `Không đọc được dữ liệu ${subject.name} (${srcLabel}).`;
    if (startBtn) startBtn.disabled = true;
    return;
  }

  // Cập nhật badge số câu trên từng dòng Phần 1, Phần 2, Phần 3
  for (const p of [1, 2, 3]) {
    const badge = document.getElementById(`part-count-${p}`);
    if (badge) badge.textContent = `${breakdown.byPart[p] || 0} câu`;
  }

  if (breakdown.total === 0) {
    if (infoEl) {
      infoEl.textContent = `${subject.name} · ${srcLabel}: Nguồn đề này hiện chưa có câu hỏi nào (0 câu). Bạn có thể quay lại chọn "Đề trường".`;
    }
    if (startBtn) startBtn.disabled = true;
    return;
  }

  // Đếm tổng số câu thuộc các phần được chọn
  const selectedParts = Array.isArray(parts) ? parts : [];
  if (selectedParts.length === 0) {
    if (infoEl) infoEl.textContent = 'Vui lòng tích chọn ít nhất 1 phần ôn tập ở trên.';
    if (startBtn) startBtn.disabled = true;
    return;
  }

  const matchedCount = selectedParts.reduce((sum, p) => sum + (breakdown.byPart[p] || 0), 0);

  if (matchedCount === 0) {
    if (infoEl) infoEl.textContent = 'Các phần bạn chọn hiện chưa có câu hỏi nào.';
    if (startBtn) startBtn.disabled = true;
  } else {
    if (infoEl) {
      infoEl.textContent = `Sẵn sàng: ${matchedCount} câu hỏi (${subject.name} · ${srcLabel} · Phần ${selectedParts.join(', ')}).`;
    }
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
