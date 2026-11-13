/* ==========================================================================
   js/quiz/renderer.js — Dựng DOM câu hỏi, bảng số câu & gọi KaTeX auto-render
   Clone từ các <template> trong index.html: #tpl-question, #tpl-option.
   Dev by Thkc
   ========================================================================== */

import { gradeQuestion, isAnswered } from './grader.js';

const TYPE_BADGES = {
  mcq: 'Phần 1 · Trắc nghiệm',
  truefalse: 'Phần 2 · Đúng / Sai',
  short: 'Phần 3 · Trả lời ngắn',
};

/* --------------------------------------------------------------------------
   KaTeX Auto-render
   -------------------------------------------------------------------------- */

/**
 * Render công thức Toán học (inline `$...$`, `\(...\)` và block `$$...$$`, `\[...\]`)
 * bên trong phần tử `root`. Nếu script KaTeX (defer) chưa kịp tải xong, tự thử lại ngắn.
 * @param {HTMLElement} root
 */
export function renderMath(root) {
  if (!root) return;

  const run = () => {
    if (typeof window.renderMathInElement !== 'function') return false;
    try {
      window.renderMathInElement(root, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '\\[', right: '\\]', display: true },
          { left: '$', right: '$', display: false },
          { left: '\\(', right: '\\)', display: false },
        ],
        throwOnError: false,
        strict: 'ignore',
      });
    } catch (err) {
      console.warn('[renderer] KaTeX render lỗi:', err);
    }
    return true;
  };

  if (!run()) {
    window.addEventListener('load', () => run(), { once: true });
  }
}

/* --------------------------------------------------------------------------
   Dựng 1 thẻ câu hỏi (.question-card)
   -------------------------------------------------------------------------- */

/**
 * Tạo phần tử `.question-card` từ `#tpl-question`.
 * @param {import('../services/data.service.js').Question} question
 * @param {number} displayIndex  Số thứ tự hiển thị (0-based)
 * @param {Object} [opts]
 * @param {any}     [opts.userAnswer]
 * @param {boolean} [opts.revealed=false]  Đã lộ đáp án/chấm điểm (review hoặc instant wrong)
 * @param {boolean} [opts.showExplanation=false] Hiện khung lời giải
 * @param {boolean} [opts.openExplanation=false] Mở sẵn accordion lời giải
 * @param {boolean} [opts.locked=false]    Khóa không cho sửa đáp án
 * @param {(questionKey: string, value: any, cardEl: HTMLElement) => void} [opts.onAnswer]
 * @returns {HTMLElement}
 */
export function createQuestionCard(question, displayIndex, opts = {}) {
  const {
    userAnswer = undefined,
    revealed = false,
    showExplanation = false,
    openExplanation = false,
    locked = false,
    onAnswer,
  } = opts;

  const tpl = /** @type {HTMLTemplateElement} */ (document.getElementById('tpl-question'));
  const optTpl = /** @type {HTMLTemplateElement} */ (document.getElementById('tpl-option'));
  const card = /** @type {HTMLElement} */ (tpl.content.firstElementChild.cloneNode(true));

  card.dataset.qid = question.key;
  card.dataset.index = String(displayIndex);
  card.dataset.type = question.type;

  // Header: Câu X + nhãn loại câu
  const indexEl = card.querySelector('.question-card__index');
  const typeEl = card.querySelector('.question-card__type');
  indexEl.textContent = `Câu ${displayIndex + 1}`;
  typeEl.textContent = TYPE_BADGES[question.type] || 'Câu hỏi';

  // Nội dung câu hỏi (dùng textContent để an toàn XSS, KaTeX sẽ parse công thức sau)
  const bodyEl = card.querySelector('.question-card__body');
  bodyEl.textContent = question.question;

  // Hình minh họa (nếu có)
  const figureEl = /** @type {HTMLElement} */ (card.querySelector('.question-card__figure'));
  const imgEl = /** @type {HTMLImageElement} */ (card.querySelector('.question-card__image'));
  if (question.image) {
    imgEl.src = question.image;
    imgEl.alt = `Hình minh họa câu ${displayIndex + 1}`;
    imgEl.onerror = () => { figureEl.hidden = true; };
    figureEl.hidden = false;
  } else {
    figureEl.hidden = true;
  }

  const optionsWrap = /** @type {HTMLElement} */ (card.querySelector('.question-card__options'));
  const shortForm = /** @type {HTMLFormElement} */ (card.querySelector('.question-card__short'));
  const shortInput = /** @type {HTMLInputElement} */ (card.querySelector('.short-input'));

  if (question.type === 'mcq') {
    shortForm.hidden = true;
    optionsWrap.hidden = false;
    optionsWrap.setAttribute('aria-label', `Đáp án câu ${displayIndex + 1}`);

    question.options.forEach((opt, pos) => {
      const btn = /** @type {HTMLButtonElement} */ (optTpl.content.firstElementChild.cloneNode(true));
      btn.dataset.index = String(opt.index); // chỉ số gốc để chấm điểm

      const labelEl = btn.querySelector('.option__label');
      const textEl = btn.querySelector('.option__text');

      labelEl.textContent = String.fromCharCode(65 + pos); // A, B, C, D luôn theo thứ tự hiển thị
      textEl.textContent = opt.text;

      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        onAnswer?.(question.key, opt.index, card);
      });

      optionsWrap.appendChild(btn);
    });
  } else if (question.type === 'truefalse') {
    shortForm.hidden = true;
    optionsWrap.hidden = false;
    optionsWrap.setAttribute('aria-label', `Các mệnh đề Đúng/Sai câu ${displayIndex + 1}`);
    card._tfAnswers = userAnswer && typeof userAnswer === 'object' ? { ...userAnswer } : {};

    const statements = Array.isArray(question.statements) ? question.statements : [];
    statements.forEach((stmt) => {
      const row = document.createElement('div');
      row.className = 'tf-row';
      row.dataset.stmtId = stmt.id;

      const contentDiv = document.createElement('div');
      contentDiv.className = 'tf-row__content';

      const badgeSpan = document.createElement('span');
      badgeSpan.className = 'tf-row__label';
      badgeSpan.textContent = `${stmt.id})`;

      const textSpan = document.createElement('div');
      textSpan.className = 'tf-row__text math-content';
      textSpan.textContent = stmt.text;

      contentDiv.appendChild(badgeSpan);
      contentDiv.appendChild(textSpan);

      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'tf-row__actions';
      actionsDiv.setAttribute('role', 'radiogroup');
      actionsDiv.setAttribute('aria-label', `Mệnh đề ${stmt.id}`);

      [
        { val: true, label: 'Đúng' },
        { val: false, label: 'Sai' },
      ].forEach(({ val, label }) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tf-btn';
        btn.setAttribute('role', 'radio');
        btn.setAttribute('aria-checked', 'false');
        btn.dataset.stmtId = stmt.id;
        btn.dataset.val = String(val);
        btn.textContent = label;

        btn.addEventListener('click', () => {
          if (btn.disabled) return;
          const nextAns = {
            ...(card._tfAnswers && typeof card._tfAnswers === 'object' ? card._tfAnswers : {}),
            [stmt.id]: val,
          };
          card._tfAnswers = nextAns;
          const allPicked = isAnswered(nextAns, question);
          onAnswer?.(question.key, nextAns, card, { commit: allPicked });
        });

        actionsDiv.appendChild(btn);
      });

      row.appendChild(contentDiv);
      row.appendChild(actionsDiv);
      optionsWrap.appendChild(row);
    });
  } else {
    // Trả lời ngắn
    optionsWrap.hidden = true;
    shortForm.hidden = false;

    if (typeof userAnswer === 'string') {
      shortInput.value = userAnswer;
    }

    // Lưu câu trả lời ngay khi gõ để nếu hết giờ đột ngột vẫn tính điểm
    shortInput.addEventListener('input', () => {
      if (shortInput.readOnly) return;
      onAnswer?.(question.key, shortInput.value, card);
    });

    // Bấm "Xác nhận" hoặc Enter -> kích hoạt chấm tức thì (nếu đang bật chế độ instant)
    shortForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (shortInput.readOnly) return;
      onAnswer?.(question.key, shortInput.value, card, { commit: true });
    });
  }

  // Lời giải (Accordion)
  const accEl = /** @type {HTMLElement} */ (card.querySelector('.accordion'));
  const accInner = /** @type {HTMLElement} */ (card.querySelector('.accordion__inner'));
  accInner.textContent = question.explanation || 'Chưa có lời giải chi tiết cho câu hỏi này.';
  accEl.hidden = true;

  // Áp trạng thái ban đầu
  syncQuestionCardState(card, question, {
    userAnswer,
    revealed,
    showExplanation,
    openExplanation,
    locked,
  });

  renderMath(card);
  return card;
}

/* --------------------------------------------------------------------------
   Cập nhật trạng thái 1 thẻ câu hỏi (không dựng lại DOM)
   -------------------------------------------------------------------------- */

/**
 * Đồng bộ giao diện `.question-card` khi người dùng chọn đáp án hoặc khi lộ kết quả.
 * @param {HTMLElement} card
 * @param {import('../services/data.service.js').Question} question
 * @param {Object} state
 * @param {any}     [state.userAnswer]
 * @param {boolean} [state.revealed=false]
 * @param {boolean} [state.showExplanation=false]
 * @param {boolean} [state.openExplanation=false]
 * @param {boolean} [state.locked=false]
 */
export function syncQuestionCardState(card, question, state = {}) {
  const {
    userAnswer,
    revealed = false,
    showExplanation = false,
    openExplanation = false,
    locked = false,
  } = state;

  const grade = gradeQuestion(question, userAnswer);
  const feedbackEl = /** @type {HTMLElement} */ (card.querySelector('.question-card__feedback'));
  const accEl = /** @type {HTMLElement} */ (card.querySelector('.accordion'));
  const accTrigger = /** @type {HTMLButtonElement} */ (card.querySelector('.accordion__trigger'));

  // 1) data-state trên card (đổi màu viền trái trong components.css)
  if (!revealed) {
    card.dataset.state = grade.isFullyAnswered ? 'answered' : 'unanswered';
  } else if (!grade.answered) {
    card.dataset.state = 'skipped';
  } else {
    card.dataset.state = grade.isCorrect ? 'correct' : 'wrong';
  }

  // 2) Các nút đáp án (MCQ / TrueFalse 4 ý / Trả lời ngắn)
  if (question.type === 'mcq') {
    const buttons = card.querySelectorAll('.option');
    buttons.forEach((btn) => {
      const optIndex = Number(btn.dataset.index);
      const isSelected = grade.answered && Number(userAnswer) === optIndex;
      const isCorrectOpt = optIndex === Number(question.answer);

      btn.setAttribute('aria-checked', isSelected ? 'true' : 'false');
      btn.classList.toggle('is-correct', revealed && isCorrectOpt);
      btn.classList.toggle('is-wrong', revealed && isSelected && !isCorrectOpt);
      btn.disabled = Boolean(locked);
    });
  } else if (question.type === 'truefalse') {
    const ansObj = userAnswer && typeof userAnswer === 'object' ? userAnswer : {};
    card._tfAnswers = { ...ansObj };
    const statements = Array.isArray(question.statements) ? question.statements : [];
    const stmtMap = new Map(statements.map((s) => [s.id, s]));

    card.querySelectorAll('.tf-row').forEach((row) => {
      const stmtId = /** @type {HTMLElement} */ (row).dataset.stmtId;
      const stmt = stmtMap.get(stmtId);
      if (!stmt) return;

      const picked = ansObj[stmtId];
      const hasPicked = typeof picked === 'boolean';
      const isStmtCorrect = hasPicked && picked === stmt.answer;

      row.classList.toggle('is-answered', !revealed && hasPicked);
      row.classList.toggle('is-correct', revealed && isStmtCorrect);
      row.classList.toggle('is-wrong', revealed && !isStmtCorrect);

      row.querySelectorAll('.tf-btn').forEach((btn) => {
        const b = /** @type {HTMLButtonElement} */ (btn);
        const btnVal = b.dataset.val === 'true';
        const isSelected = hasPicked && picked === btnVal;
        const isTarget = stmt.answer === btnVal;

        b.setAttribute('aria-checked', isSelected ? 'true' : 'false');
        b.classList.toggle('is-selected', isSelected);
        b.classList.toggle('is-correct', revealed && isTarget);
        b.classList.toggle('is-wrong', revealed && isSelected && !isTarget);
        b.disabled = Boolean(locked);
      });
    });
  } else {
    // 3) Ô nhập câu trả lời ngắn
    const shortInput = /** @type {HTMLInputElement} */ (card.querySelector('.short-input'));
    const submitBtn = /** @type {HTMLButtonElement} */ (card.querySelector('.question-card__short button'));
    if (shortInput && typeof userAnswer === 'string' && shortInput.value !== userAnswer) {
      shortInput.value = userAnswer;
    }
    if (shortInput) shortInput.readOnly = Boolean(locked);
    if (submitBtn) submitBtn.hidden = Boolean(locked);
  }

  // 4) Dòng phản hồi Đúng/Sai
  if (revealed) {
    feedbackEl.hidden = false;
    feedbackEl.classList.toggle('is-correct', grade.isCorrect);
    feedbackEl.classList.toggle('is-wrong', !grade.isCorrect);

    if (question.type === 'truefalse') {
      if (grade.isCorrect) {
        feedbackEl.textContent = `✓ Chính xác hoàn toàn (${grade.correctCount}/${grade.totalStatements} ý đúng — +${grade.points} điểm)`;
      } else if (!grade.answered) {
        feedbackEl.textContent = `✕ Chưa trả lời (+0 điểm) — Đáp án: ${grade.correctDisplay}`;
      } else {
        feedbackEl.textContent = `Đúng ${grade.correctCount}/${grade.totalStatements} ý (+${grade.points} điểm) — Đáp án: ${grade.correctDisplay}`;
      }
    } else if (grade.isCorrect) {
      feedbackEl.textContent = '✓ Chính xác! (+1 điểm)';
    } else if (!grade.answered) {
      feedbackEl.textContent = `✕ Chưa trả lời — Đáp án đúng: ${grade.correctDisplay}`;
    } else {
      feedbackEl.textContent = `✕ Chưa đúng — Đáp án đúng: ${grade.correctDisplay}`;
    }
    renderMath(feedbackEl);
  } else {
    feedbackEl.hidden = true;
    feedbackEl.textContent = '';
  }

  // 5) Khung lời giải Accordion
  if (showExplanation) {
    accEl.hidden = false;
    if (openExplanation) {
      accTrigger.setAttribute('aria-expanded', 'true');
    }
  } else {
    accEl.hidden = true;
    accTrigger.setAttribute('aria-expanded', 'false');
  }
}

/* --------------------------------------------------------------------------
   Bảng câu hỏi (Palette)
   -------------------------------------------------------------------------- */

/**
 * Render lưới số câu hỏi trong `#quiz-palette`.
 * @param {HTMLElement} paletteEl
 * @param {Array<import('../services/data.service.js').Question>} questions
 * @param {(index: number) => void} onSelect
 */
export function renderPalette(paletteEl, questions, onSelect) {
  if (!paletteEl) return;
  paletteEl.innerHTML = '';

  const frag = document.createDocumentFragment();
  questions.forEach((q, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'palette__item';
    btn.dataset.qid = q.key;
    btn.dataset.index = String(idx);
    btn.textContent = String(idx + 1);
    btn.setAttribute('aria-label', `Đến câu ${idx + 1}`);
    btn.addEventListener('click', () => onSelect?.(idx));
    frag.appendChild(btn);
  });

  paletteEl.appendChild(frag);
}

/**
 * Cập nhật trạng thái màu của các ô trong bảng câu hỏi.
 * @param {HTMLElement} paletteEl
 * @param {Array<import('../services/data.service.js').Question>} questions
 * @param {Object<string, any>} answers
 * @param {Object<string, boolean>} checked
 * @param {number} currentIndex
 * @param {string} viewMode  'scroll' | 'single'
 */
export function updatePaletteState(paletteEl, questions, answers, checked, currentIndex, viewMode) {
  if (!paletteEl) return;
  const items = paletteEl.querySelectorAll('.palette__item');

  items.forEach((btn, idx) => {
    const q = questions[idx];
    if (!q) return;

    const ans = answers[q.key];
    const hasAns = isAnswered(ans, q);
    const isChecked = Boolean(checked?.[q.key]);

    btn.classList.remove('is-answered', 'is-correct', 'is-wrong', 'is-current');

    if (isChecked) {
      const g = gradeQuestion(q, ans);
      btn.classList.add(g.isCorrect ? 'is-correct' : 'is-wrong');
    } else if (hasAns) {
      btn.classList.add('is-answered');
    }

    if (viewMode === 'single' && idx === currentIndex) {
      btn.classList.add('is-current');
    }
  });
}
