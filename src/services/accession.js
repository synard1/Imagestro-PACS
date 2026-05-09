// src/services/accession.js
import { getConfig } from './config';
const CFG_KEY = 'accession.config'
const SEQ_KEY = 'accession.seq' // map counter per scope (reset policy)

const defaultCfg = {
  // pattern custom — gunakan token di bawah
  pattern: '{ORG}-{YYYY}{MM}{DD}-{SEQ4}',
  // resetPolicy: 'daily' | 'monthly' | 'never'
  resetPolicy: 'daily',
  // padding digit untuk {SEQn} kalau tokennya tanpa n
  seqPadding: 4,
  // kode opsional
  orgCode: 'RS01',
  siteCode: 'RAD',
  // apakah sertakan modality {MOD}
  useModalityInSeqScope: false, // kalau true, SEQ terpisah per modality
  // separator aman: -, _, /
  allowedSeparators: ['-', '_', '/'],
};

/* ---------- config helpers ---------- */
export function loadAccessionConfig() {
  try {
    const raw = localStorage.getItem(CFG_KEY);
    if (!raw) return { ...defaultCfg };
    const parsed = JSON.parse(raw);
    return { ...defaultCfg, ...parsed };
  } catch {
    return { ...defaultCfg };
  }
}

export function saveAccessionConfig(cfg) {
  localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
}

/* ---------- counter helpers ---------- */
function loadSeqMap() {
  try {
    const raw = localStorage.getItem(SEQ_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
function saveSeqMap(m) {
  localStorage.setItem(SEQ_KEY, JSON.stringify(m));
}
export function resetAllCounters() {
  saveSeqMap({});
}

/* ---------- token utils ---------- */
function pad(num, n=4) {
  const s = String(num ?? 0);
  return s.length >= n ? s : '0'.repeat(n - s.length) + s;
}
function randDigits(n=4) {
  return pad(Math.floor(Math.random()*10**n), n);
}
function dateParts(d) {
  const YYYY = String(d.getFullYear());
  const YY = YYYY.slice(-2);
  const MM = String(d.getMonth()+1).padStart(2, '0');
  const DD = String(d.getDate()).padStart(2, '0');
  const doy = Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(),0,0))/86400000);
  const DOY = String(doy).padStart(3,'0');
  const HOUR = String(d.getHours()).padStart(2,'0');
  const MIN = String(d.getMinutes()).padStart(2,'0');
  const SEC = String(d.getSeconds()).padStart(2,'0');
  return { YYYY, YY, MM, DD, DOY, HOUR, MIN, SEC };
}

/* ---------- scope penentuan counter ---------- */
function scopeKey(cfg, d, modality) {
  const { resetPolicy, useModalityInSeqScope } = cfg;
  const { YYYY, MM, DD } = dateParts(d);
  const parts = ['SEQ'];
  if (resetPolicy === 'daily') parts.push(YYYY+MM+DD);
  else if (resetPolicy === 'monthly') parts.push(YYYY+MM);
  else parts.push('ALL'); // never
  if (useModalityInSeqScope && modality) parts.push(modality);
  return parts.join(':');
}

function nextSequence(cfg, d, modality) {
  const map = loadSeqMap();
  const key = scopeKey(cfg, d, modality);
  const cur = map[key] ?? 0;
  map[key] = cur + 1;
  saveSeqMap(map);
  return map[key];
}

/* ---------- parser untuk {SEQn} ---------- */
function seqPaddingFromToken(token, defaultPad) {
  // token contoh: {SEQ4} / {SEQ3} / {SEQ}
  const m = token.match(/^\{SEQ(\d+)?\}$/i);
  if (!m) return defaultPad;
  return m[1] ? parseInt(m[1], 10) : defaultPad;
}

/* ---------- renderer utama ---------- */
export function generateAccession({ modality, date=new Date() } = {}) {
  const cfg = loadAccessionConfig();
  const tokens = tokenize(cfg.pattern);

  // precompute
  const dp = dateParts(date);
  const seqNum = nextSequence(cfg, date, modality);

  let out = '';
  for (const tk of tokens) {
    if (!tk.isToken) { out += sanitizeSep(cfg, tk.text); continue; }
    const T = tk.text.toUpperCase();

    if (T === '{YYYY}') out += dp.YYYY;
    else if (T === '{YY}') out += dp.YY;
    else if (T === '{MM}') out += dp.MM;
    else if (T === '{DD}') out += dp.DD;
    else if (T === '{DOY}') out += dp.DOY;
    else if (T === '{HOUR}') out += dp.HOUR;
    else if (T === '{MIN}') out += dp.MIN;
    else if (T === '{SEC}') out += dp.SEC;
    else if (T === '{MOD}') out += (modality || '');
    else if (T === '{ORG}') out += (cfg.orgCode || '');
    else if (T === '{SITE}') out += (cfg.siteCode || '');
    else if (/^\{RAND(\d+)\}$/.test(T)) {
      const n = parseInt(T.match(/^\{RAND(\d+)\}$/)[1],10);
      out += randDigits(n);
    }
    else if (/^\{SEQ(\d+)?\}$/i.test(T)) {
      const padLen = seqPaddingFromToken(T, cfg.seqPadding || 4);
      out += pad(seqNum, padLen);
    }
    else {
      // token tidak dikenal → keluarkan apa adanya
      out += tk.text;
    }
  }
  return out;
}

// Generate accession using backend-driven config (cached via settingsService)
export async function generateAccessionAsync({ modality, date=new Date() } = {}) {
  const { getAccessionConfig } = await import('./settingsService');
  const cfg = await getAccessionConfig();
  const tokens = tokenize(cfg.pattern);

  const dp = dateParts(date);
  const seqNum = nextSequence(cfg, date, modality);

  let out = '';
  for (const tk of tokens) {
    if (!tk.isToken) { out += sanitizeSep(cfg, tk.text); continue; }
    const T = tk.text.toUpperCase();

    if (T === '{YYYY}') out += dp.YYYY;
    else if (T === '{YY}') out += dp.YY;
    else if (T === '{MM}') out += dp.MM;
    else if (T === '{DD}') out += dp.DD;
    else if (T === '{DOY}') out += dp.DOY;
    else if (T === '{HOUR}') out += dp.HOUR;
    else if (T === '{MIN}') out += dp.MIN;
    else if (T === '{SEC}') out += dp.SEC;
    else if (T === '{MOD}') out += (modality || '');
    else if (T === '{ORG}') out += (cfg.orgCode || '');
    else if (T === '{SITE}') out += (cfg.siteCode || '');
    else if (/^\{RAND(\d+)\}$/.test(T)) {
      const n = parseInt(T.match(/^\{RAND(\d+)\}$/)[1],10);
      out += randDigits(n);
    }
    else if (/^\{SEQ(\d+)?\}$/i.test(T)) {
      const padLen = seqPaddingFromToken(T, cfg.seqPadding || 4);
      out += pad(seqNum, padLen);
    }
    else {
      out += tk.text;
    }
  }
  return out;
}

export async function previewAccession({ modality, date=new Date() } = {}) {
  // Jangan naikkan counter untuk preview → gunakan counter saat ini
  const cfg = loadAccessionConfig();
  
  // Get default modality from config if not provided
  if (!modality) {
    const appConfig = await getConfig();
    modality = appConfig?.modalities?.[0] || 'CT';
  }
  
  const tokens = tokenize(cfg.pattern);
  const dp = dateParts(date);

  // ambil nilai next tanpa update: baca map & +1 tapi tidak simpan
  const map = loadSeqMap();
  const key = scopeKey(cfg, date, modality);
  const nextVal = (map[key] ?? 0) + 1;

  let out = '';
  for (const tk of tokens) {
    if (!tk.isToken) { out += sanitizeSep(cfg, tk.text); continue; }
    const T = tk.text.toUpperCase();

    if (T === '{YYYY}') out += dp.YYYY;
    else if (T === '{YY}') out += dp.YY;
    else if (T === '{MM}') out += dp.MM;
    else if (T === '{DD}') out += dp.DD;
    else if (T === '{DOY}') out += dp.DOY;
    else if (T === '{HOUR}') out += dp.HOUR;
    else if (T === '{MIN}') out += dp.MIN;
    else if (T === '{SEC}') out += dp.SEC;
    else if (T === '{MOD}') out += modality || '';
    else if (T === '{ORG}') out += (cfg.orgCode || '');
    else if (T === '{SITE}') out += (cfg.siteCode || '');
    else if (/^\{RAND(\d+)\}$/.test(T)) {
      const n = parseInt(T.match(/^\{RAND(\d+)\}$/)[1],10);
      out += randDigits(n);
    }
    else if (/^\{SEQ(\d+)?\}$/i.test(T)) {
      const padLen = seqPaddingFromToken(T, cfg.seqPadding || 4);
      out += pad(nextVal, padLen);
    }
    else {
      out += tk.text;
    }
  }
  return out;
}

// [ADD] Preview dari config yang DISEDANG-DIEDIT (tanpa save)
export async function previewAccessionFromConfig(cfg, { modality, date=new Date() } = {}) {
  // Get default modality from config if not provided
  if (!modality) {
    const appConfig = await getConfig();
    modality = appConfig?.modalities?.[0] || 'CT';
  }
  
  const tokens = tokenize(cfg.pattern || '{ORG}-{YYYY}{MM}{DD}-{SEQ4}')
  const dp = dateParts(date)

  // ambil sequence berikutnya TANPA menyimpan
  const map = loadSeqMap()
  const key = scopeKey(cfg, date, modality)
  const nextVal = (map[key] ?? 0) + 1

  let out = ''
  for (const tk of tokens) {
    if (!tk.isToken) { out += sanitizeSep(cfg, tk.text); continue }
    const T = tk.text.toUpperCase()

    if (T === '{YYYY}') out += dp.YYYY
    else if (T === '{YY}') out += dp.YY
    else if (T === '{MM}') out += dp.MM
    else if (T === '{DD}') out += dp.DD
    else if (T === '{DOY}') out += dp.DOY
    else if (T === '{HOUR}') out += dp.HOUR
    else if (T === '{MIN}') out += dp.MIN
    else if (T === '{SEC}') out += dp.SEC
    else if (T === '{MOD}') out += modality || ''
    else if (T === '{ORG}') out += (cfg.orgCode || '')
    else if (T === '{SITE}') out += (cfg.siteCode || '')
    else if (/^\{RAND(\d+)\}$/.test(T)) {
      const n = parseInt(T.match(/^\{RAND(\d+)\}$/)[1],10)
      out += String(Math.floor(Math.random()*10**n)).padStart(n, '0')
    }
    else if (/^\{SEQ(\d+)?\}$/i.test(T)) {
      const padLen = seqPaddingFromToken(T, cfg.seqPadding || 4)
      out += String(nextVal).padStart(padLen, '0')
    }
    else out += tk.text
  }
  return out
}


/* ---------- utils ---------- */
function tokenize(pattern) {
  const out = [];
  const re = /(\{[^}]+\})/g;
  let last = 0, m;
  while ((m = re.exec(pattern)) !== null) {
    if (m.index > last) out.push({ isToken:false, text: pattern.slice(last, m.index) });
    out.push({ isToken:true, text: m[1] });
    last = re.lastIndex;
  }
  if (last < pattern.length) out.push({ isToken:false, text: pattern.slice(last) });
  return out;
}

/**
 * Generate a deterministic accession number based on order number and index.
 * Useful for ensuring unique IDs across multiple examinations in a single order.
 * 
 * @param {string} orderNumber - The parent order number
 * @param {number} index - The index of the examination (0-based)
 * @param {string} prefix - Optional prefix (default: 'ACC')
 * @returns {string} The deterministic accession number (e.g., ACC-ORD123-1)
 */
export function generateDeterministicAccession(orderNumber, index = 0, prefix = 'ACC') {
  if (!orderNumber) return '';
  const cleanOrderNumber = String(orderNumber).trim();
  return `${prefix}-${cleanOrderNumber}-${index + 1}`;
}

function sanitizeSep(cfg, text) {
  // batasi separator ke daftar yang diizinkan, karakter lain tetap dibiarkan untuk kompatibilitas
  const allowed = new Set(cfg.allowedSeparators || []);
  return text.split('').map(ch => {
    if (['-', '_', '/'].includes(ch)) return allowed.has(ch) ? ch : '-';
    return ch;
  }).join('');
}
