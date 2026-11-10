/* ==========================================================================
   js/ui/settings-modal.js — Popup Cài đặt làm bài & tóm tắt cài đặt
   - Mở/đóng `<dialog id="settings-dialog">`, khóa cuộn nền (`body.is-locked`).
   - Đọc/ghi cấu hình qua `state.js` & `profile.service.js` (tự động đồng bộ
     lên Firestore hoặc xếp vào hàng đợi offline).
   - Render danh sách chip tóm tắt cài đặt (`#settings-summary`) ở Trang chủ.
   Dev by Thkc
   ========================================================================== */

import { getState, subscribe } from '../core/state.js';
import { saveSettings } from '../services/profile.service.js';
import { applyLiveSettingsToQuiz } from '../quiz/controller.js';

let initialized = false;
/** @type {((msg: string, type?: string) => void)|null} */
let toastFn = null;

/**
 * Khởi tạo Popup Cài đặt và tự động cập nhật chip tóm tắt khi `state.settings` đổi.
 * @param {{toast?: (msg: string, type?: string) => void}} [helpers]
 */
export function initSettingsModal({ toast } = {}) {
  toastFn = toast || null;
  if (initialized) return;
  initialized = true;

  const dialog = /** @type {HTMLDialogElement} */ (document.getElementById('settings-dialog'));
  const form = /** @type {HTMLFormElement} */ (document.getElementById('settings-form'));
  const timeInput = /** @type {HTMLInputElement} */ (document.getElementById('set-time'));
  const timeOutput = /** @type {HTMLOutputElement} */ (document.getElementById('set-time-output'));

  // Mọi nút có data-action="open-settings" (ở Trang chủ và Header Làm bài)
  document.addEventListener('click', (e) => {
    const target = /** @type {HTMLElement|null} */ (e.target);
    if (target?.closest?.('[data-action="open-settings"]')) {
      openSettingsModal();
    } else if (target?.closest?.('[data-action="close-settings"]')) {
      closeSettingsModal();
    }
  });

  // Đóng khi bấm vào vùng nền mờ (backdrop) bên ngoài hộp thoại
  dialog?.addEventListener('click', (e) => {
    if (e.target === dialog) closeSettingsModal();
  });

  dialog?.addEventListener('close', () => {
    document.body.classList.remove('is-locked');
  });

  // Cập nhật số phút hiển thị ngay khi kéo thanh trượt
  timeInput?.addEventListener('input', () => {
    updateTimeLabel(Number(timeInput.value), timeOutput);
  });

  // Lưu cài đặt
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const saveBtn = /** @type {HTMLButtonElement} */ (document.getElementById('btn-save-settings'));
    saveBtn?.classList.add('is-loading');

    const fd = new FormData(form);
    const partial = {
      timeLimit: Number(fd.get('timeLimit') ?? 15),
      shuffleQuestions: fd.get('shuffleQuestions') === 'on',
      shuffleOptions: fd.get('shuffleOptions') === 'on',
      viewMode: fd.get('viewMode') === 'single' ? 'single' : 'scroll',
      explainMode: fd.get('explainMode') === 'instant' ? 'instant' : 'after',
    };

    try {
      const { status } = await saveSettings(partial);
      applyLiveSettingsToQuiz();
      closeSettingsModal();

      if (status === 'synced') {
        toastFn?.('Đã lưu & đồng bộ cài đặt.', 'success');
      } else if (status === 'queued') {
        toastFn?.('Đã lưu cài đặt trên máy (sẽ đồng bộ khi có mạng).', 'info');
      }
    } finally {
      saveBtn?.classList.remove('is-loading');
    }
  });

  // Tự động vẽ lại chip tóm tắt mỗi khi settings thay đổi
  subscribe('settings', () => renderSettingsSummary());
  renderSettingsSummary();
}

/** Mở popup và đổ dữ liệu từ `state.settings` vào form. */
export function openSettingsModal() {
  const dialog = /** @type {HTMLDialogElement} */ (document.getElementById('settings-dialog'));
  const form = /** @type {HTMLFormElement} */ (document.getElementById('settings-form'));
  if (!dialog || !form) return;

  const s = getState('settings');
  const timeInput = /** @type {HTMLInputElement} */ (form.elements.namedItem('timeLimit'));
  const timeOutput = /** @type {HTMLOutputElement} */ (document.getElementById('set-time-output'));
  const shuffleQ = /** @type {HTMLInputElement} */ (form.elements.namedItem('shuffleQuestions'));
  const shuffleO = /** @type {HTMLInputElement} */ (form.elements.namedItem('shuffleOptions'));

  if (timeInput) {
    timeInput.value = String(s.timeLimit);
    updateTimeLabel(s.timeLimit, timeOutput);
  }
  if (shuffleQ) shuffleQ.checked = Boolean(s.shuffleQuestions);
  if (shuffleO) shuffleO.checked = Boolean(s.shuffleOptions);

  setRadioValue(form, 'viewMode', s.viewMode);
  setRadioValue(form, 'explainMode', s.explainMode);

  document.body.classList.add('is-locked');
  if (!dialog.open) dialog.showModal();
}

/** Đóng popup Cài đặt. */
export function closeSettingsModal() {
  const dialog = /** @type {HTMLDialogElement} */ (document.getElementById('settings-dialog'));
  if (dialog?.open) dialog.close();
  document.body.classList.remove('is-locked');
}

function updateTimeLabel(minutes, outputEl) {
  if (!outputEl) return;
  outputEl.textContent = minutes > 0 ? String(minutes) : 'Không giới hạn (0)';
}

function setRadioValue(form, name, value) {
  const radios = form.querySelectorAll(`input[name="${name}"]`);
  radios.forEach((r) => {
    r.checked = r.value === value;
  });
}

/**
 * Render danh sách chip tóm tắt cài đặt ở `#settings-summary` trên Trang chủ.
 */
export function renderSettingsSummary() {
  const listEl = document.getElementById('settings-summary');
  if (!listEl) return;

  const s = getState('settings');
  const chips = [
    s.timeLimit > 0 ? `⏱ ${s.timeLimit} phút` : '⏱ Không giới hạn',
    s.viewMode === 'single' ? '📱 Từng câu' : '📜 Cuộn toàn bộ',
    s.shuffleQuestions ? '🔀 Xáo câu hỏi' : '🔢 Giữ thứ tự câu',
    s.shuffleOptions ? '🎲 Xáo đáp án' : '🅰 Giữ thứ tự đáp án',
    s.explainMode === 'instant' ? '💡 Giải thích ngay khi sai' : '💡 Giải thích sau khi nộp',
  ];

  listEl.innerHTML = '';
  const frag = document.createDocumentFragment();
  chips.forEach((text) => {
    const li = document.createElement('li');
    li.className = 'chip';
    li.textContent = text;
    frag.appendChild(li);
  });
  listEl.appendChild(frag);
}
