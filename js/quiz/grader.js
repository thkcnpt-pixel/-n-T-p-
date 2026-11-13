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

/** Thang điểm chuẩn cho câu Đúng/Sai 4 ý: đúng 1 ý = 0.1đ, 2 ý = 0.25đ, 3 ý = 0.5đ, 4 ý = 1.0đ */
const TF_POINTS_MAP = [0, 0.1, 0.25, 0.5, 1.0];

/**
 * Kiểm tra người dùng đã trả lời đầy đủ câu hỏi này chưa (dùng cho thanh tiến độ & Palette).
 * Với câu Đúng/Sai 4 ý: phải chọn đủ cả 4 ý (a, b, c, d) mới tính là đã hoàn thành câu.
 * @param {any} userAnswer
 * @param {import('../services/data.service.js').Question} [question]
 * @returns {boolean}
 */
export function isAnswered(userAnswer, question) {
  if (userAnswer === null || userAnswer === undefined) return false;
  if (typeof userAnswer === 'string') return userAnswer.trim().length > 0;
  if (typeof userAnswer === 'number') return Number.isFinite(userAnswer);
  if (typeof userAnswer === 'object') {
    if (question && Array.isArray(question.statements) && question.statements.length > 0) {
      return question.statements.every((s) => typeof userAnswer[s.id] === 'boolean');
    }
    const boolKeys = Object.keys(userAnswer).filter((k) => typeof userAnswer[k] === 'boolean');
    return boolKeys.length >= 4;
  }
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
 * - MCQ / Short: đúng được 1.0 điểm, sai 0 điểm.
 * - TrueFalse (4 ý a, b, c, d): đúng 1 ý = 0.1đ, 2 ý = 0.25đ, 3 ý = 0.5đ, 4 ý = 1.0đ.
 * @param {import('../services/data.service.js').Question} question
 * @param {any} userAnswer
 * @returns {{
 *   answered: boolean,
 *   isFullyAnswered: boolean,
 *   isCorrect: boolean,
 *   points: number,
 *   maxPoints: number,
 *   correctCount?: number,
 *   totalStatements?: number,
 *   correctDisplay: string
 * }}
 */
export function gradeQuestion(question, userAnswer) {
  if (question.type === 'truefalse' && Array.isArray(question.statements) && question.statements.length > 0) {
    const stmts = question.statements;
    const ansObj = userAnswer && typeof userAnswer === 'object' ? userAnswer : {};
    let answeredCount = 0;
    let correctCount = 0;

    stmts.forEach((s) => {
      const picked = ansObj[s.id];
      if (typeof picked === 'boolean') {
        answeredCount += 1;
        if (picked === s.answer) {
          correctCount += 1;
        }
      }
    });

    const totalStatements = stmts.length;
    const answered = answeredCount > 0;
    const isFullyAnswered = answeredCount === totalStatements;
    const isCorrect = correctCount === totalStatements;

    let points = 0;
    if (totalStatements === 4) {
      points = TF_POINTS_MAP[correctCount] ?? 0;
    } else if (totalStatements > 0) {
      points = Math.round((correctCount / totalStatements) * 100) / 100;
    }

    const correctDisplay = stmts
      .map((s) => `${s.id}) ${s.answer ? 'Đúng' : 'Sai'}`)
      .join(' · ');

    return {
      answered,
      isFullyAnswered,
      isCorrect,
      points,
      maxPoints: 1,
      correctCount,
      totalStatements,
      correctDisplay,
    };
  }

  const answered = isAnswered(userAnswer, question);

  if (question.type === 'mcq') {
    const correctOpt = question.options.find((o) => o.index === question.answer);
    const correctDisplay = correctOpt ? correctOpt.text : '';
    const isCorrect = answered && Number(userAnswer) === Number(question.answer);
    return {
      answered,
      isFullyAnswered: answered,
      isCorrect,
      points: isCorrect ? 1 : 0,
      maxPoints: 1,
      correctDisplay,
    };
  }

  // Câu trả lời ngắn (question.answer là mảng các đáp án chấp nhận)
  const acceptedList = Array.isArray(question.answer) ? question.answer : [question.answer];
  const correctDisplay = acceptedList.join(' / ');
  const isCorrect = answered && acceptedList.some((target) => matchShortKeyword(String(userAnswer), String(target)));

  return {
    answered,
    isFullyAnswered: answered,
    isCorrect,
    points: isCorrect ? 1 : 0,
    maxPoints: 1,
    correctDisplay,
  };
}

/**
 * Chấm toàn bộ bài làm và tổng hợp thống kê cho màn hình Kết quả & Lịch sử.
 * `wrongIds` bao gồm cả câu làm sai / chưa đủ điểm tối đa và câu bỏ trống để tính năng
 * "Chỉ làm lại những câu sai" không bỏ sót câu nào.
 * @param {Array<import('../services/data.service.js').Question>} questions
 * @param {Object<string, any>} answers  Map `question.key` -> câu trả lời
 * @returns {{
 *   total: number,
 *   correct: number,
 *   wrong: number,
 *   unanswered: number,
 *   earnedPoints: number,
 *   score: number,
 *   percent: number,
 *   wrongIds: string[],
 *   details: Object<string, any>
 * }}
 */
export function gradeQuiz(questions, answers = {}) {
  const total = Array.isArray(questions) ? questions.length : 0;
  let correct = 0;
  let wrong = 0;
  let unanswered = 0;
  let rawPoints = 0;
  /** @type {string[]} */
  const wrongIds = [];
  /** @type {Object<string, any>} */
  const details = {};

  for (const q of questions || []) {
    const userAnswer = answers[q.key];
    const res = gradeQuestion(q, userAnswer);
    details[q.key] = { ...res, userAnswer };
    rawPoints += res.points;

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

  const earnedPoints = Math.round(rawPoints * 100) / 100;
  const score = total > 0 ? Math.round((rawPoints / total) * 1000) / 100 : 0;
  const percent = total > 0 ? Math.round((rawPoints / total) * 100) : 0;

  return {
    total,
    correct,
    wrong,
    unanswered,
    earnedPoints,
    score,
    percent,
    wrongIds,
    details,
  };
}
