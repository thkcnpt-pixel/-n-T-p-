/* ==========================================================================
   js/services/data.service.js — Tải & chuẩn hóa dữ liệu câu hỏi (JSON tĩnh)
   - Hỗ trợ cả 2 cấu trúc dữ liệu:
     1) Cấu trúc phẳng (Mảng câu hỏi): dùng cho `*-truong.json`, `vatly-ngoai.json`, `tinhoc-ngoai.json`...
     2) Cấu trúc phân nhánh sâu (Chuyên đề `categories` -> Bài nhỏ `lessons` -> `questions`):
        dùng cho `toan-ngoai.json` (Tổng hợp / Xác suất -> Bài 1, Bài 2...).
   - Có sẵn bộ khung Chuyên đề mặc định (Fallback Skeleton: "Tổng hợp" & "Xác suất")
     cho Toán > Đề ngoài để giao diện chọn danh mục LUÔN hiển thị kể cả khi
     file chưa tải xong hoặc đang rỗng.
   Dev by Thkc
   ========================================================================== */

import { setState, getState, SOURCES } from '../core/state.js';

const DATA_DIR = 'data/';

const TYPE_ALIASES = {
  mcq: 'mcq', multiple_choice: 'mcq', choice: 'mcq',
  truefalse: 'truefalse', true_false: 'truefalse', tf: 'truefalse',
  short: 'short', short_answer: 'short', fill: 'short', fill_blank: 'short',
};

const TYPE_TO_PART = {
  mcq: 1,
  truefalse: 2,
  short: 3,
};

/**
 * Cấu trúc danh mục mặc định bắt buộc cho Toán > Đề ngoài.
 * Đảm bảo UI luôn hiển thị 2 danh mục "Tổng hợp" và "Xác suất" kèm các bài nhỏ
 * ngay cả khi mạng lỗi hoặc file JSON rỗng.
 */
export const DEFAULT_TOAN_NGOAI_CATEGORIES = Object.freeze([
  {
    id: 'tonghop',
    name: 'Tổng hợp',
    icon: '📚',
    description: 'Các đề ôn tập tổng hợp kiến thức Giải tích & Hình học',
    chapters: [
      {
        id: 'chuong_1',
        name: 'Chương 1: Ứng dụng đạo hàm để khảo sát hàm số',
        lessons: [
          { id: 'bai_01', name: 'Bài 01: Mô hình hàm số bậc nhất và hàm bậc hai', questions: [] },
          { id: 'bai_02', name: 'Bài 02: Mô hình hàm số bậc ba', questions: [] },
          { id: 'bai_03', name: 'Bài 03: Mô hình hàm phân thức', questions: [] },
          { id: 'bai_04', name: 'Bài 04: Mô hình hàm số lượng giác', questions: [] },
          { id: 'bai_05', name: 'Bài 05: Mô hình hàm số mũ và logarit', questions: [] },
          { id: 'bai_06', name: 'Bài 06: Mô hình đường tròn - elip - hypebol - parabol', questions: [] },
          { id: 'bai_07', name: 'Bài 07: Ý nghĩa cơ học của đạo hàm', questions: [] },
          { id: 'bai_08', name: 'Bài 08: Một số dạng toán tổng hợp', questions: [] },
        ],
      },
      {
        id: 'chuong_2',
        name: 'Chương 2: Nguyên hàm – Tích phân và ứng dụng',
        lessons: [
          { id: 'bai_01', name: 'Bài 01: Ứng dụng tích phân trong thực tế - Phần 1', questions: [] },
          { id: 'bai_02', name: 'Bài 02: Ứng dụng tích phân trong thực tế - Phần 2', questions: [] },
          { id: 'bai_03', name: 'Bài 03: Mô hình tích phân trong bài toán chuyển động', questions: [] },
          { id: 'bai_04', name: 'Bài 04: Mô hình vi phân trong thực tế', questions: [] },
          { id: 'bai_05', name: 'Bài 05: Diện tích hình thang cong - Phần 1', questions: [] },
          { id: 'bai_06', name: 'Bài 06: Diện tích hình thang cong - Phần 2', questions: [] },
          { id: 'bai_07', name: 'Bài 07: Thể tích của khối tròn xoay - Phần 1', questions: [] },
          { id: 'bai_08', name: 'Bài 08: Thể tích của khối tròn xoay - Phần 2', questions: [] },
          { id: 'bai_09', name: 'Bài 09: Thể tích của một vật thể', questions: [] },
          { id: 'bai_10', name: 'Bài 10: Một số dạng tích phân khác', questions: [] },
        ],
      },
      {
        id: 'chuong_3',
        name: 'Chương 3: Tổ hợp – Xác suất',
        lessons: [
          { id: 'bai_01', name: 'Bài 01: Bài toán đếm tư duy - Phần 1', questions: [] },
          { id: 'bai_02', name: 'Bài 02: Bài toán đếm tư duy - Phần 2', questions: [] },
          { id: 'bai_03', name: 'Bài 03: Xác suất trong bài toán đếm', questions: [] },
          { id: 'bai_04', name: 'Bài 04: Xác suất trò chơi', questions: [] },
          { id: 'bai_05', name: 'Bài 05: Phép cộng và phép nhân xác suất', questions: [] },
          { id: 'bai_06', name: 'Bài 06: Bài toán chia kẹo Euler và công thức Bernoulli', questions: [] },
          { id: 'bai_07', name: 'Bài 07: Xác suất có điều kiện và công thức Bayes - Phần 1', questions: [] },
          { id: 'bai_08', name: 'Bài 08: Xác suất có điều kiện và công thức Bayes - Phần 2', questions: [] },
        ],
      },
      {
        id: 'chuong_4',
        name: 'Chương 4: Hệ phương trình, lý thuyết đồ thị, dãy số và tài chính',
        lessons: [
          { id: 'bai_01', name: 'Bài 01: Quy hoạch tuyến tính', questions: [] },
          { id: 'bai_02', name: 'Bài 02: Ứng dụng hệ phương trình, hệ bất phương trình', questions: [] },
          { id: 'bai_03', name: 'Bài 03: Ứng dụng của lý thuyết đồ thị', questions: [] },
          { id: 'bai_04', name: 'Bài 04: Dãy số - Cấp số cộng - Cấp số nhân và giới hạn', questions: [] },
          { id: 'bai_05', name: 'Bài 05: Ứng dụng toán học trong tài chính', questions: [] },
        ],
      },
      {
        id: 'chuong_5',
        name: 'Chương 5: Phương pháp tọa độ trong không gian',
        lessons: [
          { id: 'bai_01', name: 'Bài 01: Một số bài toán vectơ thường gặp', questions: [] },
          { id: 'bai_02', name: 'Bài 02: Mô hình vectơ trong không gian', questions: [] },
          { id: 'bai_03', name: 'Bài 03: Mô hình vectơ trong không gian có yếu tố cực trị', questions: [] },
          { id: 'bai_04', name: 'Bài 04: Viết phương trình mặt cầu', questions: [] },
          { id: 'bai_05', name: 'Bài 05: Viết phương trình mặt phẳng', questions: [] },
          { id: 'bai_06', name: 'Bài 06: Viết phương trình đường thẳng', questions: [] },
          { id: 'bai_07', name: 'Bài 07: Mô hình đường thẳng – mặt phẳng – mặt cầu trong hệ Oxyz', questions: [] },
          { id: 'bai_08', name: 'Bài 08: Bài toán cực trị Oxyz – Phần 1', questions: [] },
          { id: 'bai_09', name: 'Bài 09: Bài toán cực trị Oxyz – Phần 2', questions: [] },
          { id: 'bai_10', name: 'Bài 10: Mô hình Oxyz có yếu tố cực trị', questions: [] },
        ],
      },
      {
        id: 'chuong_6',
        name: 'Chương 6: Góc, khoảng cách và thể tích không gian',
        lessons: [
          { id: 'bai_01', name: 'Bài 01: Góc giữa đường thẳng và mặt phẳng', questions: [] },
          { id: 'bai_02', name: 'Bài 02: Góc nhị diện và góc giữa hai mặt phẳng', questions: [] },
          { id: 'bai_03', name: 'Bài 03: Khoảng cách từ điểm đến mặt phẳng', questions: [] },
          { id: 'bai_04', name: 'Bài 04: Khoảng cách giữa hai đường thẳng chéo nhau', questions: [] },
          { id: 'bai_05', name: 'Bài 05: Thể tích khối đa diện', questions: [] },
          { id: 'bai_06', name: 'Bài 06: Các bài toán liên quan đến khối nón – khối cầu – khối trụ', questions: [] },
        ],
      },
    ],
    lessons: [],
  },
  {
    id: 'xacsuat',
    name: 'Xác suất',
    icon: '🎲',
    description: 'Tổ hợp, Xác suất cổ điển và Xác suất có điều kiện',
    chapters: [],
    lessons: [
      { id: 'bai_01', name: 'Bài 01: Các quy tắc đếm cơ bản', questions: [] },
      { id: 'bai_02', name: 'Bài 02: Xác suất và các quy tắc tính xác suất', questions: [] },
      { id: 'bai_03', name: 'Bài 03: Bài toán xếp chỗ phần 1', questions: [] },
      { id: 'bai_04', name: 'Bài 04: Bài toán xếp chỗ phần 2', questions: [] },
      { id: 'bai_05', name: 'Bài 05: Hoán vị vòng tròn', questions: [] },
      { id: 'bai_06', name: 'Bài 06: Bài toán chia kẹo Euler', questions: [] },
    ],
  },
]);

/**
 * Cấu trúc danh mục mặc định cho Tin học > Đề ngoài (phân loại theo từng trường THPT).
 */
export const DEFAULT_TINHOC_NGOAI_CATEGORIES = Object.freeze([
  {
    id: 'de_cac_truong',
    name: 'Đề thi theo trường THPT',
    icon: '🏫',
    description: 'Đề thi thử & đề ôn tập Tin học phân loại theo từng trường / cụm trường THPT',
    chapters: [],
    lessons: [
      { id: 'chuyen-pho-thong-nang-khieu', name: 'Chuyên Phổ thông Năng khiếu (Đề 01)', questions: [] },
      { id: 'chuyen-pho-thong-nang-khieu-de-02', name: 'Chuyên Phổ thông Năng khiếu (Đề 02)', questions: [] },
      { id: 'cum-5-truong-thpt-ninh-binh', name: 'Cụm 5 trường THPT – Ninh Bình', questions: [] },
      { id: 'cum-7-truong-phia-dong-hai-phong', name: 'Cụm 7 trường phía Đông – Hải Phòng (Đề 01)', questions: [] },
      { id: 'cum-7-truong-phia-dong-hai-phong-de-02', name: 'Cụm 7 trường phía Đông – Hải Phòng (Đề 02)', questions: [] },
      { id: 'cum-chuyen-mon-so-10-dak-lak', name: 'Cụm chuyên môn số 10 – Đắk Lắk (Đề 01)', questions: [] },
      { id: 'cum-chuyen-mon-so-10-dak-lak-de-02', name: 'Cụm chuyên môn số 10 – Đắk Lắk (Đề 02)', questions: [] },
      { id: 'cum-chuyen-mon-so-2-dak-lak', name: 'Cụm chuyên môn số 2 – Đắk Lắk', questions: [] },
      { id: 'cum-chuyen-mon-so-3-dak-lak', name: 'Cụm chuyên môn số 3 – Đắk Lắk', questions: [] },
      { id: 'cum-chuyen-mon-so-8-dak-lak', name: 'Cụm chuyên môn số 8 – Đắk Lắk', questions: [] },
      { id: 'cum-ha-tinh-nghe-an', name: 'Cụm trường THPT Hà Tĩnh – Nghệ An', questions: [] },
      { id: 'cum-truong-bac-lao-cai', name: 'Cụm trường Bắc Lào Cai', questions: [] },
      { id: 'cum-truong-thpt-so-8-ha-noi', name: 'Cụm trường THPT số 8 – Hà Nội', questions: [] },
      { id: 'lien-truong-thpt', name: 'Liên trường THPT', questions: [] },
      { id: 'lien-truong-thpt-ha-noi', name: 'Liên trường THPT – Hà Nội', questions: [] },
      { id: 'thpt-b-nguyen-khuyen', name: 'THPT B Nguyễn Khuyến', questions: [] },
      { id: 'thpt-binh-khanh', name: 'THPT Bình Khánh', questions: [] },
      { id: 'thpt-chu-van-an-gia-nghia', name: 'THPT Chu Văn An – Gia Nghĩa', questions: [] },
      { id: 'thpt-chuyen-hung-vuong', name: 'THPT Chuyên Hùng Vương (Đề 01)', questions: [] },
      { id: 'thpt-chuyen-hung-vuong-de-02', name: 'THPT Chuyên Hùng Vương (Đề 02)', questions: [] },
      { id: 'thpt-chuyen-le-khiet', name: 'THPT Chuyên Lê Khiết', questions: [] },
      { id: 'thpt-chuyen-le-quy-don', name: 'THPT Chuyên Lê Quý Đôn', questions: [] },
      { id: 'thpt-chuyen-luong-van-chanh', name: 'THPT Chuyên Lương Văn Chánh – Phú Yên (Đề 01)', questions: [] },
      { id: 'thpt-chuyen-luong-van-chanh-de-02', name: 'THPT Chuyên Lương Văn Chánh – Phú Yên (Đề 02)', questions: [] },
      { id: 'thpt-chuyen-quang-trung', name: 'THPT Chuyên Quang Trung', questions: [] },
      { id: 'thpt-hoang-van-thu', name: 'THPT Hoàng Văn Thụ', questions: [] },
      { id: 'thpt-le-thanh-tong', name: 'THPT Lê Thánh Tông (Đề 01)', questions: [] },
      { id: 'thpt-le-thanh-tong-de-02', name: 'THPT Lê Thánh Tông (Đề 02)', questions: [] },
      { id: 'thpt-le-thuy', name: 'THPT Lệ Thủy', questions: [] },
      { id: 'thpt-ly-son', name: 'THPT Lý Sơn – Quảng Ngãi', questions: [] },
      { id: 'thpt-ly-tu-trong', name: 'THPT Lý Tự Trọng', questions: [] },
      { id: 'thpt-marie-curie', name: 'THPT Marie Curie', questions: [] },
      { id: 'thpt-nguyen-binh-khiem', name: 'THPT Nguyễn Bỉnh Khiêm', questions: [] },
      { id: 'thpt-nguyen-quang-thieu', name: 'THPT Nguyễn Quang Thiệu', questions: [] },
      { id: 'thpt-nguyen-van-cu', name: 'THPT Nguyễn Văn Cừ', questions: [] },
      { id: 'thpt-nguyen-van-troi', name: 'THPT Nguyễn Văn Trỗi', questions: [] },
      { id: 'thpt-pham-van-sang', name: 'THPT Phạm Văn Sáng (Đề 01)', questions: [] },
      { id: 'thpt-pham-van-sang-de-02', name: 'THPT Phạm Văn Sáng (Đề 02)', questions: [] },
      { id: 'thpt-phan-boi-chau', name: 'THPT Phan Bội Châu – Phú Yên', questions: [] },
      { id: 'thpt-phuc-loi', name: 'THPT Phúc Lợi', questions: [] },
      { id: 'thpt-tam-phuoc', name: 'THPT Tam Phước', questions: [] },
      { id: 'thpt-thanh-my-tay', name: 'THPT Thạnh Mỹ Tây – An Giang', questions: [] },
      { id: 'thpt-tran-hung-dao', name: 'THPT Trần Hưng Đạo (Đề 01)', questions: [] },
      { id: 'thpt-tran-hung-dao-de-02', name: 'THPT Trần Hưng Đạo (Đề 02)', questions: [] },
      { id: 'thpt-tran-van-quan', name: 'THPT Trần Văn Quan – Vũng Tàu', questions: [] },
      { id: 'thpt-trung-van', name: 'THPT Trung Văn', questions: [] },
      { id: 'thpt-van-quan', name: 'THPT Văn Quán – Vĩnh Phúc', questions: [] },
      { id: 'thpt-vo-thi-sau', name: 'THPT Võ Thị Sáu', questions: [] },
      { id: 'truong-ptdtnt-thpt-binh-phuoc', name: 'Trường PTDTNT THPT Bình Phước', questions: [] },
    ],
  },
]);

/**
 * Cấu trúc danh mục mặc định cho Vật lí > Đề ngoài (Bộ 12 đề thi thử).
 */
export const DEFAULT_VATLY_NGOAI_CATEGORIES = Object.freeze([
  {
    id: 'de_vatly_ngoai',
    name: 'Đề thi thử Vật lí',
    icon: '⚡',
    description: 'Bộ 12 đề thi thử Vật lí (Đề số 7 – Đề số 18)',
    chapters: [],
    lessons: [
      { id: 'de-so-7-to-4', name: 'Đề số 7 – Tổ 4', questions: [] },
      { id: 'de-so-8-to-5', name: 'Đề số 8 – Tổ 5', questions: [] },
      { id: 'de-so-9-to-6', name: 'Đề số 9 – Tổ 6', questions: [] },
      { id: 'de-so-10-to-6', name: 'Đề số 10 – Tổ 6', questions: [] },
      { id: 'de-so-11-to-7', name: 'Đề số 11 – Tổ 7', questions: [] },
      { id: 'de-so-12-to-7', name: 'Đề số 12 – Tổ 7', questions: [] },
      { id: 'de-so-13-to-8', name: 'Đề số 13 – Tổ 8', questions: [] },
      { id: 'de-so-14-to-8', name: 'Đề số 14 – Tổ 8', questions: [] },
      { id: 'de-so-15-to-9', name: 'Đề số 15 – Tổ 9', questions: [] },
      { id: 'de-so-16-to-9', name: 'Đề số 16 – Tổ 9', questions: [] },
      { id: 'de-so-17-to-10', name: 'Đề số 17 – Tổ 10', questions: [] },
      { id: 'de-so-18-to-10', name: 'Đề số 18 – Tổ 10', questions: [] },
    ],
  },
]);

/**
 * Cache theo file:
 * "toan-truong" -> { kind: 'flat', questions: Question[], categories: [] }
 * "toan-ngoai"  -> { kind: 'nested', questions: Question[], categories: CategoryNode[] }
 */
const fileCache = new Map();

/**
 * @typedef {Object} QuestionOption
 * @property {string}  text
 * @property {boolean} shuffle  false = khóa vị trí khi xáo
 * @property {number}  index    Vị trí gốc (dùng để chấm điểm sau khi xáo)
 */

/**
 * @typedef {Object} Question
 * @property {string} key          Định danh duy nhất toàn app
 * @property {string} id
 * @property {1|2|3}  part         Phần ôn: 1 (MCQ), 2 (Đúng/Sai), 3 (Trả lời ngắn)
 * @property {'mcq'|'truefalse'|'short'} type
 * @property {string} subjectId
 * @property {'truong'|'ngoai'} source
 * @property {string|null} [categoryId]
 * @property {string|null} [chapterId]
 * @property {string|null} [lessonId]
 * @property {string} question
 * @property {string|null} image
 * @property {QuestionOption[]} options
 * @property {number|string[]} answer
 * @property {string} explanation
 * @property {boolean} shuffle
 */

/**
 * @typedef {Object} LessonNode
 * @property {string} id
 * @property {string} name
 * @property {Question[]} questions
 */

/**
 * @typedef {Object} ChapterNode
 * @property {string} id
 * @property {string} name
 * @property {LessonNode[]} lessons
 */

/**
 * @typedef {Object} CategoryNode
 * @property {string} id
 * @property {string} name
 * @property {string} icon
 * @property {string} description
 * @property {ChapterNode[]} [chapters]
 * @property {LessonNode[]} lessons
 */

/* --------------------------------------------------------------------------
   Fetch
   -------------------------------------------------------------------------- */

/** @param {string} url */
async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Không tải được ${url} (HTTP ${res.status})`);
  try {
    return await res.json();
  } catch {
    throw new Error(`File ${url} không phải JSON hợp lệ`);
  }
}

/* --------------------------------------------------------------------------
   Môn học & Cấu hình Nguồn đề theo môn
   -------------------------------------------------------------------------- */

/**
 * Tải danh sách 6 môn vào state.subjects.
 * @returns {Promise<Array<{id: string, name: string, icon: string, sources: string[]}>>}
 */
export async function loadSubjects() {
  const raw = await fetchJson(`${DATA_DIR}subjects.json`);
  if (!Array.isArray(raw)) throw new Error('subjects.json phải là một mảng');

  const subjects = raw
    .filter((s) => s && /^[a-z0-9-]+$/.test(s.id) && typeof s.name === 'string')
    .map((s) => {
      const validSources = Array.isArray(s.sources)
        ? s.sources.filter((src) => src === SOURCES.TRUONG || src === SOURCES.NGOAI)
        : [SOURCES.TRUONG];
      return {
        id: s.id,
        name: s.name.trim(),
        icon: s.icon || '📘',
        sources: validSources.length ? validSources : [SOURCES.TRUONG],
      };
    });

  setState('subjects', subjects);
  return subjects;
}

/** @param {string} id */
export function getSubjectById(id) {
  return getState('subjects').find((s) => s.id === id) || null;
}

/**
 * Kiểm tra tổ hợp Môn + Nguồn đề có sử dụng màn hình phân nhánh Chuyên đề / Trường -> Bài nhỏ hay không.
 * Theo đặc tả: **Toán > Đề ngoài** và **Tin học > Đề ngoài** chuyển qua màn hình 2b.
 * @param {string} subjectId
 * @param {string} source
 * @returns {boolean}
 */
export function requiresCategoryStep(subjectId, source) {
  return (subjectId === 'toan' || subjectId === 'tinhoc' || subjectId === 'vatly') && source === SOURCES.NGOAI;
}

/* --------------------------------------------------------------------------
   Truy xuất Danh mục Chuyên đề & Bài nhỏ (dành cho Toán / Tin học / Vật lí > Đề ngoài)
   -------------------------------------------------------------------------- */

/**
 * Lấy danh sách Chuyên đề / Trường và các Bài nhỏ bên trong.
 * @param {string} subjectId
 * @param {'truong'|'ngoai'} source
 * @returns {Promise<CategoryNode[]>}
 */
export async function loadNestedCategories(subjectId, source) {
  try {
    const cleanSource = source === SOURCES.NGOAI ? SOURCES.NGOAI : SOURCES.TRUONG;
    const parsed = await loadFile(subjectId, cleanSource);
    if (parsed.categories && parsed.categories.length > 0) {
      return structuredClone(parsed.categories);
    }
  } catch (err) {
    console.warn('[data] Không tải được danh mục từ JSON, dùng danh mục mặc định:', err);
  }

  if (subjectId === 'toan' && source === SOURCES.NGOAI) {
    return structuredClone(DEFAULT_TOAN_NGOAI_CATEGORIES);
  }
  if (subjectId === 'tinhoc' && source === SOURCES.NGOAI) {
    return structuredClone(DEFAULT_TINHOC_NGOAI_CATEGORIES);
  }
  if (subjectId === 'vatly' && source === SOURCES.NGOAI) {
    return structuredClone(DEFAULT_VATLY_NGOAI_CATEGORIES);
  }
  return [];
}

/* --------------------------------------------------------------------------
   Câu hỏi & Lọc theo Bài nhỏ / Phần ôn (Part 1, 2, 3)
   -------------------------------------------------------------------------- */

/**
 * @typedef {Object} QuestionFilterOptions
 * @property {number[]} [parts]       Các phần ôn cần lọc: [1, 2, 3]
 * @property {string|null} [categoryId] Mã chuyên đề (VD: 'tonghop' | 'xacsuat')
 * @property {string|null} [chapterId]  Mã chương (VD: 'chuong_6')
 * @property {string|null} [lessonId]   Mã bài nhỏ (VD: 'bai_01' | 'bai_02')
 */

/**
 * Tải câu hỏi theo môn + nguồn ('truong' hoặc 'ngoai'),
 * lọc theo Bài nhỏ (nếu là cấu trúc phân nhánh sâu như Toán > Đề ngoài)
 * và lọc theo Phần ôn (`parts`: 1, 2, 3).
 * Trả về BẢN SAO để việc xáo trộn không làm hỏng cache.
 * @param {string} subjectId
 * @param {'truong'|'ngoai'} source
 * @param {number[]|QuestionFilterOptions} [filterOrParts]
 * @returns {Promise<Question[]>}
 */
export async function loadQuestions(subjectId, source, filterOrParts) {
  const cleanSource = source === SOURCES.NGOAI ? SOURCES.NGOAI : SOURCES.TRUONG;
  const parsed = await loadFile(subjectId, cleanSource);

  const opts = Array.isArray(filterOrParts)
    ? { parts: filterOrParts }
    : (filterOrParts || {});

  const baseQuestions = selectQuestionsFromParsed(parsed, opts.categoryId, opts.chapterId, opts.lessonId);
  const filtered = filterQuestionsByParts(baseQuestions, opts.parts);
  return structuredClone(filtered);
}

/**
 * Trích xuất danh sách câu hỏi từ dữ liệu đã parse (hỗ trợ lọc theo categoryId, chapterId & lessonId).
 * @param {{kind: string, questions: Question[], categories: CategoryNode[]}} parsed
 * @param {string|null} [categoryId]
 * @param {string|null} [chapterId]
 * @param {string|null} [lessonId]
 * @returns {Question[]}
 */
function selectQuestionsFromParsed(parsed, categoryId, chapterId, lessonId) {
  if (!parsed) return [];

  if (parsed.kind === 'nested' && Array.isArray(parsed.categories)) {
    if (categoryId) {
      const cat = parsed.categories.find((c) => c.id === categoryId);
      if (!cat) return [];

      // Trường hợp chuyên đề có phân chia theo Chương (VD: Tổng hợp -> Chương 6 -> Bài 01..06)
      if (Array.isArray(cat.chapters) && cat.chapters.length > 0) {
        if (chapterId) {
          const ch = cat.chapters.find((chItem) => chItem.id === chapterId);
          if (!ch) return [];
          if (lessonId) {
            const les = ch.lessons.find((l) => l.id === lessonId);
            return les ? les.questions : [];
          }
          return ch.lessons.flatMap((l) => l.questions);
        }
        if (lessonId) {
          for (const ch of cat.chapters) {
            const les = ch.lessons.find((l) => l.id === lessonId);
            if (les) return les.questions;
          }
          return [];
        }
        return cat.chapters.flatMap((ch) => ch.lessons.flatMap((l) => l.questions));
      }

      if (lessonId) {
        const les = cat.lessons.find((l) => l.id === lessonId);
        return les ? les.questions : [];
      }
      return cat.lessons.flatMap((l) => l.questions);
    }
  }

  return parsed.questions || [];
}

/**
 * Lọc danh sách câu hỏi theo các phần ôn (1: MCQ, 2: Đúng/Sai, 3: Trả lời ngắn).
 * @param {Question[]} questions
 * @param {number[]} [parts]
 * @returns {Question[]}
 */
export function filterQuestionsByParts(questions, parts) {
  if (!Array.isArray(questions)) return [];
  if (!Array.isArray(parts)) return questions;

  const partSet = new Set(parts.map((p) => Number(p)));
  if (partSet.size === 0) return [];

  return questions.filter((q) => {
    const qPart = Number(q.part) || TYPE_TO_PART[q.type] || 1;
    return partSet.has(qPart);
  });
}

/**
 * Thống kê số lượng câu hỏi theo từng phần (Phần 1, 2, 3) cho 1 môn + nguồn đề (+ chương/bài nhỏ nếu có).
 * Không throw — trả về null nếu file lỗi.
 * @param {string} subjectId
 * @param {'truong'|'ngoai'} source
 * @param {{categoryId?: string|null, chapterId?: string|null, lessonId?: string|null}} [scope]
 * @returns {Promise<{total: number, byPart: {1: number, 2: number, 3: number}}|null>}
 */
export async function getQuestionBreakdown(subjectId, source, scope = {}) {
  try {
    const cleanSource = source === SOURCES.NGOAI ? SOURCES.NGOAI : SOURCES.TRUONG;
    const parsed = await loadFile(subjectId, cleanSource);
    const list = selectQuestionsFromParsed(parsed, scope.categoryId, scope.chapterId, scope.lessonId);
    const byPart = { 1: 0, 2: 0, 3: 0 };
    list.forEach((q) => {
      const p = Number(q.part) || TYPE_TO_PART[q.type] || 1;
      if (p === 1 || p === 2 || p === 3) byPart[p] += 1;
    });
    return { total: list.length, byPart };
  } catch (err) {
    console.warn('[data] Thống kê câu hỏi lỗi:', err);
    return null;
  }
}

/**
 * Đếm tổng số câu theo môn + nguồn (+ phạm vi chuyên đề/bài nhỏ/phần ôn). Không throw.
 * @param {string} subjectId
 * @param {'truong'|'ngoai'} source
 * @param {number[]|QuestionFilterOptions} [filterOrParts]
 * @returns {Promise<number|null>}
 */
export async function countQuestions(subjectId, source, filterOrParts) {
  try {
    return (await loadQuestions(subjectId, source, filterOrParts)).length;
  } catch (err) {
    console.warn('[data] Đếm câu hỏi lỗi:', err);
    return null;
  }
}

/* --------------------------------------------------------------------------
   Tải & Chuẩn hóa File JSON (Hỗ trợ cả Phẳng lẫn Lồng nhau)
   -------------------------------------------------------------------------- */

/**
 * @param {string} subjectId
 * @param {'truong'|'ngoai'} source
 * @returns {Promise<{kind: 'flat'|'nested', questions: Question[], categories: CategoryNode[]}>}
 */
async function loadFile(subjectId, source) {
  const cacheKey = `${subjectId}-${source}`;
  if (fileCache.has(cacheKey)) return fileCache.get(cacheKey);

  const raw = await fetchJson(`${DATA_DIR}${cacheKey}.json`);
  const parsed = parseRawFileData(raw, subjectId, source, cacheKey);
  fileCache.set(cacheKey, parsed);
  return parsed;
}

/**
 * Phân tích dữ liệu JSON thô:
 * - Nếu là cấu trúc lồng nhau (`{ categories: [...] }`) hoặc là `toan-ngoai` -> chuẩn hóa cây Chuyên đề -> (Chương) -> Bài nhỏ -> Câu hỏi.
 * - Nếu là mảng phẳng (`[...]`) -> chuẩn hóa danh sách câu hỏi.
 */
function parseRawFileData(raw, subjectId, source, cacheKey) {
  const seen = new Set();

  // Trường hợp 1: Cấu trúc lồng nhau (Chuyên đề -> Chương / Bài nhỏ -> Câu hỏi)
  const rawCategories = !Array.isArray(raw) && raw && Array.isArray(raw.categories)
    ? raw.categories
    : null;

  if (rawCategories || (subjectId === 'toan' && source === SOURCES.NGOAI)) {
    const sourceCats = rawCategories && rawCategories.length > 0
      ? rawCategories
      : DEFAULT_TOAN_NGOAI_CATEGORIES;

    /** @type {CategoryNode[]} */
    const categories = [];
    /** @type {Question[]} */
    const allQuestions = [];

    const parseLessonsList = (rawLessons, catId, chId = null) => {
      /** @type {LessonNode[]} */
      const lessons = [];
      (Array.isArray(rawLessons) ? rawLessons : []).forEach((lesRaw, lIdx) => {
        if (!lesRaw || typeof lesRaw !== 'object') return;
        const lesId = String(lesRaw.id || `bai-${lIdx + 1}`).trim();
        const lesName = String(lesRaw.name || `Bài ${lIdx + 1}`).trim();
        const rawQs = Array.isArray(lesRaw.questions) ? lesRaw.questions : [];

        /** @type {Question[]} */
        const qs = [];
        rawQs.forEach((qRaw, qIdx) => {
          const q = normalizeQuestion(qRaw, {
            subjectId,
            source,
            categoryId: catId,
            chapterId: chId,
            lessonId: lesId,
            index: qIdx,
            file: chId ? `${cacheKey}/${catId}/${chId}/${lesId}` : `${cacheKey}/${catId}/${lesId}`,
          });
          if (!q) return;
          if (seen.has(q.key)) {
            q.key = `${q.key}#${qIdx}`;
          }
          seen.add(q.key);
          qs.push(q);
          allQuestions.push(q);
        });

        lessons.push({ id: lesId, name: lesName, questions: qs });
      });
      return lessons;
    };

    sourceCats.forEach((catRaw, cIdx) => {
      if (!catRaw || typeof catRaw !== 'object') return;
      const catId = String(catRaw.id || `cat-${cIdx + 1}`).trim();
      const catName = String(catRaw.name || `Chuyên đề ${cIdx + 1}`).trim();
      const catIcon = String(catRaw.icon || '📂').trim();
      const catDesc = String(catRaw.description || '').trim();

      /** @type {ChapterNode[]} */
      const chapters = [];
      if (Array.isArray(catRaw.chapters)) {
        catRaw.chapters.forEach((chRaw, chIdx) => {
          if (!chRaw || typeof chRaw !== 'object') return;
          const chId = String(chRaw.id || `chuong-${chIdx + 1}`).trim();
          const chName = String(chRaw.name || `Chương ${chIdx + 1}`).trim();
          const chLessons = parseLessonsList(chRaw.lessons, catId, chId);
          if (chLessons.length > 0) {
            chapters.push({ id: chId, name: chName, lessons: chLessons });
          }
        });
      }

      const lessons = parseLessonsList(catRaw.lessons, catId, null);

      categories.push({
        id: catId,
        name: catName,
        icon: catIcon,
        description: catDesc,
        chapters,
        lessons,
      });
    });

    // Đảm bảo cho Toán > Đề ngoài luôn có đủ 2 danh mục Tổng hợp và Xác suất
    if (subjectId === 'toan' && source === SOURCES.NGOAI) {
      DEFAULT_TOAN_NGOAI_CATEGORIES.forEach((defCat) => {
        if (!categories.some((c) => c.id === defCat.id)) {
          categories.push(structuredClone(defCat));
        }
      });
    }

    return { kind: 'nested', questions: allQuestions, categories };
  }

  // Trường hợp 2: Cấu trúc mảng phẳng chuẩn
  if (!Array.isArray(raw)) {
    throw new Error(`${cacheKey}.json phải là một mảng câu hỏi hoặc object chứa categories`);
  }

  /** @type {Question[]} */
  const list = [];
  raw.forEach((item, i) => {
    const q = normalizeQuestion(item, { subjectId, source, index: i, file: cacheKey });
    if (!q) return;
    if (seen.has(q.key)) {
      console.warn(`[data] ${cacheKey}.json: trùng id "${q.id}" — tự đổi key.`);
      q.key = `${q.key}#${i}`;
    }
    seen.add(q.key);
    list.push(q);
  });

  return { kind: 'flat', questions: list, categories: [] };
}

/**
 * @param {any} raw
 * @param {{subjectId: string, source: string, categoryId?: string, chapterId?: string|null, lessonId?: string, index: number, file: string}} ctx
 * @returns {Question|null}
 */
function normalizeQuestion(raw, ctx) {
  const where = `${ctx.file}.json [#${ctx.index}]`;
  const warn = (msg) => { console.warn(`[data] ${where}: ${msg} — bỏ qua câu này.`); return null; };

  if (!raw || typeof raw !== 'object') return warn('không phải object');

  const type = TYPE_ALIASES[String(raw.type || '').toLowerCase().trim()];
  if (!type) return warn(`type "${raw.type}" không hợp lệ`);

  const question = typeof raw.question === 'string' ? raw.question.trim() : '';
  if (!question) return warn('thiếu nội dung "question"');

  const id = String(raw.id ?? ctx.index + 1);
  const rawPart = Number(raw.part);
  const part = rawPart === 1 || rawPart === 2 || rawPart === 3 ? rawPart : TYPE_TO_PART[type];

  const keyPrefix = ctx.categoryId && ctx.lessonId
    ? (ctx.chapterId
        ? `${ctx.subjectId}:${ctx.source}:${ctx.categoryId}:${ctx.chapterId}:${ctx.lessonId}:${id}`
        : `${ctx.subjectId}:${ctx.source}:${ctx.categoryId}:${ctx.lessonId}:${id}`)
    : `${ctx.subjectId}:${ctx.source}:${id}`;

  const base = {
    key: keyPrefix,
    id,
    part,
    type,
    subjectId: ctx.subjectId,
    source: ctx.source,
    categoryId: ctx.categoryId || null,
    chapterId: ctx.chapterId || null,
    lessonId: ctx.lessonId || null,
    question,
    image: typeof raw.image === 'string' && raw.image.trim() ? raw.image.trim() : null,
    explanation: typeof raw.explanation === 'string' ? raw.explanation.trim() : '',
    shuffle: raw.shuffle !== false,
  };

  /* ---- Phần 1: Trắc nghiệm nhiều lựa chọn ---- */
  if (type === 'mcq') {
    if (!Array.isArray(raw.options) || raw.options.length < 2) return warn('cần ít nhất 2 "options"');

    const options = raw.options.map((o, idx) =>
      typeof o === 'object' && o !== null
        ? { text: String(o.text ?? ''), shuffle: o.shuffle !== false, index: idx }
        : { text: String(o ?? ''), shuffle: true, index: idx }
    );

    let answer = raw.answer;
    if (typeof answer === 'string' && /^[A-Za-z]$/.test(answer.trim())) {
      answer = answer.trim().toUpperCase().charCodeAt(0) - 65;
    }
    answer = Number(answer);
    if (!Number.isInteger(answer) || answer < 0 || answer >= options.length) {
      return warn(`"answer" phải là index 0..${options.length - 1} hoặc chữ cái`);
    }
    return { ...base, options, answer };
  }

  /* ---- Phần 2: Trắc nghiệm Đúng / Sai (Gồm 4 ý a, b, c, d trong 1 câu) ---- */
  if (type === 'truefalse') {
    const parseBool = (val) => {
      const v = typeof val === 'string' ? val.trim().toLowerCase() : val;
      if (v === true || v === 'true' || v === 'đúng' || v === 'dung' || v === 1) return true;
      if (v === false || v === 'false' || v === 'sai' || v === 0) return false;
      return null;
    };

    if (Array.isArray(raw.statements) && raw.statements.length > 0) {
      const defaultIds = ['a', 'b', 'c', 'd'];
      const statements = [];
      for (let i = 0; i < raw.statements.length; i += 1) {
        const s = raw.statements[i];
        if (!s || typeof s !== 'object') continue;
        const sId = String(s.id || defaultIds[i] || `s${i + 1}`).trim().toLowerCase();
        const sText = String(s.text ?? s.question ?? '').trim();
        const sAns = parseBool(s.answer);
        if (sAns === null) return warn(`ý "${sId}" thiếu answer true/false hợp lệ`);
        statements.push({
          id: sId,
          text: sText,
          answer: sAns,
          explanation: typeof s.explanation === 'string' ? s.explanation.trim() : '',
        });
      }
      if (!statements.length) return warn('danh sách "statements" rỗng');
      return {
        ...base,
        options: [],
        statements,
        answer: statements.map((s) => s.answer),
      };
    }

    // Fallback cho câu Đúng/Sai đơn lẻ (nếu có) -> tự bọc thành 1 mệnh đề a)
    const isTrue = parseBool(raw.answer);
    if (isTrue === null) return warn('"answer" phải là true hoặc false');

    return {
      ...base,
      options: [],
      statements: [
        {
          id: 'a',
          text: base.question,
          answer: isTrue,
          explanation: base.explanation,
        },
      ],
      answer: [isTrue],
    };
  }

  /* ---- Phần 3: Trắc nghiệm Trả lời ngắn ---- */
  const answers = (Array.isArray(raw.answer) ? raw.answer : [raw.answer])
    .filter((a) => typeof a === 'string' || typeof a === 'number')
    .map((a) => String(a).trim())
    .filter(Boolean);
  if (!answers.length) return warn('"answer" của câu trả lời ngắn đang trống');

  return { ...base, options: [], answer: answers };
}
