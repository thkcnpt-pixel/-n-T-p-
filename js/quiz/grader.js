/* ==========================================================================
   js/quiz/grader.js — Chấm điểm 3 dạng câu hỏi & tổng hợp kết quả bài thi
   - MCQ / TrueFalse: so khớp chỉ số gốc (option.index === question.answer).
   - Trả lời ngắn (short): chuẩn hóa siêu nới lỏng (.trim(), .toLowerCase(),
     xóa dấu câu cơ bản, gộp khoảng trắng thừa, chuẩn hóa số thập phân).
     So khớp trùng hoặc chứa từ khóa chuẩn là cho điểm.
   Dev by Thkc
   ========================================================================== */

/**
 * Chuẩn hóa chuỗi câu trả lời ngắn theo đặc tả SRS:
 * - `.trim()`, `.toLowerCase()`, chuẩn hóa Unicode NFC
 * - Đổi dấu phẩy giữa 2 chữ số thành dấu chấm (`3,14` -> `3.14`)
 * - Xóa dấu câu cơ bản (giữ lại chữ cái tiếng Việt có dấu, chữ số, dấu `.`, `-`, `/`, `+`)
 * - Gộp nhiều khoảng trắng liên tiếp thành 1 khoảng trắng
 * @param {any} input
 * @returns {string}
 */
export function normalizeShortAnswer(input) {
  if (input === null || input === undefined) return '';
  return String(input)
    .normalize('NFC')
    .trim()
    .toLowerCase()
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/(?!\b\d+\.\d+\b)\./g, ' ')
    .replace(/[!"#$%&'()*,:;<=>?@[\\\]^_`{|}~…“”‘’«»]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Bỏ dấu tiếng Việt để hỗ trợ so khớp từ khóa ngay cả khi người dùng gõ không dấu.
 * @param {string} str
 * @returns {string}
 */
function stripDiacritics(str) {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');
}

/**
 * Kiểm tra người dùng đã trả lời câu hỏi này chưa.
 * @param {any} userAnswer
 * @returns {boolean}
 */
export function isAnswered(userAnswer) {
  if (userAnswer === null || userAnswer === undefined) return false;
  if (typeof userAnswer === 'string') return userAnswer.trim().length > 0;
  if (typeof userAnswer === 'number') return Number.isFinite(userAnswer);
  return false;
}

/**
 * So khớp câu trả lời ngắn với 1 đáp án mẫu (siêu nới lỏng):
 * 1) Khớp chính xác chuỗi sau khi chuẩn hóa.
 * 2) Nếu cả hai là số hợp lệ (VD: "05" và "5", "3,50" và "3.5") -> so sánh trị số.
 * 3) Khớp không dấu (VD: "ha noi" với "Hà Nội").
 * 4) Nếu đáp án mẫu là từ khóa (>= 2 ký tự, không phải số thuần) nằm trọn
 *    trong câu trả lời của người dùng (VD: trả lời "Đáp án là Bảng tuần hoàn" khớp "bảng tuần hoàn").
 * @param {string} userRaw
 * @param {string} targetRaw
 * @returns {boolean}
 */
function matchShortKeyword(userRaw, targetRaw) {
  const u = normalizeShortAnswer(userRaw);
  const t = normalizeShortAnswer(targetRaw);
  if (!u || !t) return false;

  if (u === t) return true;

  // So sánh số học nếu cả 2 đều biểu diễn 1 số
  const uNum = Number(u.replace(/\s+/g, ''));
  const tNum = Number(t.replace(/\s+/g, ''));
  if (!Number.isNaN(uNum) && !Number.isNaN(tNum) && /^[+-]?\d+(\.\d+)?$/.test(t)) {
    if (Math.abs(uNum - tNum) < 1e-9) return true;
  }

  // Khớp chính xác khi bỏ dấu tiếng Việt
  const uAscii = stripDiacritics(u);
  const tAscii = stripDiacritics(t);
  if (uAscii === tAscii) return true;

  // Khớp chứa từ khóa (chỉ áp dụng cho từ khóa chữ có độ dài >= 2 để tránh dương tính giả với số "1" trong "10")
  if (t.length >= 2 && !/^[+-]?\d+(\.\d+)?$/.test(t)) {
    const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const boundaryRegex = new RegExp(`(^|\\s)${escaped}(\\s|$)`, 'i');
    if (boundaryRegex.test(u)) return true;
  }

  return false;
}

/**
 * Chấm điểm 1 câu hỏi.
 * @param {import('../services/data.service.js').Question} question
 * @param {any} userAnswer  Với MCQ/TrueFalse là chỉ số gốc `option.index` (number), với Short là string
 * @returns {{answered: boolean, isCorrect: boolean, correctDisplay: string}}
 */
export function gradeQuestion(question, userAnswer) {
  const answered = isAnswered(userAnswer);

  if (question.type === 'mcq' || question.type === 'truefalse') {
    const correctOpt = question.options.find((o) => o.index === question.answer);
    const correctDisplay = correctOpt ? correctOpt.text : '';
    const isCorrect = answered && Number(userAnswer) === Number(question.answer);
    return { answered, isCorrect, correctDisplay };
  }

  // Câu trả lời ngắn (question.answer là mảng các đáp án chấp nhận)
  const acceptedList = Array.isArray(question.answer) ? question.answer : [question.answer];
  const correctDisplay = acceptedList.join(' / ');
  const isCorrect = answered && acceptedList.some((target) => matchShortKeyword(String(userAnswer), String(target)));

  return { answered, isCorrect, correctDisplay };
}

/**
 * Chấm toàn bộ bài làm và tổng hợp thống kê cho màn hình Kết quả & Lịch sử.
 * `wrongIds` bao gồm cả câu làm sai và câu bỏ trống để tính năng
 * "Chỉ làm lại những câu sai" không bỏ sót câu chưa làm.
 * @param {Array<import('../services/data.service.js').Question>} questions
 * @param {Object<string, any>} answers  Map `question.key` -> câu trả lời
 * @returns {{
 *   total: number,
 *   correct: number,
 *   wrong: number,
 *   unanswered: number,
 *   score: number,
 *   percent: number,
 *   wrongIds: string[],
 *   details: Object<string, {answered: boolean, isCorrect: boolean, userAnswer: any, correctDisplay: string}>
 * }}
 */
export function gradeQuiz(questions, answers = {}) {
  const total = Array.isArray(questions) ? questions.length : 0;
  let correct = 0;
  let wrong = 0;
  let unanswered = 0;
  /** @type {string[]} */
  const wrongIds = [];
  /** @type {Object<string, any>} */
  const details = {};

  for (const q of questions || []) {
    const userAnswer = answers[q.key];
    const res = gradeQuestion(q, userAnswer);
    details[q.key] = { ...res, userAnswer };

    if (!res.answered) {
      unanswered += 1;
      wrongIds.push(q.key);
    } else if (res.isCorrect) {
      correct += 1;
    } else {
      wrong += 1;
      wrongIds.push(q.key);
    }
  }

  const score = total > 0 ? Math.round((correct / total) * 1000) / 100 : 0;
  const percent = total > 0 ? Math.round((correct / total) * 100) : 0;

  return {
    total,
    correct,
    wrong,
    unanswered,
    score,
    percent,
    wrongIds,
    details,
  };
}
