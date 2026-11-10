/* ==========================================================================
   js/ui/smart-header.js — Thanh Header thông minh trên màn hình Làm bài
   - Tự động ẩn (thêm class `.is-hidden`) khi người dùng cuộn trang xuống.
   - Lập tức hiện lại (gỡ `.is-hidden`) khi cuộn ngược lên hoặc ở sát đỉnh trang.
   - Thêm `.is-scrolled` khi đã rời đỉnh trang để tạo bóng đổ nhẹ.
   - Dùng `requestAnimationFrame` + passive scroll listener để mượt 60fps trên mobile.
   Dev by Thkc
   ========================================================================== */

const TOP_THRESHOLD = 48;   // Luôn hiện header khi vị trí cuộn < 48px
const DELTA_THRESHOLD = 8;  // Ngưỡng cuộn tối thiểu để tránh rung trên màn cảm ứng

let lastScrollY = 0;
let ticking = false;
let initialized = false;

/**
 * Khởi tạo theo dõi cuộn cho `#quiz-header`. Gọi 1 lần trong `app.js`.
 */
export function initSmartHeader() {
  if (initialized) return;
  initialized = true;

  lastScrollY = Math.max(0, window.scrollY || 0);

  window.addEventListener(
    'scroll',
    () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(updateHeader);
    },
    { passive: true }
  );
}

/** Đặt lại trạng thái header về hiển thị rõ ràng (gọi khi mới vào màn làm bài). */
export function resetSmartHeader() {
  lastScrollY = Math.max(0, window.scrollY || 0);
  const header = document.getElementById('quiz-header');
  if (!header) return;
  header.classList.remove('is-hidden', 'is-scrolled');
}

function updateHeader() {
  ticking = false;

  // Chỉ xử lý khi đang ở màn hình Làm bài
  if (document.body.dataset.screen !== 'quiz') return;

  const header = document.getElementById('quiz-header');
  if (!header) return;

  const currentY = Math.max(0, window.scrollY || 0);
  const delta = currentY - lastScrollY;

  header.classList.toggle('is-scrolled', currentY > 8);

  if (currentY <= TOP_THRESHOLD) {
    header.classList.remove('is-hidden');
    lastScrollY = currentY;
    return;
  }

  // Bỏ qua các dao động nhỏ dưới ngưỡng DELTA_THRESHOLD
  if (Math.abs(delta) < DELTA_THRESHOLD) return;

  if (delta > 0) {
    // Đang cuộn xuống -> ẩn header nhường chỗ đọc đề
    header.classList.add('is-hidden');
  } else {
    // Đang cuộn ngược lên -> lập tức hiện lại
    header.classList.remove('is-hidden');
  }

  lastScrollY = currentY;
}
