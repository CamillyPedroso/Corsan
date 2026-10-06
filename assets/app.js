const GITHUB_REPO_NAME = "exocs-painel";

// Troque pelo link CSV publicado do Google Sheets.
// Exemplo: https://docs.google.com/spreadsheets/d/e/SEU_ID/pub?gid=0&single=true&output=csv
const SHEET_CSV_URL = "";

// Opcional: endpoint de um Google Apps Script para gravar dados na planilha.
const APPS_SCRIPT_URL = "";

const SAMPLE_DATA_URL = "assets/sample-data.csv";
const STORAGE_KEY = "exocs-local-records";

let records = [];
let activeMetric = "";

const statusLabels = {
  ok: "Ok",
  attention: "Atencao",
  critical: "Critico",
};

const moneyFormat = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 1,
});

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("repoName").textContent = GITHUB_REPO_NAME;
  bindTabs();
  bindFilters();
  bindForm();
  loadData();
});

function bindTabs() {
  document.querySelectorAll(".nav-tab").forEach((button) => {
    button.addEventListener("click", () => {
      const tabId = button.dataset.tab;
      document.querySelectorAll(".nav-tab").forEach((tab) => tab.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.remove("active"));
      button.classList.add("active");
      document.getElementById(tabId).classList.add("active");
    });
  });

  document.getElementById("refreshButton").addEventListener("click", loadData);
}

function bindFilters() {
  document.getElementById("metricSearch").addEventListener("input", renderMetricsTable);
  document.getElementById("statusFilter").addEventListener("change", renderTimeline);
  document.getElementById("chartMetric").addEventListener("change", (event) => {
    activeMetric = event.target.value;
    renderChart();
  });
}

function bindForm() {
  document.querySelector("[name='date']").valueAsDate = new Date();
  document.getElementById("entryForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const entry = Object.fromEntries(formData.entries());
    entry.value = Number(entry.value);
    entry.target = Number(entry.target);

    if (APPS_SCRIPT_URL) {
      await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(entry),
      });
      setStatus("Registro enviado para o Google Sheets.");
    } else {
      const localRecords = getLocalRecords();
      localRecords.push(entry);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(localRecords));
      setStatus("Registro salvo neste navegador. Conecte o Apps Script para gravar na planilha.");
    }

    event.currentTarget.reset();
    document.querySelector("[name='date']").valueAsDate = new Date();
    await loadData();
  });
}

async function loadData() {
  setStatus("Carregando dados...");
  const source = getSheetUrl();

  try {
    const response = await fetch(source || SAMPLE_DATA_URL, { cache: "no-store" });
    const csv = await response.text();
    const remoteRecords = parseCsv(csv).map(normalizeRecord).filter(Boolean);
    records = [...remoteRecords, ...getLocalRecords().map(normalizeRecord).filter(Boolean)];
    activeMetric = activeMetric || getMetricNames()[0] || "";
    renderAll();
    setStatus(source ? "Dados sincronizados com Google Sheets." : "Usando dados de exemplo.");
  } catch (error) {
    console.error(error);
    const fallbackResponse = await fetch(SAMPLE_DATA_URL, { cache: "no-store" });
    const csv = await fallbackResponse.text();
    records = parseCsv(csv).map(normalizeRecord).filter(Boolean);
    renderAll();
    setStatus("Nao foi possivel carregar a planilha. Dados de exemplo ativados.");
  }
}

function getSheetUrl() {
  const query = new URLSearchParams(window.location.search);
  return query.get("sheet") || SHEET_CSV_URL;
}

function getLocalRecords() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function normalizeRecord(row) {
  if (!row.metric) return null;
  return {
    date: row.date || new Date().toISOString().slice(0, 10),
    metric: String(row.metric).trim(),
    value: Number(row.value || 0),
    target: Number(row.target || 0),
    category: row.category || "Geral",
    status: row.status || "attention",
    note: row.note || "",
  };
}

function renderAll() {
  renderMetricCards();
  renderChartOptions();
  renderChart();
  renderFocus();
  renderMetricsTable();
  renderTimeline();
}

function renderMetricCards() {
  const metricCards = document.getElementById("metricCards");
  const latest = getLatestByMetric();
  const entries = Object.values(latest).slice(0, 4);

  metricCards.innerHTML = entries
    .map((item) => {
      const progress = getProgress(item);
      return `
        <article class="metric-card">
          <span>${escapeHtml(item.metric)}</span>
          <strong>${moneyFormat.format(item.value)}</strong>
          <small>Meta: ${moneyFormat.format(item.target)} | ${progress}%</small>
          <div class="progress"><i style="--progress:${Math.min(progress, 100)}%"></i></div>
        </article>
      `;
    })
    .join("");

  const average = entries.length
    ? Math.round(entries.reduce((sum, item) => sum + getProgress(item), 0) / entries.length)
    : 0;

  document.getElementById("healthScore").textContent = `${average}%`;
  document.getElementById("healthLabel").textContent =
    average >= 90 ? "Operacao forte" : average >= 65 ? "Em evolucao" : "Precisa de atencao";
}

function renderChartOptions() {
  const select = document.getElementById("chartMetric");
  const names = getMetricNames();
  select.innerHTML = names.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("");
  select.value = activeMetric || names[0] || "";
}

function renderChart() {
  const canvas = document.getElementById("trendChart");
  const context = canvas.getContext("2d");
  const data = records
    .filter((item) => item.metric === activeMetric)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);

  const padding = 42;
  const width = canvas.width - padding * 2;
  const height = canvas.height - padding * 2;
  const maxValue = Math.max(...data.map((item) => item.value), ...data.map((item) => item.target), 10);

  drawGrid(context, padding, width, height);

  if (data.length === 0) {
    context.fillStyle = "#64748b";
    context.font = "600 18px Inter";
    context.fillText("Sem dados para exibir.", padding, canvas.height / 2);
    return;
  }

  const points = data.map((item, index) => {
    const x = padding + (data.length === 1 ? width / 2 : (index / (data.length - 1)) * width);
    const y = padding + height - (item.value / maxValue) * height;
    return { x, y, item };
  });

  context.lineWidth = 4;
  context.strokeStyle = "#14b8a6";
  context.beginPath();
  points.forEach((point, index) => {
    if (index === 0) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  });
  context.stroke();

  points.forEach((point) => {
    context.fillStyle = "#111827";
    context.beginPath();
    context.arc(point.x, point.y, 6, 0, Math.PI * 2);
    context.fill();
  });

  context.fillStyle = "#64748b";
  context.font = "600 13px Inter";
  points.forEach((point) => {
    context.fillText(formatDate(point.item.date), point.x - 34, canvas.height - 12);
  });
}

function drawGrid(context, padding, width, height) {
  context.strokeStyle = "#dbe3ee";
  context.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const y = padding + (height / 4) * i;
    context.beginPath();
    context.moveTo(padding, y);
    context.lineTo(padding + width, y);
    context.stroke();
  }
}

function renderFocus() {
  const latest = Object.values(getLatestByMetric());
  const sorted = [...latest].sort((a, b) => getProgress(a) - getProgress(b));
  const weakest = sorted[0];

  if (!weakest) return;

  document.getElementById("focusTitle").textContent = `Prioridade: ${weakest.metric}`;
  document.getElementById("focusText").textContent =
    `${weakest.metric} esta em ${getProgress(weakest)}% da meta. Use o historico para entender o motivo e definir uma acao.`;

  document.getElementById("focusList").innerHTML = sorted
    .slice(0, 3)
    .map((item) => `<span>${escapeHtml(item.metric)}: ${getProgress(item)}%</span>`)
    .join("");
}

function renderMetricsTable() {
  const search = document.getElementById("metricSearch").value.toLowerCase();
  const latest = Object.values(getLatestByMetric()).filter((item) =>
    item.metric.toLowerCase().includes(search)
  );

  document.getElementById("metricsTable").innerHTML = latest
    .map((item) => {
      const progress = getProgress(item);
      return `
        <tr>
          <td><strong>${escapeHtml(item.metric)}</strong><br><small>${escapeHtml(item.category)}</small></td>
          <td>${moneyFormat.format(item.value)}</td>
          <td>${moneyFormat.format(item.target)}</td>
          <td>
            <strong>${progress}%</strong>
            <div class="progress"><i style="--progress:${Math.min(progress, 100)}%"></i></div>
          </td>
          <td><span class="status-pill ${escapeHtml(item.status)}">${statusLabels[item.status] || item.status}</span></td>
        </tr>
      `;
    })
    .join("");
}

function renderTimeline() {
  const filter = document.getElementById("statusFilter").value;
  const list = records
    .filter((item) => filter === "all" || item.status === filter)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  document.getElementById("timeline").innerHTML = list
    .map(
      (item) => `
        <article class="timeline-item">
          <time>${formatDate(item.date)}</time>
          <div>
            <strong>${escapeHtml(item.metric)} - ${moneyFormat.format(item.value)}</strong>
            <span>${escapeHtml(item.note || item.category)}</span>
          </div>
          <span class="status-pill ${escapeHtml(item.status)}">${statusLabels[item.status] || item.status}</span>
        </article>
      `
    )
    .join("");
}

function getLatestByMetric() {
  return records
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .reduce((acc, item) => {
      acc[item.metric] = item;
      return acc;
    }, {});
}

function getMetricNames() {
  return [...new Set(records.map((item) => item.metric))];
}

function getProgress(item) {
  if (!item.target) return 0;
  return Math.round((item.value / item.target) * 100);
}

function setStatus(message) {
  document.getElementById("syncStatus").textContent = message;
}

function formatDate(date) {
  const parsed = new Date(`${date}T12:00:00`);
  return parsed.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function parseCsv(csv) {
  const rows = [];
  let current = "";
  let row = [];
  let insideQuotes = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const next = csv[index + 1];

    if (char === '"' && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      insideQuotes = !insideQuotes;
    } else if (char === "," && !insideQuotes) {
      row.push(current.trim());
      current = "";
    } else if ((char === "\n" || char === "\r") && !insideQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(current.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      current = "";
    } else {
      current += char;
    }
  }

  row.push(current.trim());
  if (row.some(Boolean)) rows.push(row);

  const headers = rows.shift().map((header) => header.trim());
  return rows.map((values) =>
    headers.reduce((acc, header, index) => {
      acc[header] = values[index] || "";
      return acc;
    }, {})
  );
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
