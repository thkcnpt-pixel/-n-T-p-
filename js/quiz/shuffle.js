/* ==========================================================================
   js/quiz/shuffle.js — Thuật toán xáo trộn Fisher-Yates có khóa vị trí
   - Mọi phần tử có thuộc tính `shuffle: false` sẽ được giữ nguyên đúng
     chỉ số (index) ban đầu trong mảng.
   - Chỉ các phần tử được phép xáo trộn mới hoán đổi vị trí cho nhau.
   Dev by Thkc
   ========================================================================== */

/**
 * Xáo trộn mảng nhưng giữ nguyên vị trí các phần tử có `shuffle === false`.
 * Không làm thay đổi mảng truyền vào (trả về mảng mới).
 * @template T
 * @param {T[]} items
 * @param {(item: T) => boolean} [canShuffle] Mặc định: item?.shuffle !== false
 * @returns {T[]}
 */
export function shuffleWithLockedPositions(items, canShuffle = (item) => item?.shuffle !== false) {
  if (!Array.isArray(items) || items.length <= 1) {
    return Array.isArray(items) ? [...items] : [];
  }

  const result = [...items];
  const movableIndices = [];
  const movableValues = [];

  for (let i = 0; i < result.length; i += 1) {
    if (canShuffle(result[i])) {
      movableIndices.push(i);
      movableValues.push(result[i]);
    }
  }

  if (movableValues.length <= 1) return result;

  // Fisher-Yates chuẩn trên tập phần tử được phép di chuyển
  for (let i = movableValues.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = movableValues[i];
    movableValues[i] = movableValues[j];
    movableValues[j] = tmp;
  }

  // Đặt lại vào các vị trí khả dụng, các vị trí shuffle:false giữ nguyên
  for (let k = 0; k < movableIndices.length; k += 1) {
    result[movableIndices[k]] = movableValues[k];
  }

  return result;
}

/**
 * Chuẩn bị danh sách câu hỏi cho phiên làm bài dựa theo cài đặt:
 * - Xáo trộn thứ tự câu hỏi nếu `settings.shuffleQuestions === true`
 *   (tôn trọng `question.shuffle === false`).
 * - Xáo trộn thứ tự đáp án của từng câu MCQ nếu `settings.shuffleOptions === true`
 *   (tôn trọng `option.shuffle === false`, ví dụ "Cả A và B đều đúng").
 *   Lưu ý: mỗi option giữ nguyên `option.index` (chỉ số gốc) nên việc chấm điểm
 *   bằng `question.answer` không bị ảnh hưởng sau khi xáo.
 * @param {Array<Object>} questions
 * @param {{shuffleQuestions?: boolean, shuffleOptions?: boolean}} [settings]
 * @returns {Array<Object>}
 */
export function prepareQuizQuestions(questions, settings = {}) {
  if (!Array.isArray(questions)) return [];

  const { shuffleQuestions = false, shuffleOptions = false } = settings;

  const cloned = questions.map((q) => ({
    ...q,
    options: Array.isArray(q.options) ? q.options.map((opt) => ({ ...opt })) : [],
  }));

  const orderedQuestions = shuffleQuestions
    ? shuffleWithLockedPositions(cloned, (q) => q.shuffle !== false)
    : cloned;

  if (!shuffleOptions) return orderedQuestions;

  return orderedQuestions.map((q) => {
    if (q.type !== 'mcq' || !Array.isArray(q.options) || q.options.length <= 1) {
      return q;
    }
    return {
      ...q,
      options: shuffleWithLockedPositions(q.options, (opt) => opt.shuffle !== false),
    };
  });
}
