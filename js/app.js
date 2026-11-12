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
       * Màn 1 (`1`): Chọn môn (6 môn: Toán, Lý, Tin, Hóa, Sinh, GDQP).
         - Ngoại lệ 1 (Sinh, Hóa, GDQP): chỉ có "Đề trường" -> auto-skip Màn 2, nhảy thẳng tới Màn 3.
         - Toán, Lý, Tin: chuyển sang Màn 2.
       * Màn 2 (`2`): Chọn nguồn đề ("Đề trường" hoặc "Đề ngoài").
         - Ngoại lệ 2 (Lý, Tin hoặc Toán > Đề trường): chuyển thẳng sang Màn 3.
         - Phân nhánh sâu (**Toán > Đề ngoài**): BẮT BUỘC chuyển sang Màn hình trung gian (`2b`).
       * Màn trung gian (`2b` — Toán > Đề ngoài):
         - Luôn hiển thị 2 danh mục **"Tổng hợp"** và **"Xác suất"** (kể cả khi chưa load được câu hỏi).
         - Bấm vào danh mục xổ ra các bài nhỏ (Bài 1, Bài 2...). Chọn bài nhỏ xong mới qua Màn 3.
       * Màn 3 (`3`): Chọn phần ôn (Phần 1, 2, 3) + Tùy chỉnh thời gian/cách cuộn + Nút "Bắt đầu làm bài".
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
  requiresCategoryStep,
  loadNestedCategories,
  DEFAULT_TOAN_NGOAI_CATEGORIES,
  DEFAULT_TINHOC_NGOAI_CATEGORIES,
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

  // Dựng sẵn giao diện mặc định cho Bước 2b (Tổng hợp / Xác suất) ngay khi khởi tạo
  renderCategoryAccordionList(DEFAULT_TOAN_NGOAI_CATEGORIES);

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
   TRANG CHỦ: LUỒNG WIZARD (1 -> 2 -> 2b -> 3) & CHỌN PHẦN ÔN
   ========================================================================== */

function bindHomeWizardEvents() {
  // Nút Quay lại ở Màn hình 2 -> lùi về Màn hình 1
  document.getElementById('btn-back-step-2')?.addEventListener('click', () => {
    goToWizardStep(1);
  });

  // Nút Quay lại ở Màn hình 2b (Toán > Đề ngoài) -> lùi về Màn hình 2 (Chọn nguồn đề)
  document.getElementById('btn-back-step-2b')?.addEventListener('click', () => {
    goToWizardStep(2);
  });

  // Nút Quay lại ở Màn hình 3:
  // - Nếu đang ở Toán > Đề ngoài -> lùi về Màn hình 2b (Chọn chuyên đề Tổng hợp / Xác suất).
  // - Nếu môn có 2 nguồn (Lý, Tin, hoặc Toán > Đề trường) -> lùi về Màn hình 2.
  // - Nếu môn chỉ có 1 nguồn (Sinh, Hóa, GDQP đã auto-skip Màn 2) -> lùi thẳng về Màn hình 1.
  document.getElementById('btn-back-step-3')?.addEventListener('click', () => {
    const { subjectId, source } = getState('selection');
    if (requiresCategoryStep(subjectId, source)) {
      goToWizardStep('2b');
      return;
    }
    const subj = getSubjectById(subjectId);
    const hasMultipleSources = subj && Array.isArray(subj.sources) && subj.sources.length > 1;
    goToWizardStep(hasMultipleSources ? 2 : 1);
  });

  // Màn hình 2: Bấm vào 1 nút nguồn đề ("Đề trường" hoặc "Đề ngoài")
  document.querySelectorAll('[data-source-btn]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const src = /** @type {HTMLElement} */ (btn).dataset.sourceBtn;
      const validSource = src === SOURCES.NGOAI ? SOURCES.NGOAI : SOURCES.TRUONG;
      const { subjectId } = getState('selection');

      patchState('selection', {
        source: validSource,
        categoryId: null,
        categoryName: null,
        chapterId: null,
        chapterName: null,
        lessonId: null,
        lessonName: null,
      });

      // Nếu chọn Toán > Đề ngoài -> BẮT BUỘC chuyển sang Màn hình trung gian 2b (Tổng hợp / Xác suất)
      if (requiresCategoryStep(subjectId, validSource)) {
        goToWizardStep('2b');
      } else {
        goToWizardStep(3);
      }
    });
  });

  // Màn hình 2b: Sự kiện đóng/mở danh mục Chuyên đề, Chương & chọn Bài nhỏ (delegation trên #category-accordion-list)
  const catListEl = document.getElementById('category-accordion-list');
  catListEl?.addEventListener('click', (e) => {
    const target = /** @type {HTMLElement|null} */ (e.target);
    if (!target) return;

    // 1) Bấm vào nút Bài nhỏ (VD: Bài 01, Bài 02) -> lưu lựa chọn và qua Màn hình 3
    const lessonBtn = target.closest('.lesson-btn');
    if (lessonBtn) {
      const catId = lessonBtn.getAttribute('data-category-id');
      const catName = lessonBtn.getAttribute('data-category-name');
      const chId = lessonBtn.getAttribute('data-chapter-id') || null;
      const chName = lessonBtn.getAttribute('data-chapter-name') || null;
      const lesId = lessonBtn.getAttribute('data-lesson-id');
      const lesName = lessonBtn.getAttribute('data-lesson-name');

      patchState('selection', {
        categoryId: catId,
        categoryName: catName,
        chapterId: chId,
        chapterName: chName,
        lessonId: lesId,
        lessonName: lesName,
      });
      goToWizardStep(3);
      return;
    }

    // 2) Bấm vào thanh tiêu đề Chương (VD: Chương 6) -> xổ danh sách bài nhỏ trong chương đó
    const chapterHeaderBtn = target.closest('.chapter-item__header');
    if (chapterHeaderBtn) {
      const chEl = chapterHeaderBtn.closest('.chapter-item');
      if (!chEl) return;
      const isOpen = chEl.classList.toggle('is-open');
      chapterHeaderBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      return;
    }

    // 3) Bấm vào thanh tiêu đề Chuyên đề ("Tổng hợp" / "Xác suất") -> xổ danh sách Chương hoặc Bài nhỏ
    const headerBtn = target.closest('.category-item__header');
    if (headerBtn) {
      const itemEl = headerBtn.closest('.category-item');
      if (!itemEl) return;
      const isOpen = itemEl.classList.toggle('is-open');
      headerBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    }
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
    const { subjectId, source, categoryId, chapterId, lessonId, lessonName, parts } = getState('selection');
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
      const questions = await loadQuestions(subjectId, source, {
        parts,
        categoryId,
        chapterId,
        lessonId,
      });
      if (!questions.length) {
        showToast('Không có câu hỏi nào khớp với phần ôn bạn đã chọn.', 'warning');
        return;
      }
      const displaySubjectName = lessonName
        ? `${subject.name} · ${lessonName}`
        : subject.name;

      await startQuiz({
        subjectId: subject.id,
        subjectName: displaySubjectName,
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
      metaEl.textContent = subj.sources.length > 1 ? 'Đề trường · Đề ngoài' : 'Chỉ có Đề trường';
    }

    card.addEventListener('click', () => {
      handleSubjectPick(subj);
    });

    frag.appendChild(card);
  });

  wrap.appendChild(frag);
}

/**
 * Xử lý khi học sinh bấm chọn 1 môn ở Màn hình 1:
 * - Ngoại lệ 1 (Sinh, Hóa, GDQP): chỉ có "Đề trường" -> auto-skip Màn 2, nhảy thẳng tới Màn 3.
 * - Toán, Lý, Tin: có "Đề trường" và "Đề ngoài" -> chuyển sang Màn 2.
 * @param {{id: string, name: string, icon: string, sources: string[]}} subj
 */
function handleSubjectPick(subj) {
  document.querySelectorAll('.subject-card').forEach((el) => {
    el.classList.toggle('is-selected', /** @type {HTMLElement} */ (el).dataset.subjectId === subj.id);
  });

  const hasMultipleSources = Array.isArray(subj.sources) && subj.sources.length > 1;
  if (hasMultipleSources) {
    patchState('selection', {
      subjectId: subj.id,
      categoryId: null,
      categoryName: null,
      chapterId: null,
      chapterName: null,
      lessonId: null,
      lessonName: null,
    });
    goToWizardStep(2);
  } else {
    patchState('selection', {
      subjectId: subj.id,
      source: SOURCES.TRUONG,
      categoryId: null,
      categoryName: null,
      chapterId: null,
      chapterName: null,
      lessonId: null,
      lessonName: null,
    });
    goToWizardStep(3);
  }
}

/**
 * Chuyển đổi mượt mà giữa các màn hình con trong Wizard Trang chủ (`1`, `2`, `'2b'`, `3`).
 * @param {1|2|'2b'|3} step
 */
export function goToWizardStep(step) {
  const selection = getState('selection');
  const subject = getSubjectById(selection.subjectId);

  // Nếu chưa chọn môn mà đòi vào bước sau -> đưa về bước 1
  const targetStep = !subject && step !== 1 ? 1 : step;
  patchState('selection', { wizardStep: targetStep });

  // Ẩn/hiện các khung wizard-pane (1, 2, 2b, 3)
  const panes = [
    { id: 'wizard-step-1', key: 1 },
    { id: 'wizard-step-2', key: 2 },
    { id: 'wizard-step-2b', key: '2b' },
    { id: 'wizard-step-3', key: 3 },
  ];
  panes.forEach(({ id, key }) => {
    const el = document.getElementById(id);
    if (el) el.hidden = String(key) !== String(targetStep);
  });

  // Cập nhật thanh chỉ báo tiến trình Wizard (Bước 2b vẫn sáng ở chỉ báo số 2)
  const numericStep = targetStep === '2b' ? 2 : Number(targetStep);
  document.querySelectorAll('[data-step-indicator]').forEach((el) => {
    const s = Number(/** @type {HTMLElement} */ (el).dataset.stepIndicator);
    el.classList.toggle('is-active', s === numericStep);
    el.classList.toggle('is-done', s < numericStep);
  });

  if (targetStep === 2 && subject) {
    populateStep2Sources(subject);
  } else if (targetStep === '2b' && subject) {
    populateStep2bCategories(subject);
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

  document.querySelectorAll('[data-source-btn]').forEach((btn) => {
    const src = /** @type {HTMLElement} */ (btn).dataset.sourceBtn;
    /** @type {HTMLElement} */ (btn).hidden = !subject.sources.includes(src);
  });

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
    if (subject.id === 'toan') {
      ngoaiInfo.textContent = cNgoai !== null
        ? `Chuyên đề Tổng hợp & Xác suất · Hiện có ${cNgoai} câu`
        : 'Chuyên đề Tổng hợp & Xác suất (Chọn bài nhỏ)';
    } else if (subject.id === 'tinhoc') {
      ngoaiInfo.textContent = cNgoai !== null
        ? `Phân loại theo từng trường THPT · Hiện có ${cNgoai} câu`
        : 'Đề thi thử phân loại theo từng trường THPT';
    } else {
      ngoaiInfo.textContent = cNgoai !== null
        ? (cNgoai > 0 ? `Đề mở rộng · Hiện có ${cNgoai} câu` : 'Đề mở rộng · Chưa có câu hỏi (0 câu)')
        : 'Đề sưu tầm & luyện tập mở rộng';
    }
  }
}

/**
 * Cập nhật giao diện Màn hình trung gian 2b (Toán / Tin học > Đề ngoài: Chuyên đề / Trường -> Chương -> Bài nhỏ).
 * Luôn hiển thị ngay lập tức bộ khung mặc định trước, sau đó mới cập nhật dữ liệu thực tế từ JSON.
 * @param {{id: string, name: string, icon: string, sources: string[]}} subject
 */
async function populateStep2bCategories(subject) {
  const badgeEl = document.getElementById('step2b-subject-badge');
  if (badgeEl) badgeEl.textContent = `${subject.icon} ${subject.name}`;

  const fallbackCats = subject.id === 'tinhoc'
    ? DEFAULT_TINHOC_NGOAI_CATEGORIES
    : DEFAULT_TOAN_NGOAI_CATEGORIES;

  // 1) Hiển thị ngay lập tức bộ khung mặc định để UI không bao giờ bị trống/ẩn
  renderCategoryAccordionList(fallbackCats);

  // 2) Tải dữ liệu lồng nhau từ JSON và cập nhật số lượng câu của từng bài/trường
  const categories = await loadNestedCategories(subject.id, SOURCES.NGOAI);
  if (categories && categories.length > 0) {
    renderCategoryAccordionList(categories);
  }
}

/**
 * Tạo nút Bài nhỏ (`.lesson-btn`).
 */
function createLessonButton(cat, les, ch = null) {
  const lesBtn = document.createElement('button');
  lesBtn.type = 'button';
  lesBtn.className = 'lesson-btn';
  lesBtn.setAttribute('data-category-id', cat.id);
  lesBtn.setAttribute('data-category-name', cat.name);
  if (ch) {
    lesBtn.setAttribute('data-chapter-id', ch.id);
    lesBtn.setAttribute('data-chapter-name', ch.name);
  }
  lesBtn.setAttribute('data-lesson-id', les.id);
  const fullLabel = ch
    ? `${cat.name} · ${ch.name} · ${les.name}`
    : `${cat.name} · ${les.name}`;
  lesBtn.setAttribute('data-lesson-name', fullLabel);

  const nameSpan = document.createElement('span');
  nameSpan.className = 'lesson-btn__name';
  nameSpan.textContent = les.name;

  const metaSpan = document.createElement('span');
  metaSpan.className = 'lesson-btn__meta';

  const qCount = Array.isArray(les.questions) ? les.questions.length : 0;
  const badge = document.createElement('span');
  badge.className = 'badge badge--info';
  badge.textContent = `${qCount} câu`;

  const arrow = document.createElement('span');
  arrow.className = 'muted';
  arrow.textContent = '›';

  metaSpan.appendChild(badge);
  metaSpan.appendChild(arrow);

  lesBtn.appendChild(nameSpan);
  lesBtn.appendChild(metaSpan);
  return lesBtn;
}

/**
 * Dựng danh sách các Chuyên đề (Tổng hợp -> các Chương -> các Bài nhỏ; Xác suất -> các Bài nhỏ) bên trong `#category-accordion-list`.
 * Chỉ hiển thị các Chương đã có bài học (theo yêu cầu người dùng).
 * @param {Array<{id: string, name: string, icon?: string, description?: string, chapters?: Array<{id: string, name: string, lessons?: Array<{id: string, name: string, questions?: any[]}>}>, lessons?: Array<{id: string, name: string, questions?: any[]}>}>} categories
 */
function renderCategoryAccordionList(categories) {
  const listEl = document.getElementById('category-accordion-list');
  if (!listEl) return;

  const safeCategories = Array.isArray(categories) && categories.length > 0
    ? categories
    : DEFAULT_TOAN_NGOAI_CATEGORIES;

  listEl.innerHTML = '';
  const frag = document.createDocumentFragment();

  safeCategories.forEach((cat, idx) => {
    const item = document.createElement('div');
    // Mở sẵn danh mục đầu tiên để học sinh thấy ngay các Chương / Bài bên trong
    const isOpen = idx === 0;
    item.className = `category-item${isOpen ? ' is-open' : ''}`;
    item.dataset.categoryId = cat.id;

    const headerBtn = document.createElement('button');
    headerBtn.type = 'button';
    headerBtn.className = 'category-item__header';
    headerBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');

    const iconSpan = document.createElement('span');
    iconSpan.className = 'category-item__icon';
    iconSpan.setAttribute('aria-hidden', 'true');
    iconSpan.textContent = cat.icon || (cat.id === 'xacsuat' ? '🎲' : '📚');

    const infoSpan = document.createElement('span');
    infoSpan.className = 'category-item__info';

    const titleStrong = document.createElement('strong');
    titleStrong.className = 'category-item__title';
    titleStrong.textContent = cat.name;

    const descSmall = document.createElement('small');
    descSmall.className = 'category-item__desc muted';

    const validChapters = Array.isArray(cat.chapters)
      ? cat.chapters.filter((ch) => Array.isArray(ch.lessons) && ch.lessons.length > 0)
      : [];

    if (validChapters.length > 0) {
      const totalLes = validChapters.reduce((sum, ch) => sum + ch.lessons.length, 0);
      descSmall.textContent = cat.description
        ? `${cat.description} (${validChapters.length} chương · ${totalLes} bài)`
        : `Gồm ${validChapters.length} chương · ${totalLes} bài luyện tập`;
    } else {
      const lessonCount = Array.isArray(cat.lessons) ? cat.lessons.length : 0;
      descSmall.textContent = cat.description
        ? `${cat.description} (${lessonCount} bài)`
        : `Gồm ${lessonCount} bài luyện tập`;
    }

    infoSpan.appendChild(titleStrong);
    infoSpan.appendChild(descSmall);

    const chevronSpan = document.createElement('span');
    chevronSpan.className = 'category-item__chevron';
    chevronSpan.setAttribute('aria-hidden', 'true');
    chevronSpan.textContent = '▾';

    headerBtn.appendChild(iconSpan);
    headerBtn.appendChild(infoSpan);
    headerBtn.appendChild(chevronSpan);

    const lessonsWrap = document.createElement('div');
    lessonsWrap.className = 'category-item__lessons';

    if (validChapters.length > 0) {
      validChapters.forEach((ch, chIdx) => {
        const chItem = document.createElement('div');
        const chOpen = chIdx === 0;
        chItem.className = `chapter-item${chOpen ? ' is-open' : ''}`;
        chItem.dataset.chapterId = ch.id;

        const chHeader = document.createElement('button');
        chHeader.type = 'button';
        chHeader.className = 'chapter-item__header';
        chHeader.setAttribute('aria-expanded', chOpen ? 'true' : 'false');

        const chIcon = document.createElement('span');
        chIcon.className = 'chapter-item__icon';
        chIcon.setAttribute('aria-hidden', 'true');
        chIcon.textContent = '📖';

        const chInfo = document.createElement('span');
        chInfo.className = 'chapter-item__info';

        const chTitle = document.createElement('strong');
        chTitle.className = 'chapter-item__title';
        chTitle.textContent = ch.name;

        const chDesc = document.createElement('small');
        chDesc.className = 'chapter-item__desc muted';
        const chLessonCount = ch.lessons.length;
        const chQuestionCount = ch.lessons.reduce(
          (sum, l) => sum + (Array.isArray(l.questions) ? l.questions.length : 0),
          0
        );
        chDesc.textContent = `${chLessonCount} bài · ${chQuestionCount} câu hỏi`;

        chInfo.appendChild(chTitle);
        chInfo.appendChild(chDesc);

        const chChevron = document.createElement('span');
        chChevron.className = 'chapter-item__chevron';
        chChevron.setAttribute('aria-hidden', 'true');
        chChevron.textContent = '▾';

        chHeader.appendChild(chIcon);
        chHeader.appendChild(chInfo);
        chHeader.appendChild(chChevron);

        const chLessonsWrap = document.createElement('div');
        chLessonsWrap.className = 'chapter-item__lessons';

        ch.lessons.forEach((les) => {
          chLessonsWrap.appendChild(createLessonButton(cat, les, ch));
        });

        chItem.appendChild(chHeader);
        chItem.appendChild(chLessonsWrap);
        lessonsWrap.appendChild(chItem);
      });
    } else {
      const lessons = Array.isArray(cat.lessons) ? cat.lessons : [];
      lessons.forEach((les) => {
        lessonsWrap.appendChild(createLessonButton(cat, les, null));
      });
    }

    item.appendChild(headerBtn);
    item.appendChild(lessonsWrap);
    frag.appendChild(item);
  });

  listEl.appendChild(frag);
}

/**
 * Cập nhật giao diện Màn hình 3 (Chọn phần ôn + Tùy chỉnh + Nút Bắt đầu làm bài).
 * @param {{id: string, name: string, icon: string, sources: string[]}} subject
 */
async function populateStep3Config(subject) {
  const { source, lessonName } = getState('selection');
  const subjBadge = document.getElementById('step3-subject-badge');
  const srcBadge = document.getElementById('step3-source-badge');
  const lesBadge = document.getElementById('step3-lesson-badge');
  const backBtn = document.getElementById('btn-back-step-3');

  if (subjBadge) subjBadge.textContent = `${subject.icon} ${subject.name}`;
  if (srcBadge) srcBadge.textContent = SOURCE_LABELS[source] || 'Đề trường';

  if (lesBadge) {
    if (lessonName) {
      lesBadge.textContent = lessonName;
      lesBadge.hidden = false;
    } else {
      lesBadge.hidden = true;
    }
  }

  if (backBtn) {
    if (requiresCategoryStep(subject.id, source)) {
      backBtn.textContent = '← Quay lại chọn bài';
    } else if (subject.sources.length > 1) {
      backBtn.textContent = '← Quay lại chọn nguồn đề';
    } else {
      backBtn.textContent = '← Quay lại chọn môn';
    }
  }

  // Mặc định thu gọn khung Tùy chỉnh làm bài để tiết kiệm diện tích
  const settingsBody = document.getElementById('step3-settings-body');
  const toggleSettingsBtn = document.getElementById('btn-toggle-step3-settings');
  if (settingsBody) settingsBody.hidden = true;
  if (toggleSettingsBtn) {
    toggleSettingsBtn.setAttribute('aria-expanded', 'false');
    toggleSettingsBtn.textContent = 'Mở rộng ▾';
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
  const { subjectId, source, categoryId, chapterId, lessonId, lessonName, parts } = getState('selection');
  const subject = getSubjectById(subjectId);

  if (!subject) {
    if (infoEl) infoEl.textContent = 'Hãy chọn một môn học.';
    if (startBtn) startBtn.disabled = true;
    return;
  }

  const breakdown = await getQuestionBreakdown(subjectId, source, { categoryId, chapterId, lessonId });
  const srcLabel = lessonName || SOURCE_LABELS[source] || 'Đề trường';

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
      infoEl.textContent = `${subject.name} · ${srcLabel}: Nguồn đề này hiện chưa có câu hỏi nào (0 câu). Bạn có thể quay lại chọn nguồn đề khác.`;
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
