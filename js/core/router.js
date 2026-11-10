/* ==========================================================================
   js/core/router.js — Điều hướng SPA bằng ẩn/hiện <section data-screen>
   - Tích hợp History API: nút Back của Android/trình duyệt chuyển màn hình
     thay vì thoát app.
   - Leave guard: chặn rời màn hình (VD: đang làm bài) bằng hộp thoại xác nhận.
   - Access control: chặn vào màn hình cần đăng nhập.
   Dev by Thkc
   ========================================================================== */

/** @typedef {'login'|'home'|'quiz'|'result'} ScreenName */

/**
 * @typedef {Object} ScreenHooks
 * @property {(params?: any) => void} [enter]  Gọi sau khi màn hình hiện ra
 * @property {() => void} [leave]              Gọi trước khi màn hình bị ẩn
 */

/** @type {Map<string, {el: HTMLElement, hooks: ScreenHooks}>} */
const screens = new Map();

/** @type {string|null} */
let current = null;

/** @type {null | ((target: string) => boolean | Promise<boolean>)} */
let leaveGuard = null;

/** @type {(target: string) => true | string} */
let accessControl = () => true;

let initialized = false;

/* --------------------------------------------------------------------------
   Khởi tạo
   -------------------------------------------------------------------------- */

/** Quét DOM tìm các màn hình và lắng nghe nút Back. Gọi 1 lần trong app.js. */
export function initRouter() {
  if (initialized) return;
  initialized = true;

  document.querySelectorAll('[data-screen]').forEach((el) => {
    screens.set(el.dataset.screen, { el, hooks: {} });
  });

  window.addEventListener('popstate', handlePopState);
}

/**
 * Đăng ký hook vào/ra cho 1 màn hình.
 * @param {ScreenName} name
 * @param {ScreenHooks} hooks
 */
export function onScreen(name, hooks) {
  const screen = screens.get(name);
  if (!screen) {
    console.warn(`[router] Không tìm thấy màn hình "${name}"`);
    return;
  }
  screen.hooks = { ...screen.hooks, ...hooks };
}

/**
 * Đặt hàm chặn rời màn hình hiện tại. Trả về true để cho phép rời đi.
 * Guard tự động bị xóa sau khi rời màn hình thành công.
 * @param {null | ((target: string) => boolean | Promise<boolean>)} fn
 */
export function setLeaveGuard(fn) {
  leaveGuard = typeof fn === 'function' ? fn : null;
}

/**
 * Đặt hàm kiểm soát truy cập: trả về true nếu được vào,
 * hoặc tên màn hình khác để chuyển hướng (VD: 'login').
 * @param {(target: string) => true | string} fn
 */
export function setAccessControl(fn) {
  accessControl = typeof fn === 'function' ? fn : () => true;
}

/** @returns {string|null} Tên màn hình đang hiển thị */
export function currentScreen() {
  return current;
}

/* --------------------------------------------------------------------------
   Điều hướng
   -------------------------------------------------------------------------- */

/**
 * Chuyển sang màn hình khác.
 * @param {ScreenName} name
 * @param {Object} [opts]
 * @param {any}     [opts.params]        Tham số truyền cho hook enter
 * @param {boolean} [opts.replace=false] Thay entry lịch sử thay vì thêm mới
 * @param {boolean} [opts.force=false]   Bỏ qua leave guard
 * @param {boolean} [opts.fromPop=false] Gọi từ popstate (không đẩy lịch sử)
 * @returns {Promise<boolean>} true nếu chuyển thành công
 */
export async function navigate(name, opts = {}) {
  const { params, replace = false, force = false, fromPop = false } = opts;

  if (!screens.has(name)) {
    console.error(`[router] Màn hình "${name}" không tồn tại`);
    return false;
  }

  // 1) Kiểm soát truy cập (có thể chuyển hướng)
  const access = accessControl(name);
  if (access !== true) {
    if (typeof access === 'string' && access !== name && screens.has(access)) {
      return navigate(access, { replace: true, force: true });
    }
    return false;
  }

  // 2) Cùng màn hình: chỉ gọi lại enter để làm mới dữ liệu
  if (name === current) {
    screens.get(name).hooks.enter?.(params);
    return true;
  }

  // 3) Leave guard
  if (!force && leaveGuard) {
    let allowed = false;
    try {
      allowed = await leaveGuard(name);
    } catch (err) {
      console.error('[router] Leave guard lỗi:', err);
    }
    if (!allowed) return false;
  }
  leaveGuard = null;

  // 4) Rời màn hình cũ
  const prev = current ? screens.get(current) : null;
  if (prev) {
    try { prev.hooks.leave?.(); } catch (err) { console.error('[router] leave lỗi:', err); }
    prev.el.hidden = true;
  }

  // 5) Hiện màn hình mới
  const next = screens.get(name);
  next.el.hidden = false;
  current = name;
  document.body.dataset.screen = name;
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' });

  // 6) Đồng bộ History API
  if (!fromPop) {
    const stateObj = { screen: name };
    if (replace || !history.state?.screen) {
      history.replaceState(stateObj, '');
    } else {
      history.pushState(stateObj, '');
    }
  }

  // 7) Hook enter
  try {
    next.hooks.enter?.(params);
  } catch (err) {
    console.error(`[router] enter "${name}" lỗi:`, err);
  }

  // A11y: chuyển focus vào màn hình mới để screen reader đọc
  if (!next.el.hasAttribute('tabindex')) next.el.setAttribute('tabindex', '-1');
  next.el.focus({ preventScroll: true });

  return true;
}

/* --------------------------------------------------------------------------
   Nút Back / Forward
   -------------------------------------------------------------------------- */

/** @param {PopStateEvent} event */
async function handlePopState(event) {
  const target = event.state?.screen;
  if (!target || target === current || !screens.has(target)) return;

  if (leaveGuard) {
    // Đẩy lại entry hiện tại để "hoàn tác" thao tác Back, rồi hỏi người dùng
    history.pushState({ screen: current }, '');
    let allowed = false;
    try {
      allowed = await leaveGuard(target);
    } catch (err) {
      console.error('[router] Leave guard lỗi:', err);
    }
    if (allowed) await navigate(target, { replace: true, force: true });
    return;
  }

  await navigate(target, { fromPop: true });
}
