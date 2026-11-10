/* ==========================================================================
   js/ui/accordion.js — Đóng/mở mượt mà khung Lời giải (.accordion)
   - Sử dụng event delegation trên `document` nên mọi `.question-card` được
     sinh động ở màn Làm bài hay màn Kết quả đều hoạt động ngay mà không cần
     gắn listener riêng từng thẻ.
   - Kết hợp với quy tắc `grid-template-rows: 0fr -> 1fr` trong `components.css`
     khi thuộc tính `aria-expanded` của `.accordion__trigger` đổi giữa "false" / "true".
   Dev by Thkc
   ========================================================================== */

let initialized = false;

/**
 * Kích hoạt uỷ quyền sự kiện click cho mọi nút `.accordion__trigger`.
 * Gọi 1 lần trong `app.js`.
 */
export function initAccordion() {
  if (initialized) return;
  initialized = true;

  document.addEventListener('click', (e) => {
    const target = /** @type {HTMLElement|null} */ (e.target);
    const trigger = target?.closest?.('.accordion__trigger');
    if (!trigger) return;

    e.preventDefault();
    toggleAccordion(/** @type {HTMLButtonElement} */ (trigger));
  });
}

/**
 * Đảo trạng thái đóng/mở của 1 accordion trigger.
 * @param {HTMLButtonElement} triggerEl
 * @param {boolean} [forceState]
 */
export function toggleAccordion(triggerEl, forceState) {
  if (!triggerEl) return;
  const isExpanded = triggerEl.getAttribute('aria-expanded') === 'true';
  const next = typeof forceState === 'boolean' ? forceState : !isExpanded;
  triggerEl.setAttribute('aria-expanded', next ? 'true' : 'false');
}
