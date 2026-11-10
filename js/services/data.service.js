/* ==========================================================================
   js/services/data.service.js — Tải & chuẩn hóa dữ liệu câu hỏi (JSON tĩnh)
   File: data/subjects.json, data/{subjectId}-truong.json, data/{subjectId}-ngoai.json

   SCHEMA CÂU HỎI (trong file JSON):
   - Trắc nghiệm:  { "id", "type": "mcq", "question", "options": ["A", {"text": "Cả A và B", "shuffle": false}],
                     "answer": 0 (index từ 0, hoặc "A".."Z"), "explanation", "image"?, "shuffle"? }
   - Đúng/Sai:     { "id", "type": "truefalse", "question", "answer": true | false, "explanation" }
   - Trả lời ngắn: { "id", "type": "short", "question", "answer": "đáp án" | ["đáp án 1", "đáp án 2"], "explanation" }
   Dev by Thkc
   ========================================================================== */

import { setState, getState, SOURCES } from '../core/state.js';

const DATA_DIR = 'data/';

const TYPE_ALIASES = {
  mcq: 'mcq', multiple_choice: 'mcq', choice: 'mcq',
  truefalse: 'truefalse', true_false: 'truefalse', tf: 'truefalse',
  short: 'short', short_answer: 'short', fill: 'short', fill_blank: 'short',
};

/** Cache theo file: "toan-truong" -> Question[] đã chuẩn hóa */
const fileCache = new Map();

/**
 * @typedef {Object} QuestionOption
 * @property {string}  text
 * @property {boolean} shuffle  false = khóa vị trí khi xáo
 * @property {number}  index    Vị trí gốc (dùng để chấm điểm sau khi xáo)
 */

/**
 * @typedef {Object} Question
 * @property {string} key          Định danh duy nhất toàn app: "{subject}:{source}:{id}"
 * @property {string} id
 * @property {'mcq'|'truefalse'|'short'} type
 * @property {string} subjectId
 * @property {'truong'|'ngoai'} source
 * @property {string} question
 * @property {string|null} image
 * @property {QuestionOption[]} options   Rỗng với câu 'short'
 * @property {number|string[]} answer     Index gốc (mcq/truefalse) hoặc danh sách đáp án (short)
 * @property {string} explanation
 * @property {boolean} shuffle            false = khóa vị trí câu khi xáo câu hỏi
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
   Môn học
   -------------------------------------------------------------------------- */

/**
 * Tải danh sách môn vào state.subjects.
 * @returns {Promise<Array<{id: string, name: string, icon: string}>>}
 */
export async function loadSubjects() {
  const raw = await fetchJson(`${DATA_DIR}subjects.json`);
  if (!Array.isArray(raw)) throw new Error('subjects.json phải là một mảng');

  const subjects = raw
    .filter((s) => s && /^[a-z0-9-]+$/.test(s.id) && typeof s.name === 'string')
    .map((s) => ({ id: s.id, name: s.name.trim(), icon: s.icon || '📘' }));

  setState('subjects', subjects);
  return subjects;
}

/** @param {string} id */
export function getSubjectById(id) {
  return getState('subjects').find((s) => s.id === id) || null;
}

/* --------------------------------------------------------------------------
   Câu hỏi
   -------------------------------------------------------------------------- */

/**
 * Tải câu hỏi theo môn + nguồn. 'all' gộp cả 2 file; 1 file lỗi vẫn dùng file còn lại.
 * Trả về BẢN SAO để việc xáo trộn không làm hỏng cache.
 * @param {string} subjectId
 * @param {'truong'|'ngoai'|'all'} source
 * @returns {Promise<Question[]>}
 */
export async function loadQuestions(subjectId, source) {
  const sources = source === SOURCES.ALL ? [SOURCES.TRUONG, SOURCES.NGOAI] : [source];
  const results = await Promise.allSettled(sources.map((src) => loadFile(subjectId, src)));

  const questions = [];
  const errors = [];
  results.forEach((r) => (r.status === 'fulfilled' ? questions.push(...r.value) : errors.push(r.reason)));

  if (errors.length === results.length) throw errors[0];
  if (errors.length) console.warn('[data] Một số nguồn tải lỗi:', errors);

  return structuredClone(questions);
}

/**
 * Đếm số câu (dùng hiển thị trên trang chủ). Không throw.
 * @returns {Promise<number|null>} null nếu tải lỗi
 */
export async function countQuestions(subjectId, source) {
  try {
    return (await loadQuestions(subjectId, source)).length;
  } catch (err) {
    console.warn('[data] Đếm câu hỏi lỗi:', err);
    return null;
  }
}

/**
 * Tải + chuẩn hóa 1 file JSON (có cache).
 * @param {string} subjectId
 * @param {'truong'|'ngoai'} source
 * @returns {Promise<Question[]>}
 */
async function loadFile(subjectId, source) {
  const cacheKey = `${subjectId}-${source}`;
  if (fileCache.has(cacheKey)) return fileCache.get(cacheKey);

  const raw = await fetchJson(`${DATA_DIR}${cacheKey}.json`);
  if (!Array.isArray(raw)) throw new Error(`${cacheKey}.json phải là một mảng`);

  const seen = new Set();
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

  fileCache.set(cacheKey, list);
  return list;
}

/* --------------------------------------------------------------------------
   Chuẩn hóa & kiểm tra dữ liệu
   -------------------------------------------------------------------------- */

/**
 * @param {any} raw
 * @param {{subjectId: string, source: string, index: number, file: string}} ctx
 * @returns {Question|null} null nếu dữ liệu sai (bỏ qua + cảnh báo)
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

  const base = {
    key: `${ctx.subjectId}:${ctx.source}:${id}`,
    id,
    type,
    subjectId: ctx.subjectId,
    source: ctx.source,
    question,
    image: typeof raw.image === 'string' && raw.image.trim() ? raw.image.trim() : null,
    explanation: typeof raw.explanation === 'string' ? raw.explanation.trim() : '',
    shuffle: raw.shuffle !== false,
  };

  /* ---- Trắc nghiệm ---- */
  if (type === 'mcq') {
    if (!Array.isArray(raw.options) || raw.options.length < 2) return warn('cần ít nhất 2 "options"');

    const options = raw.options.map((o, idx) =>
      typeof o === 'object' && o !== null
        ? { text: String(o.text ?? ''), shuffle: o.shuffle !== false, index: idx }
        : { text: String(o ?? ''), shuffle: true, index: idx }
    );

    let answer = raw.answer;
    if (typeof answer === 'string' && /^[A-Za-z]$/.test(answer.trim())) {
      answer = answer.trim().toUpperCase().charCodeAt(0) - 65; // "B" -> 1
    }
    answer = Number(answer);
    if (!Number.isInteger(answer) || answer < 0 || answer >= options.length) {
      return warn(`"answer" phải là index 0..${options.length - 1} hoặc chữ cái`);
    }
    return { ...base, options, answer };
  }

  /* ---- Đúng / Sai ---- */
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

  /* ---- Trả lời ngắn ---- */
  const answers = (Array.isArray(raw.answer) ? raw.answer : [raw.answer])
    .filter((a) => typeof a === 'string' || typeof a === 'number')
    .map((a) => String(a).trim())
    .filter(Boolean);
  if (!answers.length) return warn('"answer" của câu trả lời ngắn đang trống');

  return { ...base, options: [], answer: answers };
}
