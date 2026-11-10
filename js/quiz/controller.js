/* ==========================================================================
   js/quiz/controller.js — Điều phối phiên làm bài & màn hình Kết quả
   - Khởi tạo bài thi (mới hoàn toàn hoặc "Chỉ làm lại những câu sai").
   - Đồng hồ đếm ngược (hoặc đếm xuôi nếu timeLimit = 0) + thanh tiến độ.
   - Chuyển đổi tức thì giữa 2 chế độ: Cuộn (scroll) <-> Từng câu (single).
   - Chế độ xem lời giải: 'instant' (hiện ngay khi chọn sai) hoặc 'after' (sau khi nộp).
   - Chấm điểm, lưu lịch sử (kèm fallback offline) và dựng màn hình Kết quả.
   Dev by Thkc
   ========================================================================== */

import { getState, setState, patchState, SOURCE_LABELS } from '../core/state.js';
import { navigate, setLeaveGuard } from '../core/router.js';
import { saveResult } from '../services/history.service.js';
import { prepareQuizQuestions } from './shuffle.js';
import { gradeQuestion, gradeQuiz, isAnswered } from './grader.js';
import {
  createQuestionCard,
  syncQuestionCardState,
  renderPalette,
  updatePaletteState,
} from './renderer.js';

/** @type {number|null} */
let timerId = null;

/** @type {Map<string, HTMLElement>} q.key -> .question-card trong màn làm bài */
const cardMap = new Map();

/** @type {((opts: {title?: string, message: string, okText?: string}) => Promise<boolean>)|null} */
let confirmFn = null;

/** @type {((msg: string, type?: 'info'|'success'|'warning'|'error') => void)|null} */
let toastFn = null;

let boundEvents = false;

/* --------------------------------------------------------------------------
   Khởi tạo & gắn sự kiện cố định
   -------------------------------------------------------------------------- */

/**
 * Gắn sự kiện cho các nút trên màn hình Làm bài & Kết quả. Gọi 1 lần từ `app.js`.
 * @param {Object} helpers
 * @param {(opts: {title?: string, message: string, okText?: string}) => Promise<boolean>} helpers.confirm
 * @param {(msg: string, type?: 'info'|'success'|'warning'|'error') => void} helpers.toast
 */
export function initQuizController({ confirm, toast } = {}) {
  confirmFn = confirm || ((o) => Promise.resolve(window.confirm(o.message)));
  toastFn = toast || (() => {});

  if (boundEvents) return;
  boundEvents = true;

  // Toggle Cuộn <-> Từng câu ngay trên thanh Header thông minh
  const viewToggle = /** @type {HTMLInputElement} */ (document.getElementById('toggle-view-mode'));
  viewToggle?.addEventListener('change', () => {
    setViewMode(viewToggle.checked ? 'single' : 'scroll');
  });

  // Điều hướng Từng câu
  document.getElementById('btn-prev')?.addEventListener('click', () => prevQuestion());
  document.getElementById('btn-next')?.addEventListener('click', () => nextQuestion());

  // Hỗ trợ phím mũi tên Trái/Phải ở chế độ Từng câu (khi không gõ trong input)
  window.addEventListener('keydown', (e) => {
    if (document.body.dataset.screen !== 'quiz') return;
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || document.querySelector('dialog[open]')) return;
    if (getQuizViewMode() !== 'single') return;

    if (e.key === 'ArrowLeft') { e.preventDefault(); prevQuestion(); }
    if (e.key === 'ArrowRight') { e.preventDefault(); nextQuestion(); }
  });

  // Nút Thoát bài làm
  document.getElementById('btn-quiz-exit')?.addEventListener('click', async () => {
    await navigate('home');
  });

  // Nút Nộp bài
  document.getElementById('btn-submit')?.addEventListener('click', () => {
    requestSubmitQuiz();
  });

  // Màn hình Kết quả: 3 nút hành động + bộ lọc xem lại
  document.getElementById('btn-retry-wrong')?.addEventListener('click', () => retryWrongQuestions());
  document.getElementById('btn-retry-all')?.addEventListener('click', () => retryAllQuestions());
  document.getElementById('btn-result-home')?.addEventListener('click', () => {
    patchState('selection', { wizardStep: 1 });
    navigate('home');
  });

  const onlyWrongChk = /** @type {HTMLInputElement} */ (document.getElementById('review-only-wrong'));
  onlyWrongChk?.addEventListener('change', () => {
    filterReviewCards(onlyWrongChk.checked);
  });
}

/* --------------------------------------------------------------------------
   Bắt đầu phiên làm bài
   -------------------------------------------------------------------------- */

/**
 * Bắt đầu làm bài với danh sách câu hỏi gốc.
 * @param {Object} params
 * @param {string} params.subjectId
 * @param {string} params.subjectName
 * @param {'truong'|'ngoai'|'all'} params.source
 * @param {Array<import('../services/data.service.js').Question>} params.questions
 * @param {boolean} [params.isRetry=false]
 */
export async function startQuiz({ subjectId, subjectName, source, questions, isRetry = false }) {
  const settings = getState('settings');
  const prepared = prepareQuizQuestions(questions, settings);

  if (!prepared.length) {
    toastFn?.('Không có câu hỏi nào trong nguồn đề này.', 'warning');
    return false;
  }

  stopTimer();
  cardMap.clear();

  const durationSec = Math.max(0, Number(settings.timeLimit) || 0) * 60;

  setState('quiz', {
    subjectId,
    subjectName,
    source,
    questions: prepared,
    answers: {},
    checked: {},
    currentIndex: 0,
    startedAt: Date.now(),
    durationSec,
    submitted: false,
    isRetry,
  });

  renderQuizScreen();
  await navigate('quiz', { force: true });

  // Đặt bảo vệ rời màn hình khi đang làm dở
  setLeaveGuard(async () => {
    if (getState('quiz').submitted) return true;
    return confirmFn({
      title: 'Thoát bài đang làm?',
      message: 'Tiến độ làm bài hiện tại sẽ bị hủy và không được lưu.',
      okText: 'Thoát',
    });
  });

  startTimer();
  return true;
}

/** Dọn dẹp khi rời màn hình quiz (được gọi từ hook leave của router). */
export function cleanupQuizScreen() {
  stopTimer();
  document.body.classList.remove('has-quiz-nav');
}

/* --------------------------------------------------------------------------
   Dựng giao diện màn hình Làm bài
   -------------------------------------------------------------------------- */

function renderQuizScreen() {
  const quiz = getState('quiz');
  const settings = getState('settings');

  // Tiêu đề môn học trên Header
  const subjectEl = document.getElementById('quiz-subject');
  const sourceLabel = SOURCE_LABELS[quiz.source] || '';
  if (subjectEl) {
    subjectEl.textContent = quiz.isRetry
      ? `${quiz.subjectName} (Làm lại câu sai)`
      : `${quiz.subjectName}${sourceLabel ? ` · ${sourceLabel}` : ''}`;
  }

  // Dựng danh sách thẻ câu hỏi
  const container = document.getElementById('quiz-container');
  container.innerHTML = '';
  const frag = document.createDocumentFragment();

  quiz.questions.forEach((q, idx) => {
    const card = createQuestionCard(q, idx, {
      onAnswer: handleUserAnswer,
    });
    cardMap.set(q.key, card);
    frag.appendChild(card);
  });
  container.appendChild(frag);

  // Dựng bảng câu hỏi (Palette)
  const paletteEl = document.getElementById('quiz-palette');
  renderPalette(paletteEl, quiz.questions, (idx) => goToQuestion(idx, { fromPalette: true }));

  // Áp chế độ hiển thị (Cuộn / Từng câu)
  setViewMode(settings.viewMode, { silent: true });
  updateProgressUI();
}

/* --------------------------------------------------------------------------
   Xử lý khi người dùng trả lời 1 câu
   -------------------------------------------------------------------------- */

/**
 * @param {string} questionKey
 * @param {any} value
 * @param {HTMLElement} card
 * @param {{commit?: boolean}} [meta]
 */
function handleUserAnswer(questionKey, value, card, meta = {}) {
  const quiz = getState('quiz');
  if (quiz.submitted) return;

  const question = quiz.questions.find((q) => q.key === questionKey);
  if (!question) return;

  // Nếu câu này đã bị khóa do chấm tức thì trước đó -> bỏ qua
  if (quiz.checked[questionKey] && question.type !== 'short') return;

  quiz.answers[questionKey] = value;

  const explainMode = getState('settings').explainMode;
  const shouldInstantCheck =
    explainMode === 'instant' &&
    isAnswered(value) &&
    (question.type !== 'short' || meta.commit === true);

  if (shouldInstantCheck) {
    quiz.checked[questionKey] = true;
    const grade = gradeQuestion(question, value);
    syncQuestionCardState(card, question, {
      userAnswer: value,
      revealed: true,
      // Theo SRS: xem giải thích "Ngay khi chọn sai" (chọn đúng vẫn báo đúng, chọn sai mở sẵn lời giải)
      showExplanation: !grade.isCorrect || Boolean(question.explanation),
      openExplanation: !grade.isCorrect,
      locked: question.type !== 'short', // MCQ/TrueFalse khóa sau khi lộ đáp án
    });
  } else {
    syncQuestionCardState(card, question, {
      userAnswer: value,
      revealed: false,
      showExplanation: false,
      locked: false,
    });
  }

  updateProgressUI();
}

/**
 * Áp lại cài đặt ngay khi người dùng chỉnh Popup Cài đặt giữa lúc đang làm bài.
 */
export function applyLiveSettingsToQuiz() {
  if (document.body.dataset.screen !== 'quiz') return;
  const settings = getState('settings');
  setViewMode(settings.viewMode, { silent: true });
}

/* --------------------------------------------------------------------------
   Chế độ hiển thị: Cuộn (scroll) <-> Từng câu (single)
   -------------------------------------------------------------------------- */

export function getQuizViewMode() {
  const container = document.getElementById('quiz-container');
  return container?.dataset.mode === 'single' ? 'single' : 'scroll';
}

/**
 * @param {'scroll'|'single'} mode
 * @param {{silent?: boolean}} [opts]
 */
export function setViewMode(mode, opts = {}) {
  const cleanMode = mode === 'single' ? 'single' : 'scroll';
  const container = document.getElementById('quiz-container');
  const navEl = document.getElementById('quiz-nav');
  const toggleEl = /** @type {HTMLInputElement} */ (document.getElementById('toggle-view-mode'));

  if (container) container.dataset.mode = cleanMode;
  if (toggleEl) toggleEl.checked = cleanMode === 'single';
  if (navEl) navEl.hidden = cleanMode !== 'single';

  document.body.classList.toggle('has-quiz-nav', cleanMode === 'single');

  const quiz = getState('quiz');
  if (cleanMode === 'single') {
    goToQuestion(quiz.currentIndex || 0, { direction: 'none' });
  } else {
    // Bỏ trạng thái ẩn/active của chế độ từng câu
    cardMap.forEach((card) => {
      card.classList.remove('is-active', 'slide-from-left', 'slide-from-right');
    });
    updateProgressUI();
  }

  if (!opts.silent) {
    patchState('settings', { viewMode: cleanMode });
  }
}

/**
 * Chuyển tới câu thứ `index` (0-based).
 * @param {number} index
 * @param {{direction?: 'next'|'prev'|'none', fromPalette?: boolean}} [opts]
 */
export function goToQuestion(index, opts = {}) {
  const quiz = getState('quiz');
  const total = quiz.questions.length;
  if (!total) return;

  const target = Math.min(Math.max(0, index), total - 1);
  const prevIdx = quiz.currentIndex;
  quiz.currentIndex = target;

  const targetQ = quiz.questions[target];
  const targetCard = cardMap.get(targetQ.key);

  if (getQuizViewMode() === 'single') {
    const dir = opts.direction || (target > prevIdx ? 'next' : target < prevIdx ? 'prev' : 'none');

    cardMap.forEach((card, key) => {
      const active = key === targetQ.key;
      card.classList.toggle('is-active', active);
      card.classList.remove('slide-from-left', 'slide-from-right');
      if (active && dir !== 'none') {
        card.classList.add(dir === 'next' ? 'slide-from-right' : 'slide-from-left');
      }
    });

    const posEl = document.getElementById('quiz-position');
    const prevBtn = /** @type {HTMLButtonElement} */ (document.getElementById('btn-prev'));
    const nextBtn = /** @type {HTMLButtonElement} */ (document.getElementById('btn-next'));

    if (posEl) posEl.textContent = `${target + 1} / ${total}`;
    if (prevBtn) prevBtn.disabled = target <= 0;
    if (nextBtn) nextBtn.disabled = target >= total - 1;

    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else if (targetCard) {
    // Chế độ cuộn: cuộn mượt tới thẻ câu hỏi và nháy viền
    targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    targetCard.classList.remove('is-flash');
    void targetCard.offsetWidth; // reflow để chạy lại animation
    targetCard.classList.add('is-flash');
  }

  // Đóng bảng câu hỏi trên mobile sau khi chọn
  if (opts.fromPalette) {
    const details = document.querySelector('.palette');
    if (details && window.innerWidth < 640) details.removeAttribute('open');
  }

  updateProgressUI();
}

export function nextQuestion() {
  const quiz = getState('quiz');
  if (quiz.currentIndex < quiz.questions.length - 1) {
    goToQuestion(quiz.currentIndex + 1, { direction: 'next' });
  }
}

export function prevQuestion() {
  const quiz = getState('quiz');
  if (quiz.currentIndex > 0) {
    goToQuestion(quiz.currentIndex - 1, { direction: 'prev' });
  }
}

/* --------------------------------------------------------------------------
   Tiến độ & Đồng hồ
   -------------------------------------------------------------------------- */

function updateProgressUI() {
  const quiz = getState('quiz');
  const total = quiz.questions.length;
  const answeredCount = quiz.questions.filter((q) => isAnswered(quiz.answers[q.key])).length;
  const percent = total > 0 ? Math.round((answeredCount / total) * 100) : 0;

  const textEl = document.getElementById('quiz-progress-text');
  const barEl = document.getElementById('quiz-progress-bar');
  const progressWrap = barEl?.parentElement;

  if (textEl) textEl.textContent = `${answeredCount}/${total} câu đã làm`;
  if (barEl) barEl.style.width = `${percent}%`;
  if (progressWrap) progressWrap.setAttribute('aria-valuenow', String(percent));

  const paletteEl = document.getElementById('quiz-palette');
  updatePaletteState(
    paletteEl,
    quiz.questions,
    quiz.answers,
    quiz.checked,
    quiz.currentIndex,
    getQuizViewMode()
  );
}

function formatTime(totalSeconds) {
  const sec = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function startTimer() {
  stopTimer();
  const timerEl = document.getElementById('quiz-timer');
  if (!timerEl) return;

  const tick = () => {
    const quiz = getState('quiz');
    if (quiz.submitted) { stopTimer(); return; }

    const elapsedSec = Math.floor((Date.now() - quiz.startedAt) / 1000);

    if (quiz.durationSec <= 0) {
      // Không giới hạn thời gian -> đếm xuôi
      timerEl.textContent = formatTime(elapsedSec);
      timerEl.className = 'timer is-unlimited';
      return;
    }

    const remaining = quiz.durationSec - elapsedSec;
    timerEl.textContent = formatTime(remaining);

    timerEl.classList.remove('is-unlimited', 'is-warning', 'is-danger');
    if (remaining <= 60) {
      timerEl.classList.add('is-danger');
    } else if (remaining <= quiz.durationSec * 0.2) {
      timerEl.classList.add('is-warning');
    }

    if (remaining <= 0) {
      stopTimer();
      toastFn?.('Đã hết thời gian làm bài! Hệ thống tự động nộp bài.', 'warning');
      submitQuiz({ auto: true });
    }
  };

  tick();
  timerId = window.setInterval(tick, 1000);
}

function stopTimer() {
  if (timerId !== null) {
    clearInterval(timerId);
    timerId = null;
  }
}

/* --------------------------------------------------------------------------
   Nộp bài & Màn hình Kết quả
   -------------------------------------------------------------------------- */

async function requestSubmitQuiz() {
  const quiz = getState('quiz');
  if (quiz.submitted) return;

  const total = quiz.questions.length;
  const answeredCount = quiz.questions.filter((q) => isAnswered(quiz.answers[q.key])).length;
  const remaining = total - answeredCount;

  const message = remaining > 0
    ? `Bạn còn ${remaining}/${total} câu chưa trả lời. Bạn có chắc chắn muốn nộp bài ngay?`
    : `Bạn đã hoàn thành ${total}/${total} câu. Xác nhận nộp bài?`;

  const ok = await confirmFn({
    title: 'Nộp bài',
    message,
    okText: 'Nộp bài',
  });

  if (ok) await submitQuiz({ auto: false });
}

/**
 * Chấm điểm, lưu lịch sử (có fallback offline) và chuyển sang màn Kết quả.
 * @param {{auto?: boolean}} [opts]
 */
export async function submitQuiz(opts = {}) {
  const quiz = getState('quiz');
  if (quiz.submitted) return;

  quiz.submitted = true;
  stopTimer();
  setLeaveGuard(null);

  const durationSec = Math.max(1, Math.floor((Date.now() - quiz.startedAt) / 1000));
  const graded = gradeQuiz(quiz.questions, quiz.answers);

  const fullResult = {
    ...graded,
    subjectId: quiz.subjectId,
    subjectName: quiz.subjectName,
    source: quiz.source,
    durationSec,
    isRetry: quiz.isRetry,
    createdAt: Date.now(),
    questions: quiz.questions,
    answers: { ...quiz.answers },
  };

  setState('lastResult', fullResult);
  renderResultScreen(fullResult);
  await navigate('result', { replace: true, force: true });

  // Lưu lên Firestore (nếu rớt mạng -> history.service tự xếp vào localStorage)
  const syncEl = document.getElementById('result-sync-status');
  if (syncEl) {
    syncEl.className = 'sync-status';
    syncEl.textContent = 'Đang lưu kết quả...';
  }

  try {
    const { status } = await saveResult(fullResult);
    updateResultSyncBadge(status);
  } catch (err) {
    console.error('[controller] Lỗi lưu kết quả:', err);
    updateResultSyncBadge('error');
  }
}

/**
 * Cập nhật dòng trạng thái đồng bộ trên màn Kết quả.
 * @param {'synced'|'queued'|'error'} status
 */
export function updateResultSyncBadge(status) {
  const syncEl = document.getElementById('result-sync-status');
  if (!syncEl) return;

  syncEl.classList.remove('is-ok', 'is-pending', 'is-error');
  if (status === 'synced') {
    syncEl.classList.add('is-ok');
    syncEl.textContent = '✓ Đã đồng bộ kết quả lên đám mây.';
  } else if (status === 'queued') {
    syncEl.classList.add('is-pending');
    syncEl.textContent = '⏳ Đang offline — kết quả đã lưu vào máy và sẽ tự đồng bộ khi có mạng.';
  } else {
    syncEl.classList.add('is-error');
    syncEl.textContent = '⚠ Không thể lưu kết quả.';
  }
}

function renderResultScreen(result) {
  // Vòng điểm
  const ringEl = /** @type {HTMLElement} */ (document.querySelector('.score-ring'));
  const scoreEl = document.getElementById('result-score');
  const totalEl = document.getElementById('result-total');
  const percentEl = document.getElementById('result-percent');
  const subjectEl = document.getElementById('result-subject');

  if (ringEl) {
    ringEl.style.setProperty('--percent', String(result.percent));
    ringEl.classList.remove('is-good', 'is-mid', 'is-low');
    ringEl.classList.add(result.percent >= 80 ? 'is-good' : result.percent >= 50 ? 'is-mid' : 'is-low');
  }
  if (scoreEl) scoreEl.textContent = String(result.correct);
  if (totalEl) totalEl.textContent = String(result.total);
  if (percentEl) percentEl.textContent = `${result.score} điểm (${result.percent}%)`;
  if (subjectEl) {
    const srcLabel = SOURCE_LABELS[result.source] || '';
    subjectEl.textContent = `${result.subjectName}${srcLabel ? ` · ${srcLabel}` : ''}`;
  }

  // Thống kê
  document.getElementById('result-correct').textContent = String(result.correct);
  document.getElementById('result-wrong').textContent = String(result.wrong);
  document.getElementById('result-unanswered').textContent = String(result.unanswered);
  document.getElementById('result-time').textContent = formatTime(result.durationSec);

  // Nút "Chỉ làm lại những câu sai": khóa nếu đã đúng tuyệt đối 100%
  const retryWrongBtn = /** @type {HTMLButtonElement} */ (document.getElementById('btn-retry-wrong'));
  if (retryWrongBtn) {
    retryWrongBtn.disabled = result.wrongIds.length === 0;
    retryWrongBtn.textContent = result.wrongIds.length > 0
      ? `Chỉ làm lại những câu sai (${result.wrongIds.length})`
      : 'Đã đúng toàn bộ câu hỏi 🎉';
  }

  // Reset checkbox lọc câu sai
  const onlyWrongChk = /** @type {HTMLInputElement} */ (document.getElementById('review-only-wrong'));
  if (onlyWrongChk) onlyWrongChk.checked = false;

  // Danh sách xem lại bài làm kèm Accordion lời giải
  const reviewWrap = document.getElementById('result-review');
  if (!reviewWrap) return;
  reviewWrap.innerHTML = '';

  const frag = document.createDocumentFragment();
  result.questions.forEach((q, idx) => {
    const detail = result.details[q.key];
    const card = createQuestionCard(q, idx, {
      userAnswer: detail?.userAnswer,
      revealed: true,
      showExplanation: true,
      openExplanation: !detail?.isCorrect, // Tự mở sẵn lời giải cho các câu làm sai
      locked: true,
    });
    frag.appendChild(card);
  });
  reviewWrap.appendChild(frag);
}

function filterReviewCards(onlyWrong) {
  const reviewWrap = document.getElementById('result-review');
  if (!reviewWrap) return;
  reviewWrap.querySelectorAll('.question-card').forEach((card) => {
    const isCorrect = card.dataset.state === 'correct';
    card.hidden = Boolean(onlyWrong && isCorrect);
  });
}

/* --------------------------------------------------------------------------
   Làm lại câu sai / Làm lại toàn bộ
   -------------------------------------------------------------------------- */

function retryWrongQuestions() {
  const last = getState('lastResult');
  if (!last || !last.wrongIds?.length) return;

  const wrongSet = new Set(last.wrongIds);
  const wrongQuestions = last.questions.filter((q) => wrongSet.has(q.key));

  startQuiz({
    subjectId: last.subjectId,
    subjectName: last.subjectName,
    source: last.source,
    questions: wrongQuestions,
    isRetry: true,
  });
}

function retryAllQuestions() {
  const last = getState('lastResult');
  if (!last || !last.questions?.length) return;

  startQuiz({
    subjectId: last.subjectId,
    subjectName: last.subjectName,
    source: last.source,
    questions: last.questions,
    isRetry: false,
  });
}
