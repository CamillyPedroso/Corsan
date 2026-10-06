window.addEventListener("error", function(event) {
  if (!event.message || event.message === "Script error.") return;
  var box = document.querySelector("#loadNotice");
  if (box) {
    box.textContent = "Erro no painel: " + (event.message || "erro desconhecido");
    box.className = "notice error";
  }
});
const STORAGE_KEY = "painel-exoc-config-v2";
const DB_NAME = "painel-exoc-db";
const DB_STORE = "dados";
const DB_VERSION = 1;
const INTERNAL_MICRO_MAP = {};
const INTERNAL_SERVICE_MAP = {};
const SHEETS_CONFIG_KEY = "painel-exoc-sheets-config-v1";
const DEFAULT_SHEETS_TOKEN = "";
const DEFAULT_SHEETS_URL = String((window.EXOC_CONFIG && window.EXOC_CONFIG.APPS_SCRIPT_URL) || "").trim();
const PRELOADED_TRACKING_STATE = window.PRELOADED_TRACKING_STATE || {};
const SERVICE_GROUP_MAP = window.SERVICE_GROUP_MAP || {};
const PRELOADED_TRACKING_KEY = "painel-exoc-preload-" + PRELOADED_TRACKING_STATE.id;


const state = {
  baseline: [],
  records: [],
  latestKeys: null,
  latestFileName: "",
  baselineFileName: "",
  manualStatus: {},
  duplicateCount: 0,
  history: [],
  microMap: INTERNAL_MICRO_MAP,
  serviceMap: INTERNAL_SERVICE_MAP,
  auxStatus: {
    micro: Object.keys(INTERNAL_MICRO_MAP).length > 0,
    service: Object.keys(INTERNAL_SERVICE_MAP).length > 0,
  },
  filters: {
    search: "",
    status: ["todos"],
    diretoria: ["todos"],
    micro: ["todos"],
    ocorrencia: ["todos"],
    servico: ["todos"],
    grupoServico: ["todos"],
  },
};

const els = {
  notice: document.querySelector("#loadNotice"),
  total: document.querySelector("#totalCount"),
  treated: document.querySelector("#treatedCount"),
  open: document.querySelector("#openCount"),
  progress: document.querySelector("#progressCount"),
  overdue: document.querySelector("#overdueCount"),
  dueSoon: document.querySelector("#dueSoonCount"),
  latestFile: document.querySelector("#latestFile"),
  baselineFile: document.querySelector("#baselineFile"),
  stateFile: document.querySelector("#stateFile"),
  exportState: document.querySelector("#exportState"),
  exportCsv: document.querySelector("#exportCsv"),
  sheetsConfig: document.querySelector("#sheetsConfig"),
  clearData: document.querySelector("#clearData"),
  search: document.querySelector("#searchBox"),
  status: document.querySelector("#statusFilter"),
  diretoria: document.querySelector("#diretoriaFilter"),
  micro: document.querySelector("#microFilter"),
  ocorrencia: document.querySelector("#ocorrenciaFilter"),
  servico: document.querySelector("#servicoFilter"),
  grupoServico: document.querySelector("#grupoServicoFilter"),
  baselineDate: document.querySelector("#baselineDate"),
  latestDate: document.querySelector("#latestDate"),
  duplicateText: document.querySelector("#duplicateText"),
  auxText: document.querySelector("#auxText"),
  viewTitle: document.querySelector("#viewTitle"),
  monthRateCount: document.querySelector("#monthRateCount"),
  monthlyView: document.querySelector("#monthlyView"),
  viewMonthly: document.querySelector("#viewMonthly"),
  monthEligible: document.querySelector("#monthEligible"),
  monthTreated: document.querySelector("#monthTreated"),
  monthPending: document.querySelector("#monthPending"),
  monthRate: document.querySelector("#monthRate"),
  monthlyBody: document.querySelector("#monthlyBody"),
  pivotRow1: document.querySelector("#pivotRow1"),
  pivotRow2: document.querySelector("#pivotRow2"),
  pivotColumn: document.querySelector("#pivotColumn"),
  pivotTable: document.querySelector("#pivotTable"),
  resultText: document.querySelector("#resultText"),
  body: document.querySelector("#tableBody"),
  tableView: document.querySelector("#tableView"),
  chartView: document.querySelector("#chartView"),
  slaView: document.querySelector("#slaView"),
  viewTable: document.querySelector("#viewTable"),
  viewCharts: document.querySelector("#viewCharts"),
  occurrenceBars: document.querySelector("#occurrenceBars"),
  cityBars: document.querySelector("#cityBars"),
  slaBody: document.querySelector("#slaBody"),
};

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => request.result.createObjectStore(DB_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function dbGet(key, fallback) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readonly");
    const request = tx.objectStore(DB_STORE).get(key);
    request.onsuccess = () => resolve(request.result != null ? request.result : fallback);
    request.onerror = () => reject(request.error);
  });
}

async function dbSet(key, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function dbClear() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function sheetsConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem(SHEETS_CONFIG_KEY) || "{}");
    return {
      url: String(DEFAULT_SHEETS_URL || saved.url || "").trim(),
      token: "",
    };
  } catch {
    return { url: DEFAULT_SHEETS_URL, token: "" };
  }
}

function configureSheetsSync() {
  const current = sheetsConfig();
  const url = prompt("Cole a URL /exec do app da Web do Google Apps Script:", current.url);
  if (url === null) return;
  if (url.trim() && !/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url.trim())) {
    setNotice("Link inválido. Use o link do App da Web que começa com https://script.google.com/macros/s/ e termina em /exec.", "error");
    return;
  }
  localStorage.setItem(SHEETS_CONFIG_KEY, JSON.stringify({ url: url.trim() }));
  setNotice("Banco Google configurado. Recarregando dados...", "ok");
  loadSheetsHistory().then((ok) => { if (ok) render(); });
}

function applyDatabasePayload(payload) {
  const remote = fixedDailyHistory(payload && Array.isArray(payload.history) ? payload.history : []);
  const latest = (payload && payload.latest) || (remote.length ? remote[remote.length - 1] : null) || null;
  const currentBase = (payload && payload.currentBase) || (remote.length ? remote[remote.length - 1] : null) || null;
  if (remote.length) state.history = remote;
  if (currentBase && currentBase.records && currentBase.records.length) {
    state.baseline = currentBase.records;
    state.baselineFileName = currentBase.fileName || `Sheets - ${currentBase.dateKey}`;
  }
  if (latest && latest.keys && latest.keys.length) {
    state.latestKeys = new Set(latest.keys || []);
    state.latestFileName = latest.fileName || `Sheets - ${latest.dateKey}`;
  }
  return !!remote.length || !!latest;
}

async function callSheets(body) {
  const config = sheetsConfig();
  if (!config.url) return { ok: false, skipped: true };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const response = await fetch(config.url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(Object.assign({ token: config.token }, body)),
      signal: controller.signal,
      credentials: "omit",
    });
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      return { ok: false, error: "O Apps Script não respondeu em JSON. Confira se a implantação nova está ativa e com acesso para \"Qualquer pessoa\"." };
    }
  } catch (error) {
    return { ok: false, error: error && error.name === "AbortError" ? "O banco Google demorou demais para responder." : "Não consegui falar com o banco Google (rede bloqueada ou link errado)." };
  } finally {
    clearTimeout(timer);
  }
}

let sheetsQueue = Promise.resolve();
function syncSnapshotToSheets(snapshot) {
  sheetsQueue = sheetsQueue.then(async () => {
    const result = await callSheets({ action: "save", snapshot });
    if (result.skipped) return;
    if (!result.ok) setNotice("Não salvou no banco Google: " + (result.error || "erro desconhecido"), "error");
  });
  return sheetsQueue;
}

async function loadSheetsHistory() {
  const result = await callSheets({ action: "history" });
  if (result.skipped) return false;
  if (!result.ok) {
    setNotice("Banco Google: " + (result.error || "erro desconhecido"), "error");
    return false;
  }
  return applyDatabasePayload(result);
}
function esc(value) {
  return String(value != null ? value : "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function normalize(value) {
  return String(value != null ? value : "").trim();
}

function normKey(value) {
  return normalize(value)
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}
function serviceGroupFor(code) {
  const group = SERVICE_GROUP_MAP[normKey(code)] || "";
  return group || "Sem grupo";
}

function findColumn(row, parts) {
  const keys = Object.keys(row);
  return keys.find((key) => {
    const normalized = normKey(key);
    return parts.some((part) => normalized.includes(normKey(part)));
  });
}

function pick(row, names) {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(row, name)) return row[name];
  }
  const wanted = names.map((name) => name.toLowerCase());
  const key = Object.keys(row).find((item) => wanted.includes(item.trim().toLowerCase()));
  return key ? row[key] : "";
}

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function dateKeyFromMs(ms) {
  if (!ms) return "";
  const date = new Date(ms);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function monthKeyFromMs(ms) {
  if (!ms) return "Sem data";
  const date = new Date(ms);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function dayLabel(ms) {
  if (!ms) return "Sem data";
  const date = new Date(ms);
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function pivotDayLabel(ms) {
  if (!ms) return "Sem data";
  const date = new Date(ms);
  const months = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${String(date.getDate()).padStart(2, "0")}/${months[date.getMonth()]}`;
}

function parseExcelDate(value) {
  if (!value) return { display: "", ms: null };
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return { display: value.toLocaleString("pt-BR"), ms: value.getTime() };
  }
  const number = Number(value);
  if (Number.isFinite(number) && number > 1) {
    const dateInfo = new Date(Math.round((number - 25569) * 86400 * 1000));
    dateInfo.setTime(dateInfo.getTime() + dateInfo.getTimezoneOffset() * 60000);
    if (dateInfo.getFullYear() >= 2000) {
      return {
        display: dateInfo.toLocaleString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
        ms: dateInfo.getTime(),
      };
    }
  }
  const txt = normalize(value);
  const br = txt.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  const iso = txt.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  const parsed = br ? new Date(+br[3], +br[2] - 1, +br[1], +(br[4] || 0), +(br[5] || 0), +(br[6] || 0))
    : iso ? new Date(+iso[1], +iso[2] - 1, +iso[3], +(iso[4] || 0), +(iso[5] || 0), +(iso[6] || 0))
    : new Date(value);
  return Number.isNaN(parsed.getTime())
    ? { display: normalize(value), ms: null }
    : { display: parsed.toLocaleString("pt-BR"), ms: parsed.getTime() };
}

function makeKey(record) {
  return [record.solicitacao, record.ligacao, record.codigoServico].map(normalize).join("|");
}

function cleanRows(rows) {
  const cleaned = rows
    .map((row) => {
      const dataSolicitacao = parseExcelDate(pick(row, ["Data Solicitação"]));
      const visitadoEm = parseExcelDate(pick(row, ["Visitado em"]));
      const record = {
        zona: normalize(pick(row, ["Zona"])),
        localidade: normalize(pick(row, ["Localidade"])),
        diretoria: normalize(pick(row, ["Diretoria"])),
        micro: normalize(pick(row, ["Micro"])),
        procxCoi: normalize(pick(row, ["PROCX COI", "ReQ", "COI", "Responsabilidade", "Responsável", "Responsavel"])),
        ligacao: normalize(pick(row, ["Nº Ligação", "No Ligação", "Numero Ligação"])),
        dataSolicitacao: dataSolicitacao.display,
        dataSolicitacaoMs: dataSolicitacao.ms,
        anoSolicitacao: normalize(pick(row, ["Ano Solicitação"])),
        solicitacao: normalize(pick(row, ["Nº Solicitação", "No Solicitação", "Numero Solicitação"])),
        codigoServico: normalize(pick(row, ["Código do Serviço", "Codigo do Serviço"])),
        servico: normalize(pick(row, ["Tipo de Solicitação"])),
        visitadoEm: visitadoEm.display,
        visitadoEmMs: visitadoEm.ms,
        situacao: normalize(pick(row, ["Situação", "Situacao"])),
        comunidade: normalize(pick(row, ["Comunidade"])),
        comunidadeExecutada: normalize(pick(row, ["Solicitações Executadas em Comunidades"])),
        executor: normalize(pick(row, ["Execultor", "Executor"])),
        tipoEncerramento: normalize(pick(row, ["Tipo Encerramento", "Tipo Encerramento "])),
        descricaoEncerramento: normalize(pick(row, ["Descrição Tipo Encerramento", "Descricao Tipo Encerramento"])) || normalize(pick(row, ["Tipo Encerramento", "Tipo Encerramento "])),
      };
      record.grupoServico = serviceGroupFor(record.codigoServico);
      record.key = makeKey(record);
      record.referenceMs = record.visitadoEmMs || record.dataSolicitacaoMs;
      record.referenceDate = record.visitadoEm || record.dataSolicitacao;
      return record;
    })
    .filter((record) => record.solicitacao || record.ligacao || record.servico);

  const map = new Map();
  let duplicates = 0;
  cleaned.forEach((record) => {
    if (!map.has(record.key)) {
      map.set(record.key, record);
      return;
    }
    duplicates += 1;
    const current = map.get(record.key);
    if ((record.referenceMs || 0) > (current.referenceMs || 0)) map.set(record.key, record);
  });

  return { rows: Array.from(map.values()), duplicates, discarded: rows.length - cleaned.length };
}

function dayFromFileName(fileName) {
  const name = String(fileName || "");
  let m = name.match(/(20\d{2})[-_.](\d{2})[-_.](\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = name.match(/(\d{2})[-_.](\d{2})[-_.](20\d{2})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return "";
}

function serviceCode(value) {
  return normKey(value).replace(/\.0+$/, "");
}

// Regras do tratamento EXOC:
// 1) responsabilidade COI pela tabela auxiliar (código do serviço)
// 2) somente encerradas com ocorrência (coluna Situação)
// 3) fora tudo que foi visitado no dia atual da base (eles nunca tratam as do dia)
function applyBusinessRules(rows, referenceDay) {
  const currentDay = referenceDay || todayKey();
  const hasSituacao = rows.some((record) => normalize(record.situacao));
  const enrichedRows = rows
    .map((record) => {
      const microInfo = state.microMap[normKey(record.localidade)] || state.microMap[normKey(record.micro)] || {};
      const code = serviceCode(record.codigoServico);
      const serviceInfo = (code ? state.serviceMap[code] : state.serviceMap[normKey(record.servico)]) || {};
      const svcResp = normalize(serviceInfo.responsabilidade);
      return Object.assign({}, record, {
        diretoria: microInfo.diretoria || record.diretoria || "",
        micro: microInfo.micro || record.localidade || "",
        responsavel: svcResp,
        responsabilidade: svcResp,
        procxCoi: svcResp,
        _semTabela: !svcResp,
        afetaCliente: serviceInfo.afetaCliente || "",
        grupoServico: serviceGroupFor(code || record.servico),
      });
    });
  const f = { semData: 0, outroAno: 0, hoje: 0, semCoi: 0, semTabela: 0, naoEncerrada: 0, semSituacao: !hasSituacao, diaBase: currentDay };
  const out = enrichedRows.filter((record) => {
    if (hasSituacao && !normKey(record.situacao).includes("OCORRENCIA")) { f.naoEncerrada += 1; return false; }
    const date = record.visitadoEmMs ? new Date(record.visitadoEmMs) : null;
    if (!date) { f.semData += 1; return false; }
    if (date.getFullYear() !== 2026) { f.outroAno += 1; return false; }
    if (dateKeyFromMs(record.visitadoEmMs) >= currentDay) { f.hoje += 1; return false; }
    if (record._semTabela) { f.semTabela += 1; return false; }
    if (normKey(record.procxCoi) !== "COI") { f.semCoi += 1; return false; }
    return true;
  });
  out.funnel = f;
  return out;
}


const XLSX_SOURCES = [
  "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js",
];
let xlsxPromise = null;
function ensureXLSX() {
  if (window.XLSX) return Promise.resolve(true);
  if (xlsxPromise) return xlsxPromise;
  xlsxPromise = (async () => {
    for (const url of XLSX_SOURCES) {
      const ok = await new Promise((resolve) => {
        const el = document.createElement("script");
        el.src = url;
        el.onload = () => resolve(true);
        el.onerror = () => { el.remove(); resolve(false); };
        setTimeout(() => resolve(!!window.XLSX), 15000);
        document.head.appendChild(el);
      });
      if (ok && window.XLSX) return true;
    }
    xlsxPromise = null;
    return false;
  })();
  return xlsxPromise;
}

/* Leitor nativo (sem biblioteca externa): .xlsx e .csv */
function gridToRows(grid) {
  const head = (grid.shift() || []).map((h) => String(h != null ? h : "").trim());
  return grid
    .filter((r) => r.some((x) => x !== "" && x !== undefined))
    .map((r) => { const o = {}; head.forEach((h, i) => { if (h) o[h] = r[i] != null ? r[i] : ""; }); return o; });
}
function csvRows(text) {
  const first = text.split(/\r?\n/, 1)[0];
  const d = [";", "\t", ","].sort((a, b) => first.split(b).length - first.split(a).length)[0];
  const grid = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === d) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); grid.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); grid.push(row); }
  return gridToRows(grid);
}
async function unzipXlsx(buffer) {
  const u8 = new Uint8Array(buffer), dv = new DataView(buffer), files = {};
  let e = u8.length - 22;
  while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error("Arquivo .xlsx inválido.");
  let p = dv.getUint32(e + 16, true);
  const n = dv.getUint16(e + 10, true);
  for (let i = 0; i < n; i++) {
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
    const off = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nl));
    const start = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true);
    files[name] = { method, data: u8.subarray(start, start + csize) };
    p += 46 + nl + xl + cl;
  }
  return files;
}
async function zipText(files, name) {
  const f = files[name];
  if (!f) return "";
  let bytes = f.data;
  if (f.method !== 0) {
    const ds = new DecompressionStream("deflate-raw");
    const w = ds.writable.getWriter(); w.write(f.data); w.close();
    bytes = new Uint8Array(await new Response(ds.readable).arrayBuffer());
  }
  return new TextDecoder("utf-8").decode(bytes);
}
async function nativeRows(buffer, name) {
  if (/\.csv$/i.test(name)) return csvRows(new TextDecoder("utf-8").decode(buffer).replace(/^\uFEFF/, ""));
  if (!/\.xlsx$/i.test(name)) {
    throw new Error("Não consegui carregar a biblioteca de Excel (sem internet ou bloqueio de rede). Salve a base como .xlsx ou .csv e tente de novo.");
  }
  const dom = (t) => new DOMParser().parseFromString(t, "application/xml");
  const files = await unzipXlsx(buffer);
  const wb = dom(await zipText(files, "xl/workbook.xml"));
  const rels = dom(await zipText(files, "xl/_rels/workbook.xml.rels"));
  const firstSheet = wb.getElementsByTagName("sheet")[0]; const rid = firstSheet ? firstSheet.getAttribute("r:id") : "";
  const rel = Array.from(rels.getElementsByTagName("Relationship")).find((r) => r.getAttribute("Id") === rid);
  const target = "xl/" + (rel ? rel.getAttribute("Target") : "worksheets/sheet1.xml").replace(/^\//, "").replace(/^xl\//, "");
  const sst = Array.from(dom(await zipText(files, "xl/sharedStrings.xml")).getElementsByTagName("si"))
    .map((si) => Array.from(si.getElementsByTagName("t")).map((t) => t.textContent).join(""));
  const sheet = dom(await zipText(files, target));
  const grid = [];
  for (const row of sheet.getElementsByTagName("row")) {
    const arr = []; let idx = 0;
    for (const c of row.getElementsByTagName("c")) {
      const ref = c.getAttribute("r");
      if (ref) { let n = 0; for (const ch of ref.replace(/\d/g, "")) n = n * 26 + ch.charCodeAt(0) - 64; idx = n - 1; }
      const t = c.getAttribute("t"), v = c.getElementsByTagName("v")[0];
      let val = "";
      if (t === "inlineStr") val = Array.from(c.getElementsByTagName("t")).map((x) => x.textContent).join("");
      else if (v) val = t === "s" ? (sst[+v.textContent] != null ? sst[+v.textContent] : "") : (t === "str" || t === "b" || t === "e") ? v.textContent : Number(v.textContent);
      arr[idx++] = val;
    }
    grid.push(arr);
  }
  return gridToRows(grid);
}
async function sheetRows(buffer, name) {
  if (await ensureXLSX()) {
    if (!state.auxStatus.micro && !state.auxStatus.service) loadInternalAuxiliaries();
    const wb = XLSX.read(buffer, { type: "array", cellDates: false });
    return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
  }
  return nativeRows(buffer, name);
}

async function parseWorkbookFromArrayBuffer(buffer, fileName = "") {
  const raw = await sheetRows(buffer, fileName);
  const cleaned = cleanRows(raw);
  const rows = applyBusinessRules(cleaned.rows, dayFromFileName(fileName) || todayKey());
  return {
    rows,
    duplicates: cleaned.duplicates,
    funnel: Object.assign({ brutas: raw.length, semChave: cleaned.discarded, duplicadas: cleaned.duplicates }, rows.funnel, { final: rows.length }),
  };
}

async function readFile(file) {
  return parseWorkbookFromArrayBuffer(await file.arrayBuffer(), file.name);
}

async function readRawRows(file) {
  return sheetRows(await file.arrayBuffer(), file.name);
}

function buildMicroMap(rows) {
  const map = {};
  rows.forEach((row) => {
    const localidadeCol = findColumn(row, ["localidade", "municipio", "cidade"]);
    const microCol = findColumn(row, ["micro"]);
    const diretoriaCol = findColumn(row, ["diretoria"]);
    const responsavelCol = findColumn(row, ["responsavel", "responsabilidade"]);
    const localidade = normalize(row[localidadeCol]);
    const micro = normalize(row[microCol]) || localidade;
    if (!localidade && !micro) return;
    const item = {
      diretoria: normalize(row[diretoriaCol]),
      micro,
      responsavel: normalize(row[responsavelCol]),
      responsabilidade: normalize(row[responsavelCol]),
    };
    if (localidade) map[normKey(localidade)] = item;
    if (micro) map[normKey(micro)] = item;
  });
  return map;
}

function buildServiceMap(rows) {
  const map = {};
  const seen = {};
  const ambiguous = new Set();
  rows.forEach((row) => {
    const codeCol = findColumn(row, ["codigo", "código", "cod"]);
    const serviceCol = findColumn(row, ["servico", "serviço", "descricao", "descrição"]);
    const respCol = findColumn(row, ["responsavel", "responsabilidade", "area", "área"]);
    const afetaCol = findColumn(row, ["afeta"]);
    const code = normalize(row[codeCol]);
    const service = normalize(row[serviceCol]);
    const item = {
      responsabilidade: normalize(row[respCol]),
      responsavel: normalize(row[respCol]),
      afetaCliente: normalize(row[afetaCol]),
    };
    if (code) map[serviceCode(code)] = item;
    if (service) {
      const k = normKey(service);
      if (k in seen && seen[k] !== item.responsabilidade) ambiguous.add(k);
      seen[k] = item.responsabilidade;
      map[k] = item;
    }
  });
  ambiguous.forEach((k) => delete map[k]);
  return map;
}

function rowsFromEmbeddedWorkbook(base64) {
  if (!base64 || !window.XLSX) return [];
  const workbook = XLSX.read(base64, { type: "base64", cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: "" });
}

function loadInternalAuxiliaries() {
  try {
    const microRows = window.INTERNAL_MICRO_ROWS || [];
    const serviceRows = window.INTERNAL_SERVICE_ROWS || [];
    state.microMap = buildMicroMap(microRows);
    state.serviceMap = buildServiceMap(serviceRows);
    state.auxStatus = {
      micro: Object.keys(state.microMap).length > 0,
      service: Object.keys(state.serviceMap).length > 0,
    };
  } catch {
    state.microMap = {};
    state.serviceMap = {};
    state.auxStatus = { micro: false, service: false };
  }
}

function setNotice(message, type = "") {
  els.notice.className = `notice ${type}`.trim();
  els.notice.textContent = message;
}

async function loadSavedState() {
  localStorage.removeItem("painel-exoc-acompanhamento-v1");
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    state.latestFileName = saved.latestFileName || "";
    state.baselineFileName = saved.baselineFileName || "";
    state.duplicateCount = saved.duplicateCount || 0;
  } catch {
    state.latestFileName = "";
  }
  state.baseline = await dbGet("baseline", []);
  state.manualStatus = await dbGet("manualStatus", {});
  const hasSheets = !!sheetsConfig().url;
  state.history = hasSheets ? [] : fixedDailyHistory(await dbGet("history", []));
  const latestKeys = hasSheets ? null : await dbGet("latestKeys", null);
  state.latestKeys = latestKeys ? new Set(latestKeys) : null;
  await loadSheetsHistory();
}

function normalizeHistoryDateKey(value) {
  if (!value) return "";
  if (typeof value === "string") {
    const iso = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (iso) return iso[1];
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : dateKeyFromMs(date.getTime());
}

function normalizeHistorySnapshots(history) {
  return (history || [])
    .map((snapshot) => Object.assign({}, snapshot, {
      dateKey: normalizeHistoryDateKey(snapshot.dateKey),
      keys: snapshot.keys || (snapshot.records || []).map((record) => record.key),
      records: snapshot.records || [],
    }))
    .filter((snapshot) => snapshot.dateKey)
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}

function fixedDailyHistory(history) {
  const today = todayKey();
  const locked = new Map();
  normalizeHistorySnapshots((PRELOADED_TRACKING_STATE && PRELOADED_TRACKING_STATE.history) || []).forEach((snapshot) => {
    if (snapshot.dateKey < today && !locked.has(snapshot.dateKey)) locked.set(snapshot.dateKey, snapshot);
  });

  const byDay = new Map(locked);
  normalizeHistorySnapshots(history).forEach((snapshot) => {
    if (locked.has(snapshot.dateKey)) return;
    if (!byDay.has(snapshot.dateKey)) {
      byDay.set(snapshot.dateKey, snapshot);
      return;
    }
    const current = byDay.get(snapshot.dateKey);
    const currentAt = Date.parse(current.uploadedAt || "") || Number.MAX_SAFE_INTEGER;
    const incomingAt = Date.parse(snapshot.uploadedAt || "") || Number.MAX_SAFE_INTEGER;
    if (incomingAt < currentAt) byDay.set(snapshot.dateKey, snapshot);
  });
  return Array.from(byDay.values()).sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}
async function applyPreloadedTrackingState() {
  if (!PRELOADED_TRACKING_STATE || !PRELOADED_TRACKING_STATE.id) return;
  if (sheetsConfig().url && state.history.length) return;
  if (localStorage.getItem(PRELOADED_TRACKING_KEY) === "applied") return;
  state.baseline = PRELOADED_TRACKING_STATE.baseline || [];
  state.history = fixedDailyHistory(PRELOADED_TRACKING_STATE.history || []);
  state.latestKeys = new Set(PRELOADED_TRACKING_STATE.latestKeys || []);
  state.latestFileName = PRELOADED_TRACKING_STATE.latestFileName || "";
  state.baselineFileName = PRELOADED_TRACKING_STATE.baselineFileName || "";
  state.duplicateCount = PRELOADED_TRACKING_STATE.duplicateCount || 0;
  state.manualStatus = PRELOADED_TRACKING_STATE.manualStatus || {};
  state.funnel = {
    brutas: (PRELOADED_TRACKING_STATE.summary && PRELOADED_TRACKING_STATE.summary.rawRows) || state.baseline.length,
    semChave: (PRELOADED_TRACKING_STATE.summary && PRELOADED_TRACKING_STATE.summary.discardedRows) || 0,
    duplicadas: PRELOADED_TRACKING_STATE.duplicateCount || 0,
    semData: 0,
    outroAno: 0,
    hoje: 0,
    semCoi: 0,
    semTabela: 0,
    final: state.baseline.length,
  };
  await saveState();
  localStorage.setItem(PRELOADED_TRACKING_KEY, "applied");
}
async function saveState() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        latestFileName: state.latestFileName,
        baselineFileName: state.baselineFileName,
        duplicateCount: state.duplicateCount,
        savedAt: new Date().toISOString(),
      })
    );
  } catch {
    localStorage.removeItem("painel-exoc-acompanhamento-v1");
  }
  await dbSet("baseline", state.baseline);
  await dbSet("manualStatus", state.manualStatus);
  await dbSet("latestKeys", state.latestKeys ? Array.from(state.latestKeys) : null);
  await dbSet("history", state.history);
}

function statusFor(record) {
  if (!state.latestKeys) return "nao-tratado";
  return state.latestKeys.has(record.key) ? "nao-tratado" : "tratado";
}

function deadlineInfo(record) {
  if (!record.referenceMs) return { label: "Sem data", className: "neutral" };
  const diffHours = (record.referenceMs + 24 * 60 * 60 * 1000 - Date.now()) / 36e5;
  if (record.status === "tratado") return { label: "Tratado", className: "ok" };
  if (diffHours < 0) return { label: "Vencido", className: "danger" };
  if (diffHours <= 4) return { label: "Vence em até 4h", className: "warn" };
  return { label: "No prazo", className: "ok" };
}

function decorateRecords() {
  state.records = state.baseline.map((record) => {
    const status = statusFor(record);
    const enriched = Object.assign({}, record, {
      status,
      appearsLatest: state.latestKeys ? state.latestKeys.has(record.key) : true,
      grupoServico: serviceGroupFor(record.codigoServico || record.servico),
    });
    enriched.deadline = deadlineInfo(enriched);
    return enriched;
  });
}

function uniqueSorted(field) {
  return Array.from(new Set(state.records.map((item) => item[field]).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, "pt-BR")
  );
}

function normalizeFilterValues(values) {
  const list = Array.isArray(values) ? values : [values];
  const picked = list.filter((value) => value && value !== "todos");
  return picked.length ? picked : ["todos"];
}

function selectedValues(select) {
  return normalizeFilterValues(Array.from(select.selectedOptions).map((option) => option.value));
}

function setSelectValues(select, values) {
  const selected = normalizeFilterValues(values);
  Array.from(select.options).forEach((option) => {
    option.selected = selected.includes(option.value) || (selected.includes("todos") && option.value === "todos");
  });
  return selectedValues(select);
}

function filterMatches(key, value) {
  const selected = normalizeFilterValues(state.filters[key]);
  return selected.includes("todos") || selected.includes(value);
}

function fillSelect(select, values, firstLabel, selected) {
  const current = selected ? normalizeFilterValues(selected) : selectedValues(select);
  select.innerHTML = `<option value="todos">${firstLabel}</option>`;
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });
  return setSelectValues(select, current);
}

function updateFilterOptions() {
  state.filters.status = setSelectValues(els.status, state.filters.status);
  state.filters.diretoria = fillSelect(els.diretoria, uniqueSorted("diretoria"), "Todas", state.filters.diretoria);
  const dirSel = normalizeFilterValues(state.filters.diretoria);
  const microList = Array.from(new Set(state.records.filter((r) => dirSel.includes("todos") || dirSel.includes(r.diretoria)).map((r) => r.micro).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
  state.filters.micro = fillSelect(els.micro, microList, "Todas", state.filters.micro);
  state.filters.ocorrencia = fillSelect(els.ocorrencia, uniqueSorted("descricaoEncerramento"), "Todas", state.filters.ocorrencia);
  state.filters.servico = fillSelect(els.servico, uniqueSorted("servico"), "Todos", state.filters.servico);
  if (els.grupoServico) state.filters.grupoServico = fillSelect(els.grupoServico, uniqueSorted("grupoServico"), "Todos", state.filters.grupoServico);
}

function filteredRecords() {
  const term = state.filters.search.toLowerCase();
  return state.records.filter((record) => {
    const text = [
      record.solicitacao,
      record.ligacao,
      record.localidade,
      record.servico,
      record.grupoServico || "Sem grupo",
      record.descricaoEncerramento,
      record.codigoServico,
    ]
      .join(" ")
      .toLowerCase();
    return (
      (!term || text.includes(term)) &&
      filterMatches("status", record.status) &&
      filterMatches("diretoria", record.diretoria) &&
      filterMatches("micro", record.micro) &&
      filterMatches("ocorrencia", record.descricaoEncerramento) &&
      filterMatches("servico", record.servico) &&
      filterMatches("grupoServico", record.grupoServico || "Sem grupo")
    );
  });
}

function number(value) {
  return value.toLocaleString("pt-BR");
}

function renderSummary(records) {
  const total = state.records.length;
  const treated = state.records.filter((record) => record.status === "tratado").length;
  const open = total - treated;
  const overdue = state.records.filter((record) => record.deadline.className === "danger").length;
  const dueSoon = state.records.filter((record) => record.deadline.className === "warn").length;
  els.total.textContent = number(total);
  els.treated.textContent = number(treated);
  els.open.textContent = number(open);
  els.overdue.textContent = number(overdue);
  els.dueSoon.textContent = number(dueSoon);
  els.progress.textContent = total ? `${Math.round((treated / total) * 100)}%` : "0%";
  const monthly = calculateMonthly();
  els.monthRateCount.textContent = `${monthly.current.rate}%`;
  els.resultText.textContent = document.body.dataset.view === "monthly"
    ? `Mês ${monthly.current.month || "-"}: ${number(monthly.current.eligible)} EXOC(s), ${number(monthly.current.treated)} tratada(s) em 24h, resultado ${monthly.current.rate}%.`
    : `${number(records.length)} EXOC(s) na visão atual. Prazo contado por Visitado em; se vazio, Data Solicitação.`;
  els.latestDate.textContent = state.latestFileName || "não enviada";
  els.baselineDate.textContent = state.baselineFileName || (state.baseline.length ? "carregada" : "não carregada");
  els.duplicateText.textContent = state.duplicateCount ? `${number(state.duplicateCount)} duplicidade(s) removida(s)` : "sem duplicidade";
  const aux = [];
  if (state.auxStatus.micro) aux.push("micro");
  if (state.auxStatus.service) aux.push("serviço");
  els.auxText.textContent = aux.length ? `${aux.join(" + ")} internos` : "internos pendentes";
  const box = document.getElementById("funnelBox");
  if (box) {
    const f = state.funnel;
    box.hidden = !f;
    if (f) {
      box.innerHTML = `<strong>Reconciliação da volumetria</strong> (última base inicial enviada): ${number(f.brutas)} linhas na planilha`
        + ` − ${number(f.semChave)} sem nº solicitação/ligação/serviço`
        + ` − ${number(f.duplicadas)} duplicadas (mesma solicitação + ligação + código do serviço)`
        + ` − ${number(f.naoEncerrada || 0)} não encerradas com ocorrência`
        + ` − ${number(f.semData)} sem data válida em "Visitado em"`
        + ` − ${number(f.outroAno)} visitadas fora de 2026`
        + ` − ${number(f.hoje)} visitadas no dia da base${f.diaBase ? ` (${f.diaBase.slice(8)}/${f.diaBase.slice(5, 7)})` : ""}`
        + ` − ${number(f.semTabela || 0)} com código fora da tabela auxiliar`
        + ` − ${number(f.semCoi)} de outra responsabilidade (não COI)`
        + ` = <strong>${number(f.final)}</strong> para tratar`
        + (f.semSituacao ? `. Atenção: a base não tem a coluna "Situação", então o filtro de encerradas com ocorrência não foi aplicado` : "") + ".";
    }
  }
}

function renderTable(records) {
  const visible = records.slice(0, 200);
  els.body.innerHTML = "";
  const fragment = document.createDocumentFragment();
  visible.forEach((record) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${esc(record.procxCoi || "Não localizado")}</td>
      <td>${esc(record.diretoria || "Não localizado")}</td>
      <td>${esc(record.micro || "Não localizado")}</td>
      <td>${esc(record.solicitacao)}</td>
      <td>${esc(record.ligacao)}</td>
      <td>${esc(record.localidade)}</td>
      <td>${esc(record.servico)}</td>
      <td>${esc(record.grupoServico || "Sem grupo")}</td>
      <td>${esc(record.descricaoEncerramento)}</td>
      <td>${esc(record.visitadoEm)}</td>
      <td><span class="pill ${esc(record.deadline.className)}">${esc(record.deadline.label)}</span></td>
      <td><span class="pill ${record.appearsLatest ? "open" : "ok"}">${
      record.appearsLatest ? "Permanece" : "Saiu"
    }</span></td>
    `;
    fragment.appendChild(tr);
  });
  els.body.appendChild(fragment);
  if (records.length > visible.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="12">Mostrando ${number(visible.length)} de ${number(
      records.length
    )}. Use os filtros ou exporte o CSV para ver tudo.</td>`;
    els.body.appendChild(tr);
  }
}

function topCounts(records, field, limit = 10) {
  const counts = new Map();
  records.forEach((record) => {
    const key = record[field] || "Sem informação";
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, limit);
}

function renderBars(container, items) {
  const max = Math.max.apply(null, items.map((item) => item[1]).concat([1]));
  container.innerHTML = "";
  items.forEach(([label, value]) => {
    const row = document.createElement("div");
    row.className = "bar-row";
    row.innerHTML = `
      <span class="bar-label" title="${esc(label)}">${esc(label)}</span>
      <span class="bar-value">${number(value)}</span>
      <span class="bar-track"><span class="bar-fill" style="width:${(value / max) * 100}%"></span></span>
    `;
    container.appendChild(row);
  });
}

function renderCharts(records) {
  if (els.chartView.classList.contains("hidden")) return;
  renderBars(els.occurrenceBars, topCounts(records, "descricaoEncerramento"));
  renderBars(els.cityBars, topCounts(records, "localidade"));
  renderPivot(records);
}

function snapshotDateFromRecords(records) {
  const maxMs = Math.max.apply(null, records.map((record) => record.visitadoEmMs || 0).concat([0]));
  return maxMs ? dateKeyFromMs(maxMs) : todayKey();
}

function addSnapshot(fileName, records, type = "atualizacao") {
  const dateKey = todayKey();
  const snapshot = {
    id: `${dateKey}-${type}`,
    fileName,
    type,
    dateKey,
    uploadedAt: new Date().toISOString(),
    keys: records.map((record) => record.key),
    records: records.map((record) => ({
      key: record.key,
      referenceMs: record.referenceMs,
      referenceDate: record.referenceDate,
      localidade: record.localidade,
      diretoria: record.diretoria,
      micro: record.micro,
      solicitacao: record.solicitacao,
      ligacao: record.ligacao,
      codigoServico: record.codigoServico,
      servico: record.servico,
      grupoServico: record.grupoServico || serviceGroupFor(record.codigoServico),
      procxCoi: record.procxCoi,
      responsavel: record.responsavel,
      responsabilidade: record.responsabilidade,
      visitadoEm: record.visitadoEm,
      visitadoEmMs: record.visitadoEmMs,
      dataSolicitacao: record.dataSolicitacao,
      dataSolicitacaoMs: record.dataSolicitacaoMs,
      descricaoEncerramento: record.descricaoEncerramento,
      tipoEncerramento: record.tipoEncerramento,
      situacao: record.situacao,
      zona: record.zona,
      comunidade: record.comunidade,
      comunidadeExecutada: record.comunidadeExecutada,
      executor: record.executor,
    })),
  };
  state.history = fixedDailyHistory(state.history);
  const existingSameDay = state.history.find((item) => item.dateKey === dateKey);
  if (existingSameDay) {
    if (type === "atualizacao") {
      syncSnapshotToSheets(snapshot);
    }
    state.history.sort((a, b) => a.dateKey.localeCompare(b.dateKey));
    return;
  }
  if (type === "base_inicial") {
    state.history.push(snapshot);
    state.history.sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  }
  syncSnapshotToSheets(snapshot);
}

function calculateMonthly() {
  const hist = fixedDailyHistory(state.history);
  const fDir = normalizeFilterValues(state.filters.diretoria), fMic = normalizeFilterValues(state.filters.micro);
  hist.forEach((snap) => { snap._keySet = new Set(snap.keys || []); });
  const items = [];
  hist.forEach((snap, index) => {
    const next = hist.find((candidate, i) => i > index && candidate.dateKey > snap.dateKey);
    (snap.records || []).forEach((record) => {
      const parts = String(record.key).split("|");
      const it = {
        key: record.key,
        solicitacao: record.solicitacao != null ? record.solicitacao : (parts[0] != null ? parts[0] : ""),
        ligacao: record.ligacao != null ? record.ligacao : (parts[1] != null ? parts[1] : ""),
        servico: record.servico != null ? record.servico : "",
        grupoServico: record.grupoServico || serviceGroupFor(parts[2] || record.codigoServico || record.servico),
        procxCoi: record.procxCoi != null ? record.procxCoi : "",
        localidade: record.localidade || "",
        diretoria: record.diretoria || "",
        micro: record.micro || "",
        referenceMs: record.referenceMs,
        firstIndex: index,
        firstDate: snap.dateKey,
        month: snap.dateKey && snap.dateKey.length >= 7 ? snap.dateKey.slice(0, 7) : "Sem data",
        day: snap.dateKey || "Sem data",
        saiuEm: "",
      };
      if (!fDir.includes("todos") && !fDir.includes(it.diretoria)) return;
      if (!fMic.includes("todos") && !fMic.includes(it.micro)) return;
      if (!filterMatches("grupoServico", it.grupoServico || "Sem grupo")) return;
      if (!next) it.situacao = "Aguardando";
      else if (!next._keySet.has(it.key)) {
        it.situacao = "Tratada em 24h";
        it.saiuEm = next.dateKey;
      } else {
        const later = hist.find((candidate, i) => i > index && !candidate._keySet.has(it.key));
        it.situacao = later ? "Tratada fora das 24h" : "Vencida em aberto";
        it.saiuEm = later ? later.dateKey : "";
      }
      items.push(it);
    });
  });
  const months = new Map();
  items.forEach((it) => {
    if (!months.has(it.month)) months.set(it.month, { month: it.month, eligible: 0, treated: 0, late: 0, waiting: 0, rate: 0 });
    const m = months.get(it.month);
    m.eligible += 1;
    if (it.situacao === "Tratada em 24h") m.treated += 1;
    else if (it.situacao === "Aguardando") m.waiting += 1;
    else m.late += 1;
  });
  const rows = Array.from(months.values()).sort((a, b) => a.month.localeCompare(b.month));
  rows.forEach((r) => { r.rate = r.eligible ? Math.round((r.treated / r.eligible) * 100) : 0; });
  const dated = rows.filter((r) => r.month !== "Sem data");
  return { rows, items, current: (dated.length ? dated[dated.length - 1] : null) || { month: "", eligible: 0, treated: 0, late: 0, waiting: 0, rate: 0 } };
}

function renderMonthly() {
  const monthly = calculateMonthly();
  const selectedMonth = monthly.current.month || "";
  const row = monthly.current || { eligible: 0, treated: 0, late: 0, waiting: 0, rate: 0 };
  els.monthEligible.textContent = number(row.eligible);
  els.monthTreated.textContent = number(row.treated);
  els.monthPending.textContent = number(row.late);
  document.getElementById("monthWaiting").textContent = number(row.waiting);
  els.monthRate.textContent = `${row.rate}%`;
  const days = new Map();
  monthly.items.filter((it) => it.month === selectedMonth).forEach((it) => {
    if (!days.has(it.day)) days.set(it.day, { day: it.day, total: 0, treated: 0, late: 0, waiting: 0 });
    const d = days.get(it.day);
    d.total += 1;
    if (it.situacao === "Tratada em 24h") d.treated += 1;
    else if (it.situacao === "Aguardando") d.waiting += 1;
    else d.late += 1;
  });
  const list = Array.from(days.values()).sort((a, b) => a.day.localeCompare(b.day));
  const line = (label, d, bold) => {
    const pct = d.total ? Math.round((d.treated / d.total) * 100) : 0;
    const cells = [label, number(d.total), number(d.treated), number(d.late), number(d.waiting), `${pct}%`];
    return `<tr>${cells.map((c) => `<td>${bold ? `<strong>${esc(c)}</strong>` : esc(c)}</td>`).join("")}</tr>`;
  };
  const total = list.reduce((a, d) => ({ total: a.total + d.total, treated: a.treated + d.treated, late: a.late + d.late, waiting: a.waiting + d.waiting }), { total: 0, treated: 0, late: 0, waiting: 0 });
  els.monthlyBody.innerHTML = list.map((d) => line(d.day.length === 10 ? `${d.day.slice(8)}/${d.day.slice(5, 7)}` : d.day, d, false)).join("") + (list.length ? line("Total do mês", total, true) : "");
}
function pivotValue(record, field) {
  if (field === "dia") return dayLabel(record.visitadoEmMs || record.referenceMs);
  if (field === "status") return record.status === "tratado" ? "Tratado" : "Não tratado";
  return record[field] || "Sem informação";
}

function renderPivot(records) {
  const row1 = els.pivotRow1.value;
  const row2 = els.pivotRow2.value;
  const col = els.pivotColumn.value;
  const columnMeta =
    col === "dia"
      ? Array.from(records.reduce((map, record) => {
            const ms = record.visitadoEmMs || record.referenceMs;
            const key = dateKeyFromMs(ms);
            if (key && !map.has(key)) map.set(key, { key, label: pivotDayLabel(ms), sort: ms || 0 });
            return map;
          }, new Map())
          .values()).sort((a, b) => a.sort - b.sort)
      : Array.from(new Set(records.map((record) => pivotValue(record, col))))
          .sort((a, b) => a.localeCompare(b, "pt-BR"))
          .map((value) => ({ key: value, label: value, sort: value }));
  const columns = columnMeta.map((item) => item.key);
  const rows = new Map();
  records.forEach((record) => {
    const first = pivotValue(record, row1);
    const second = pivotValue(record, row2);
    const key = `${first}||${second}`;
    if (!rows.has(key)) rows.set(key, { first, second, counts: {}, total: 0 });
    const item = rows.get(key);
    const column = col === "dia" ? dateKeyFromMs(record.visitadoEmMs || record.referenceMs) : pivotValue(record, col);
    item.counts[column] = (item.counts[column] || 0) + 1;
    item.total += 1;
  });

  const totals = {};
  let grandTotal = 0;
  columns.forEach((column) => (totals[column] = 0));
  let html = `<thead>
    <tr class="pivot-top-row">
      <th class="pivot-corner" colspan="2"></th>
      ${columnMeta.map((column) => `<th>${esc(column.label)}</th>`).join("")}
      <th>Total Geral</th>
    </tr>
    <tr class="pivot-field-row">
      <th><span>${esc(labelFor(row1))}</span></th>
      <th><span>${esc(labelFor(row2))}</span></th>
      ${columns.map(() => "<th></th>").join("")}
      <th></th>
    </tr>
  </thead><tbody>`;
  let lastFirst = null;
  const allRows = Array.from(rows.values())
    .sort((a, b) => `${a.first} ${a.second}`.localeCompare(`${b.first} ${b.second}`, "pt-BR"));
  const PIVOT_LIMIT = 150;
  allRows.slice(PIVOT_LIMIT).forEach((row) => {
    columns.forEach((column) => { totals[column] += row.counts[column] || 0; });
    grandTotal += row.total;
  });
  allRows.slice(0, PIVOT_LIMIT)
    .forEach((row) => {
      const groupStart = row.first !== lastFirst;
      lastFirst = row.first;
      html += `<tr class="${groupStart ? "group-start" : ""}">
        <td>${esc(row.first)}</td>
        <td>${esc(row.second)}</td>`;
      columns.forEach((column) => {
        const value = row.counts[column] || "";
        totals[column] += row.counts[column] || 0;
        html += `<td>${value}</td>`;
      });
      grandTotal += row.total;
      html += `<td>${row.total}</td></tr>`;
    });
  html += `<tr class="total-row"><td>Total Geral</td><td></td>${columns
    .map((column) => `<td>${totals[column] || ""}</td>`)
    .join("")}<td>${grandTotal}</td></tr></tbody>`;
  if (allRows.length > PIVOT_LIMIT) {
    html = html.replace('<tr class="total-row">', `<tr><td colspan="${columns.length + 3}">Mostrando ${PIVOT_LIMIT} de ${number(allRows.length)} linhas. Use os filtros para refinar (o Total Geral considera tudo).</td></tr><tr class="total-row">`);
  }
  els.pivotTable.innerHTML = html;
}

function labelFor(field) {
  const labels = {
    diretoria: "Diretoria",
    micro: "Micro",
    localidade: "Localidade",
    descricaoEncerramento: "Ocorrência",
    servico: "Serviço",
    grupoServico: "Grupo de servico",
    dia: "Dia visitado",
    status: "Status",
  };
  return labels[field] || field;
}

function renderSla(records) {
  const order = { danger: 0, warn: 1, ok: 2, neutral: 3 };
  const priority = records.slice()
    .filter((record) => record.status !== "tratado")
    .sort((a, b) => order[a.deadline.className] - order[b.deadline.className] || (a.referenceMs || 0) - (b.referenceMs || 0))
    .slice(0, 300);
  els.slaBody.innerHTML = "";
  const fragment = document.createDocumentFragment();
  priority.forEach((record) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><span class="pill ${esc(record.deadline.className)}">${esc(record.deadline.label)}</span></td>
      <td>${esc(record.solicitacao)}</td>
      <td>${esc(record.ligacao)}</td>
      <td>${esc(record.localidade)}</td>
      <td>${esc(record.descricaoEncerramento)}</td>
      <td>${esc(record.referenceDate)}</td>
    `;
    fragment.appendChild(tr);
  });
  els.slaBody.appendChild(fragment);
}

function render() {
  decorateRecords();
  updateFilterOptions();
  const records = filteredRecords();
  renderSummary(records);
  renderTable(records);
  renderCharts(records);
  renderSla(records);
  renderMonthly();
}

function download(name, content, type) {
  const blob = new Blob([content], { type });
  downloadBlob(name, blob);
}

function downloadBlob(name, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function csvText(headers, rows) {
  const lines = [headers.join(";")];
  rows.forEach((row) => {
    lines.push(row.map((value) => `"${String(value != null ? value : "").replace(/"/g, '""')}"`).join(";"));
  });
  return "\uFEFF" + lines.join("\n");
}

async function exportWorkbook(fileName, sheets) {
  const ok = await ensureXLSX();
  if (!ok || !window.XLSX) {
    setNotice("Nao consegui carregar a biblioteca de Excel para gerar XLSX. Use CSV ou verifique a conexao.", "error");
    return;
  }
  const workbook = XLSX.utils.book_new();
  sheets.forEach(({ name, rows }) => {
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, sheet, String(name).slice(0, 31));
  });
  const data = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  downloadBlob(fileName, new Blob([data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
}

function exportTracking() {
  const payload = {
    type: "painel-exoc-acompanhamento-v2",
    exportedAt: new Date().toISOString(),
    baselineFileName: state.baselineFileName,
    latestFileName: state.latestFileName,
    duplicateCount: state.duplicateCount,
    history: state.history,
    latestKeys: state.latestKeys ? Array.from(state.latestKeys) : null,
    manualStatus: state.manualStatus,
    baseline: state.baseline,
  };
  download("acompanhamento-exoc.json", JSON.stringify(payload), "application/json");
}

function dailyExportRows() {
  const headers = [
    "RESPONSAVEL",
    "Diretoria",
    "Micro",
    "Status automatico",
    "Prazo 24h",
    "Numero Solicitacao",
    "Numero Ligacao",
    "Localidade",
    "Servico",
    "Grupo de servico",
    "Ocorrencia",
    "Visitado em",
    "Ultima base",
  ];
  const rows = filteredRecords().map((record) => [
    record.procxCoi,
    record.diretoria,
    record.micro,
    record.status === "tratado" ? "Tratado" : "Nao tratado",
    record.deadline.label,
    record.solicitacao,
    record.ligacao,
    record.localidade,
    record.servico,
    record.grupoServico || "Sem grupo",
    record.descricaoEncerramento,
    record.visitadoEm,
    record.appearsLatest ? "Permanece" : "Saiu",
  ]);
  return { headers, rows };
}

function monthlyExportData() {
  const monthly = calculateMonthly();
  const selectedMonth = monthly.current.month || "sem-mes";
  const items = monthly.items.filter((it) => it.month === selectedMonth).sort((a, b) => a.day.localeCompare(b.day));
  const detailHeaders = ["Dia de entrada", "Numero Solicitacao", "Numero Ligacao", "Diretoria", "Micro", "Localidade", "Servico", "Grupo de servico", "RESPONSAVEL", "Situacao 24h", "Saiu da base em"];
  const detailRows = items.map((it) => [it.day, it.solicitacao, it.ligacao, it.diretoria, it.micro, it.localidade, it.servico, it.grupoServico || "Sem grupo", it.procxCoi, it.situacao, it.saiuEm]);
  const days = new Map();
  items.forEach((it) => {
    if (!days.has(it.day)) days.set(it.day, { day: it.day, total: 0, treated: 0, late: 0, waiting: 0 });
    const d = days.get(it.day);
    d.total += 1;
    if (it.situacao === "Tratada em 24h") d.treated += 1;
    else if (it.situacao === "Aguardando") d.waiting += 1;
    else d.late += 1;
  });
  const summaryHeaders = ["Dia", "EXOCs", "Tratadas em 24h", "Fora das 24h", "Aguardando", "% 24h"];
  const summaryRows = Array.from(days.values()).sort((a, b) => a.day.localeCompare(b.day)).map((d) => [
    d.day,
    d.total,
    d.treated,
    d.late,
    d.waiting,
    d.total ? `${Math.round((d.treated / d.total) * 100)}%` : "0%",
  ]);
  return { selectedMonth, detailHeaders, detailRows, summaryHeaders, summaryRows };
}
function exportCsv() {
  exportDailyCsv();
}

function exportDailyCsv() {
  const data = dailyExportRows();
  download("base-diaria-exoc.csv", csvText(data.headers, data.rows), "text/csv;charset=utf-8");
}

async function exportDailyXlsx() {
  const data = dailyExportRows();
  await exportWorkbook("base-diaria-exoc.xlsx", [{ name: "Diario", rows: [data.headers].concat(data.rows) }]);
}

function exportMonthly() {
  const data = monthlyExportData();
  download(`exoc-mensal-${data.selectedMonth}.csv`, csvText(data.detailHeaders, data.detailRows), "text/csv;charset=utf-8");
}

async function exportMonthlyXlsx() {
  const data = monthlyExportData();
  await exportWorkbook(`exoc-mensal-${data.selectedMonth}.xlsx`, [
    { name: "Resumo mensal", rows: [data.summaryHeaders].concat(data.summaryRows) },
    { name: "Base mensal", rows: [data.detailHeaders].concat(data.detailRows) },
  ]);
}

async function loadBaseline() {
  await loadSavedState();
  ensureXLSX();
  loadInternalAuxiliaries();
  await applyPreloadedTrackingState();
  if (state.baseline.length) {
    state.baseline = applyBusinessRules(state.baseline);
    await saveState();
  }
  if (state.baseline.length) {
    setNotice("Base inicial fixa carregada. Suba uma nova base para medir o progresso.", "ok");
  }
  render();
}

els.baselineFile.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    setNotice("Lendo e tratando a base inicial...");
    const parsed = await readFile(file);
    state.baseline = parsed.rows;
    state.duplicateCount = parsed.duplicates;
    state.funnel = parsed.funnel;
    state.baselineFileName = file.name;
    state.latestKeys = null;
    state.latestFileName = "";
    state.manualStatus = {};
    addSnapshot(file.name, state.baseline, "base_inicial");
    await saveState();
    setNotice("Base inicial tratada e fixada. Agora suba as atualizações do dia para acompanhar o tratamento.", "ok");
    render();
  } catch (error) {
    setNotice(error.message || "Não foi possível ler a base inicial.", "error");
  } finally {
    event.target.value = "";
  }
});

els.latestFile.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  if (!state.baseline.length) {
    setNotice("Carregue a base inicial antes de subir uma nova base.", "error");
    event.target.value = "";
    return;
  }
  try {
    setNotice("Lendo e tratando a atualização enviada...");
    const latest = await readFile(file);
    state.latestKeys = new Set(latest.rows.map((record) => record.key));
    state.latestFileName = file.name;
    addSnapshot(file.name, latest.rows, "atualizacao");
    await saveState();
    setNotice("Atualização aplicada. O painel recalculou tratados, pendentes e prazo de 24h.", "ok");
    render();
  } catch (error) {
    setNotice(error.message || "Não foi possível ler a nova base.", "error");
  } finally {
    event.target.value = "";
  }
});

els.stateFile.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const payload = JSON.parse(await file.text());
    state.manualStatus = payload.manualStatus || {};
    state.latestFileName = payload.latestFileName || "";
    state.baselineFileName = payload.baselineFileName || "";
    state.duplicateCount = payload.duplicateCount || 0;
    state.history = payload.history || [];
    state.latestKeys = payload.latestKeys ? new Set(payload.latestKeys) : null;
    state.baseline = applyBusinessRules(payload.baseline || []);
    await saveState();
    render();
    const toSend = (state.history || []).filter((snap) => snap && snap.dateKey);
    if (sheetsConfig().url && toSend.length) {
      for (let i = 0; i < toSend.length; i += 1) {
        setNotice(`Acompanhamento importado. Enviando ao banco Google: dia ${i + 1} de ${toSend.length}...`, "ok");
        const snap = Object.assign({}, toSend[i], { type: "base_inicial" });
        delete snap._keySet;
        await syncSnapshotToSheets(snap);
        await new Promise((r) => setTimeout(r, 800));
      }
      setNotice(`Acompanhamento importado e enviado ao banco Google (${toSend.length} dia(s)).`, "ok");
    } else {
      setNotice("Acompanhamento importado.", "ok");
    }
  } catch {
    setNotice("O arquivo de acompanhamento não pôde ser importado.", "error");
  } finally {
    event.target.value = "";
  }
});

els.exportState.addEventListener("click", exportTracking);
els.exportCsv.addEventListener("click", exportCsv);
document.getElementById("dailyExportCsv").addEventListener("click", exportDailyCsv);
document.getElementById("dailyExportXlsx").addEventListener("click", exportDailyXlsx);
els.sheetsConfig.addEventListener("click", configureSheetsSync);
els.clearData.addEventListener("click", async () => {
  if (!confirm("Limpar a base fixa e o acompanhamento salvo neste navegador?")) return;
  localStorage.removeItem(STORAGE_KEY);
  await dbClear();
  state.baseline = [];
  state.records = [];
  state.latestKeys = null;
  state.latestFileName = "";
  state.baselineFileName = "";
    state.manualStatus = {};
    state.duplicateCount = 0;
    state.history = [];
    loadInternalAuxiliaries();
  setNotice("Dados locais limpos. Carregue uma nova base inicial para começar.", "ok");
  render();
});

els.search.addEventListener("input", (event) => {
  state.filters.search = event.target.value;
  render();
});

const filterControls = [
  [els.status, "status"],
  [els.diretoria, "diretoria"],
  [els.micro, "micro"],
  [els.ocorrencia, "ocorrencia"],
  [els.servico, "servico"],
  [els.grupoServico, "grupoServico"],
];

filterControls.forEach(function(item) {
  const element = item[0];
  const key = item[1];
  if (!element) return;
  element.addEventListener("change", function(event) {
    state.filters[key] = selectedValues(event.target);
    setSelectValues(event.target, state.filters[key]);
    if (key === "diretoria") {
      state.filters.micro = ["todos"];
      setSelectValues(els.micro, state.filters.micro);
    }
    render();
  });
});

function setView(view) {
  document.body.dataset.view = view;
  els.tableView.classList.toggle("hidden", view !== "table");
  els.chartView.classList.toggle("hidden", view !== "charts");
  els.monthlyView.classList.toggle("hidden", view !== "monthly");
  els.slaView.classList.toggle("hidden", true);
  els.viewTable.classList.toggle("active", view === "table");
  els.viewCharts.classList.toggle("active", view === "charts");
  els.viewMonthly.classList.toggle("active", view === "monthly");
  els.viewTitle.textContent =
    view === "monthly"
      ? "Acompanhamento mensal EXOC 24h"
      : view === "charts"
        ? "Dinâmica para envio aos programadores"
        : "Acompanhamento diário das EXOCs";
  if (view === "monthly") {
    const monthly = calculateMonthly();
    els.resultText.textContent = `Mês ${monthly.current.month || "-"}: ${number(monthly.current.eligible)} EXOC(s), ${number(monthly.current.treated)} tratada(s) em 24h, resultado ${monthly.current.rate}%.`;
  }
}

function on(element, eventName, handler) {
  if (element) element.addEventListener(eventName, handler);
}

on(els.viewTable, "click", () => setView("table"));
on(els.viewCharts, "click", () => { setView("charts"); render(); });
on(els.viewMonthly, "click", () => setView("monthly"));
on(document.getElementById("monthExport"), "click", exportMonthly);
on(document.getElementById("monthExportXlsx"), "click", exportMonthlyXlsx);
on(els.pivotRow1, "change", render);
on(els.pivotRow2, "change", render);
on(els.pivotColumn, "change", render);

try {
  const startup = loadBaseline();
  if (startup && typeof startup.then === "function") {
    startup.then(function() {}, function(error) {
      console.error(error);
      setNotice("Erro ao carregar o painel: " + (error && error.message ? error.message : error), "error");
    });
  }
} catch (error) {
  console.error(error);
  setNotice("Erro ao carregar o painel: " + (error && error.message ? error.message : error), "error");
}
