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
 * Kiểm tra tổ hợp Môn + Nguồn đề có sử dụng màn hình phân nhánh Chuyên đề -> Bài nhỏ hay không.
 * Theo đặc tả: **Toán > Đề ngoài** bắt buộc chuyển qua màn chọn "Tổng hợp" / "Xác suất" -> Bài nhỏ.
 * @param {string} subjectId
 * @param {string} source
 * @returns {boolean}
 */
export function requiresCategoryStep(subjectId, source) {
  return subjectId === 'toan' && source === SOURCES.NGOAI;
}

/* --------------------------------------------------------------------------
   Truy xuất Danh mục Chuyên đề & Bài nhỏ (dành cho Toán > Đề ngoài)
   -------------------------------------------------------------------------- */

/**
 * Lấy danh sách Chuyên đề (Tổng hợp, Xác suất) và các Bài nhỏ bên trong.
 * LUÔN trả về ít nhất 2 danh mục "Tổng hợp" và "Xác suất" (không bao giờ trả mảng rỗng)
 * để tránh lỗi ẩn mất giao diện khi chưa tải được câu hỏi.
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

  /* ---- Phần 2: Trắc nghiệm Đúng / Sai ---- */
  if (type === 'truefalse') {
    const v = typeof raw.answer === 'string' ? raw.answer.trim().toLowerCase() : raw.answer;
    let isTrue;
    if (v === true || v === 'true' || v === 'đúng' || v === 'dung' || v === 1) isTrue = true;
    else if (v === false || v === 'false' || v === 'sai' || v === 0) isTrue = false;
    else return warn('"answer" phải là true hoặc false');

    return {
      ...base,
      options: [
        { text: 'Đúng', shuffle: false, index: 0 },
        { text: 'Sai', shuffle: false, index: 1 },
      ],
      answer: isTrue ? 0 : 1,
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
