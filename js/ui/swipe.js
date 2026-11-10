/* ==========================================================================
   js/ui/swipe.js — Thao tác vuốt trái/phải chuyển câu ở chế độ Từng câu
   - Bắt `touchstart` / `touchend` (passive) trên `#quiz-container`.
   - Có ngưỡng khoảng cách ngang tối thiểu (52px), kiểm tra tỷ lệ ngang/dọc
     để không nhầm với cuộn trang dọc, và bỏ qua khi vuốt bên trong công thức
     KaTeX tràn ngang hoặc ô nhập liệu.
   Dev by Thkc
   ========================================================================== */

const MIN_DISTANCE_X = 52;       // px ngang tối thiểu để tính là 1 cú vuốt
const MAX_VERTICAL_RATIO = 0.65; // |dy| / |dx| phải nhỏ hơn ngưỡng này
const MAX_DURATION_MS = 750;     // vuốt quá chậm (giữ ngón tay lâu) sẽ bị bỏ qua

/**
 * Gắn cử chỉ vuốt trái/phải cho vùng câu hỏi.
 * @param {HTMLElement} containerEl  Thường là `#quiz-container`
 * @param {Object} handlers
 * @param {() => void} handlers.onSwipeLeft   Vuốt sang trái -> Câu tiếp theo
 * @param {() => void} handlers.onSwipeRight  Vuốt sang phải -> Câu trước đó
 */
export function initSwipeGesture(containerEl, { onSwipeLeft, onSwipeRight } = {}) {
  if (!containerEl) return;

  let startX = 0;
  let startY = 0;
  let startTime = 0;
  let validStart = false;

  containerEl.addEventListener(
    'touchstart',
    (e) => {
      // Chỉ kích hoạt ở chế độ Từng câu và khi chỉ có 1 ngón tay chạm
      if (containerEl.dataset.mode !== 'single' || e.touches.length !== 1) {
        validStart = false;
        return;
      }

      const target = /** @type {HTMLElement|null} */ (e.target);
      if (shouldIgnoreTarget(target)) {
        validStart = false;
        return;
      }

      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      startTime = Date.now();
      validStart = true;
    },
    { passive: true }
  );

  containerEl.addEventListener(
    'touchend',
    (e) => {
      if (!validStart || containerEl.dataset.mode !== 'single' || e.changedTouches.length !== 1) {
        return;
      }
      validStart = false;

      const duration = Date.now() - startTime;
      if (duration > MAX_DURATION_MS) return;

      const touch = e.changedTouches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);

      if (absX < MIN_DISTANCE_X) return;
      if (absY / absX > MAX_VERTICAL_RATIO) return;

      // Không chuyển câu nếu người dùng đang bôi đen văn bản
      const selection = window.getSelection?.();
      if (selection && String(selection).trim().length > 0) return;

      if (dx < 0) {
        onSwipeLeft?.();
      } else {
        onSwipeRight?.();
      }
    },
    { passive: true }
  );
}

/**
 * Tránh bắt nhầm thao tác vuốt khi người dùng chạm vào input/slider
 * hoặc đang cuộn ngang công thức Toán học `.katex-display` / khối `<pre>`.
 * @param {HTMLElement|null} el
 */
function shouldIgnoreTarget(el) {
  if (!el || typeof el.closest !== 'function') return false;
  if (el.closest('input, textarea, select, range')) return true;

  const scrollableMath = el.closest('.katex-display, pre');
  if (scrollableMath && scrollableMath.scrollWidth > scrollableMath.clientWidth) {
    return true;
  }
  return false;
}
