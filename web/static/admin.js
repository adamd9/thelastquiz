import { buildModelGroups } from "/static/utils.js";
import { providerLogoImg } from "/static/model-logo.js";

/* The Last Quiz — benchmark admin console (ES module, same pattern as app.js).
 * Talks to /api/admin/benchmarks* (auth-ready: sends X-Admin-Token if set) and
 * /api/models. Curated model groups mirror the main app via utils.js
 * buildModelGroups, so there is one consistent grouping everywhere. */

const TOKEN_KEY = "tlq_admin_token";
let selectedModels = new Set();
let curatedGroups = {};
let modelNames = {};
// Benchmarks + which models already have a result, for the coverage table.
let benchmarksData = [];
let coverageByBench = {};
// Run ids whose failure/skip detail is currently expanded. Tracked so a
// background refresh re-renders them still open instead of snapping shut.
const expandedRuns = new Set();

function getToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

function headers(extra = {}) {
  const h = { ...extra };
  const t = getToken();
  if (t) h["X-Admin-Token"] = t;
  return h;
}

function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2600);
}

async function api(path, opts = {}) {
  const base = window.API_BASE || "";
  const res = await fetch((path.startsWith("/") ? base + path : path), {
    ...opts,
    headers: headers(opts.body ? { "Content-Type": "application/json", ...(opts.headers || {}) } : opts.headers),
  });
  if (!res.ok) {
    let detail = res.statusText;
    try { detail = (await res.json()).detail || detail; } catch (e) { /* ignore */ }
    throw new Error(detail);
  }
  return res.json();
}

// Gate: reveal the console only after an admin-scoped request succeeds. The
// server returns 403 for a missing/wrong token (and 200 when open in local
// dev), so a probe of /api/admin/benchmarks is a reliable authorization check.
async function unlock() {
  const content = document.getElementById("admin-content");
  const gate = document.getElementById("gate-msg");
  const tokenPanel = document.getElementById("token-panel");
  const changeToken = document.getElementById("change-token");

  // Fire the independent loads immediately so they run in PARALLEL with the
  // (relatively slow) auth/benchmarks probe rather than queueing behind it.
  // They target elements inside the still-hidden admin panel; if auth fails
  // below, the panel simply stays hidden and their responses are discarded.
  loadModels();
  loadRuns();
  loadStats();

  let probe;
  try {
    // This probe doubles as the auth check AND the benchmarks payload, so we
    // don't fetch the (relatively expensive) coverage endpoint twice on load.
    probe = await api("/api/admin/benchmarks");
  } catch (e) {
    content.hidden = true;
    if (tokenPanel) tokenPanel.hidden = false;
    if (changeToken) changeToken.hidden = true;
    gate.hidden = false;
    gate.textContent = getToken()
      ? "That token was rejected. Check it and try again."
      : "Enter your admin token to continue.";
    return false;
  }
  gate.hidden = true;
  // Once unlocked, tuck the token entry away — the token is persisted in
  // localStorage, so there's no need to show it again. A "Change token" link
  // in the header re-reveals it if the token ever needs updating.
  if (tokenPanel) tokenPanel.hidden = true;
  if (changeToken) changeToken.hidden = false;
  content.hidden = false;
  loadBenchmarks(probe);
  return true;
}

async function loadModels() {
  const note = document.getElementById("models-note");
  const container = document.getElementById("models");
  const groupSel = document.getElementById("group");
  let models = [];
  try {
    const data = await api("/api/models");
    models = data.models || [];
  } catch (e) {
    note.textContent = "Could not load models: " + e.message;
    return;
  }

  // Curated groups first — the most-used control shouldn't wait on the full
  // per-model checkbox render below. Same grouping as the main app.
  groupSel.querySelectorAll("option:not([value=''])").forEach((o) => o.remove());
  curatedGroups = {};
  try {
    for (const g of buildModelGroups(models)) {
      curatedGroups[g.id] = g.modelIds;
      const opt = document.createElement("option");
      opt.value = g.id;
      opt.textContent = `${g.label} (${g.modelIds.length})`;
      groupSel.appendChild(opt);
    }
  } catch (err) {
    console.error("Curated model groups failed to build:", err);
  }

  // Then the individual model checkboxes.
  container.innerHTML = "";
  modelNames = {};
  for (const m of models) {
    const id = m.id;
    modelNames[id] = m.name || id;
    const label = document.createElement("label");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = id;
    cb.addEventListener("change", () => {
      cb.checked ? selectedModels.add(id) : selectedModels.delete(id);
      // A manual edit means the selection no longer matches a named group.
      groupSel.value = "";
      updateSelectionNote();
    });
    const span = document.createElement("span");
    span.textContent = m.name || id;
    label.appendChild(cb);
    const logo = providerLogoImg(id, 15);
    if (logo) label.appendChild(logo);
    label.appendChild(span);
    container.appendChild(label);
  }

  // Selecting a group ticks the matching checkboxes so the effect is visible.
  groupSel.addEventListener("change", applyGroupSelection);
  updateSelectionNote();
}

// Reflect the current selection in the note under the model list. The admin
// console has no cap, so we name the picks (and truncate a very long list).
function updateSelectionNote() {
  const note = document.getElementById("models-note");
  const total = document.querySelectorAll("#models input[type='checkbox']").length;
  const groupCount = Object.keys(curatedGroups).length;
  const ids = [...selectedModels];
  if (!ids.length) {
    note.textContent = `${total} models available · ${groupCount} curated groups. None selected yet.`;
    return;
  }
  const names = ids.map((id) => modelNames[id] || id);
  const CAP = 15;
  const shown = names.slice(0, CAP).join(", ");
  const extra = names.length > CAP ? ` + ${names.length - CAP} more` : "";
  note.textContent = `${ids.length} selected: ${shown}${extra}`;
  renderCoverage();
}

// A matrix of the currently-selected models (rows) against each benchmark test
// (columns), showing which already have a completed result — so it's obvious at
// a glance what a run would actually cover (and what would be skipped).
function renderCoverage() {
  const host = document.getElementById("coverage-table");
  if (!host) return;
  const ids = [...selectedModels];
  if (!benchmarksData.length) {
    host.innerHTML = '<div class="muted">Benchmarks not loaded yet.</div>';
    return;
  }
  if (!ids.length) {
    host.innerHTML = '<div class="muted">Select models (or a group) to see which tests they already have results for.</div>';
    return;
  }
  const benches = benchmarksData;
  const head =
    "<tr><th>Model</th>" +
    benches.map((b) => `<th class="cov-h">${escapeHtml(b.title || b.id)}</th>`).join("") +
    "</tr>";
  const rows = ids
    .map((id) => {
      const cells = benches
        .map((b) => {
          const has = (coverageByBench[b.id] || new Set()).has(id);
          return has
            ? '<td class="cov-yes" title="Has a result">✓</td>'
            : '<td class="cov-no" title="No result yet — a run would test this">—</td>';
        })
        .join("");
      return `<tr><td class="cov-model">${escapeHtml(modelNames[id] || id)}</td>${cells}</tr>`;
    })
    .join("");
  // Per-test totals across the selection.
  const totals = benches
    .map((b) => {
      const set = coverageByBench[b.id] || new Set();
      const done = ids.filter((id) => set.has(id)).length;
      return `<td class="cov-total">${done}/${ids.length}</td>`;
    })
    .join("");
  host.innerHTML =
    `<table class="cov"><thead>${head}</thead><tbody>${rows}` +
    `<tr class="cov-totals"><td>Have a result</td>${totals}</tr></tbody></table>`;
}

// Apply the chosen group: tick exactly its models, clear the rest, and keep
// selectedModels in sync so Run uses the same set the user can see.
function applyGroupSelection() {
  const groupSel = document.getElementById("group");
  const gid = groupSel.value;
  if (!gid) {
    updateSelectionNote();
    return;
  }
  const ids = new Set(curatedGroups[gid] || []);
  selectedModels = new Set();
  const boxes = document.querySelectorAll("#models input[type='checkbox']");
  let firstChecked = null;
  boxes.forEach((cb) => {
    const on = ids.has(cb.value);
    cb.checked = on;
    if (on) {
      selectedModels.add(cb.value);
      if (!firstChecked) firstChecked = cb;
    }
  });
  updateSelectionNote();
  if (firstChecked) firstChecked.scrollIntoView({ block: "nearest" });
}

async function loadBenchmarks(preloaded) {
  const host = document.getElementById("benchmarks");
  try {
    const data = preloaded || (await api("/api/admin/benchmarks"));
    benchmarksData = data.benchmarks || [];
    coverageByBench = {};
    for (const b of benchmarksData) {
      coverageByBench[b.id] = new Set(b.models || []);
    }
    renderCoverage();
    host.innerHTML = "";
    for (const b of data.benchmarks) {
      const row = document.createElement("div");
      row.className = "bench";
      const left = document.createElement("div");
      const updated = b.updated_at ? new Date(b.updated_at).toLocaleString() : "never run";
      left.innerHTML =
        `<div><b>${b.title}</b> <span class="pill">v${b.version}</span> <span class="pill">${b.kind}</span></div>` +
        `<div class="muted" style="font-size:12.5px;">${b.question_count} items · ${b.model_count} models scored · ${b.total_runs} runs · updated ${updated}</div>`;
      const btn = document.createElement("button");
      btn.className = "btn";
      btn.textContent = b.model_count ? "Run / rerun" : "Run";
      btn.addEventListener("click", () => runBenchmark(b.id, btn));
      row.appendChild(left);
      row.appendChild(btn);
      host.appendChild(row);
    }
  } catch (e) {
    host.innerHTML = `<div class="muted">Could not load benchmarks: ${e.message}</div>`;
  }
}

async function runBenchmark(benchmarkId, btn) {
  const reps = parseInt(document.getElementById("reps").value, 10) || 1;
  const force = Boolean(document.getElementById("force")?.checked);
  const body = { reps, force };
  // selectedModels is kept in sync with both the checkboxes and the group
  // dropdown, so it is the single source of truth for what to run.
  const modelIds = [...selectedModels];
  if (!modelIds.length) {
    toast("Select a group or tick at least one model first.");
    return;
  }
  body.models = modelIds;
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = "Starting…";
  try {
    const res = await api(`/api/admin/benchmarks/${benchmarkId}/run`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    const skipped = (res.skipped || []).length;
    if (!res.run_ids.length) {
      toast(res.message || "Nothing to run — all selected models already have a result.");
    } else {
      const tested = res.models.length;
      const skipNote = skipped ? ` (${skipped} already passed, skipped)` : "";
      toast(`Testing ${tested} new model${tested === 1 ? "" : "s"} this run${skipNote} · ${res.run_ids.length} run(s) started.`);
    }
    setTimeout(loadRuns, 800);
    setTimeout(loadBenchmarks, 1500);
  } catch (e) {
    toast("Run failed: " + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

let runsLoading = false;

async function loadRuns() {
  // Guard against overlapping loads: a slow request must not pile up behind
  // repeated clicks (or leave the button spinning twice). Manual refresh only —
  // no background timer.
  if (runsLoading) return;
  runsLoading = true;
  const tbody = document.getElementById("runs");
  const refreshBtn = document.getElementById("refresh-runs");
  const btnLabel = refreshBtn ? refreshBtn.textContent : "";
  if (refreshBtn) {
    refreshBtn.disabled = true;
    refreshBtn.textContent = "Refreshing…";
  }
  try {
    const data = await api("/api/admin/benchmarks/runs");
    const runs = data.runs || [];
    // Drop expanded-state for runs no longer shown.
    const visible = new Set(runs.slice(0, 25).map((r) => r.run_id));
    for (const id of [...expandedRuns]) if (!visible.has(id)) expandedRuns.delete(id);
    if (!runs.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="muted">No benchmark runs yet.</td></tr>';
      return;
    }
    tbody.innerHTML = "";
    for (const r of runs.slice(0, 25)) {
      renderRunRow(tbody, r);
    }
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="5" class="muted">Could not load runs: ${escapeHtml(e.message)}</td></tr>`;
  } finally {
    runsLoading = false;
    if (refreshBtn) {
      refreshBtn.disabled = false;
      refreshBtn.textContent = btnLabel || "Refresh";
    }
  }
}

// Fetch and render the stats & engagement dashboard (headline numbers, per-day
// sparklines for views/runs/cost, and top pages) from /api/admin/stats.
async function loadStats() {
  const cards = document.getElementById("stats-cards");
  const charts = document.getElementById("stats-charts");
  const pathsEl = document.getElementById("stats-paths");
  const btn = document.getElementById("refresh-stats");
  if (!cards) return;
  if (btn) btn.disabled = true;
  try {
    const s = await api("/api/admin/stats?days=30");
    const t = s.totals || {};
    const num = (n) => (n == null ? "0" : Number(n).toLocaleString());
    const money = (c) => (c == null ? "—" : "$" + Number(c).toFixed(2));
    const statusText = Object.entries(t.runs_by_status || {})
      .map(([k, v]) => `${v} ${k}`)
      .join(" · ");
    const cardData = [
      ["Page views", num(t.pageviews)],
      ["Sessions", num(t.sessions)],
      ["Runs", num(t.runs)],
      ["Est. cost", money(t.cost_usd)],
      ["Tokens in", num(t.tokens_in)],
      ["Tokens out", num(t.tokens_out)],
      ["Quizzes", num(t.quizzes)],
    ];
    cards.innerHTML = cardData
      .map(
        ([k, v]) =>
          `<div class="stat-card"><div class="v">${escapeHtml(String(v))}</div><div class="k">${escapeHtml(k)}</div></div>`
      )
      .join("");
    const series = s.series || {};
    const labels = series.labels || [];
    const spark = (vals, cls, fmt) => {
      const max = Math.max(1, ...(vals || []));
      const bars = (vals || [])
        .map(
          (v, i) =>
            `<div class="bar ${cls}" style="height:${Math.round((v / max) * 100)}%" title="${escapeHtml(labels[i] || "")}: ${escapeHtml(fmt(v))}"></div>`
        )
        .join("");
      return `<div class="spark">${bars}</div>`;
    };
    charts.innerHTML =
      `<div class="stat-chart"><h4>Page views / day</h4>${spark(series.pageviews, "views", (v) => String(v))}</div>` +
      `<div class="stat-chart"><h4>Runs / day</h4>${spark(series.runs, "", (v) => String(v))}</div>` +
      `<div class="stat-chart"><h4>Est. cost / day</h4>${spark(series.cost, "cost", (v) => "$" + Number(v).toFixed(2))}</div>`;
    const tp = s.top_paths || [];
    pathsEl.innerHTML = tp.length
      ? "Top pages: " + tp.map((p) => `${escapeHtml(p.path)} (${p.views})`).join(" · ") +
        (statusText ? ` · Runs: ${escapeHtml(statusText)}` : "")
      : statusText
        ? `Runs: ${escapeHtml(statusText)}`
        : "";
  } catch (e) {
    cards.innerHTML = `<div class="muted">Could not load stats: ${escapeHtml(e.message)}</div>`;
  } finally {
    if (btn) btn.disabled = false;
  }
}

// Render one run row plus, when a run had model failures, a hidden detail row
// that lists each failed model and the reason it dropped out (persisted on the
// run's settings.model_status by the runner).
function renderRunRow(tbody, r) {
  const settings = r.settings || {};
  const modelStatus = Array.isArray(settings.model_status) ? settings.model_status : [];
  const attempted = (r.models || []).length;
  const total = settings.models_total != null ? settings.models_total : attempted;
  const completed = settings.models_completed != null
    ? settings.models_completed
    : modelStatus.filter((m) => m.status === "completed" || m.status === "completed_with_errors").length;
  const failed = modelStatus.filter((m) => m.status === "failed");
  const warned = modelStatus.filter((m) => m.status === "completed_with_errors");
  const skipped = Array.isArray(settings.skipped_models) ? settings.skipped_models : [];
  const pct = total ? Math.round((completed / total) * 100) : 0;
  const cost = typeof settings.cost_usd === "number" ? settings.cost_usd : null;
  const costText = cost != null ? "~$" + (cost < 0.01 ? cost.toFixed(4) : cost.toFixed(2)) : "";
  const costMarkup = cost != null ? ` · <span class="muted">${costText}</span>` : "";
  const inProgress = ["queued", "running", "reporting"].includes(r.status);

  let resultsCell;
  if (modelStatus.length) {
    const okClass = completed === total ? "s-completed" : "s-warn";
    const failMarkup = failed.length ? ` · <span class="s-failed">${failed.length} failed</span>` : "";
    const skipMarkup = skipped.length ? ` · <span class="muted">${skipped.length} skipped</span>` : "";
    resultsCell = `<span class="${okClass}">${completed}/${total} ok · ${pct}%</span>${failMarkup}${skipMarkup}${costMarkup}`;
  } else if (inProgress) {
    resultsCell = `<span class="muted">—</span>`;
  } else {
    resultsCell = `<span class="muted">${completed}/${total}</span>`;
  }

  const created = r.created_at ? new Date(r.created_at).toLocaleString() : "";
  const hasDetail = failed.length > 0 || skipped.length > 0 || warned.length > 0;
  const tr = document.createElement("tr");
  tr.className = "run-row" + (hasDetail ? " expandable" : "");
  tr.innerHTML =
    `<td>${hasDetail ? '<span class="caret">▸</span>' : '<span class="caret"></span>'}${escapeHtml(r.quiz_title || r.quiz_id)}</td>` +
    `<td class="s-${r.status}">${escapeHtml(r.status)}</td>` +
    `<td class="muted">${attempted}</td>` +
    `<td>${resultsCell}</td>` +
    `<td class="muted">${escapeHtml(created)}</td>`;
  tbody.appendChild(tr);

  if (!hasDetail) return;
  const runId = r.run_id;
  const detailTr = document.createElement("tr");
  const startOpen = expandedRuns.has(runId);
  detailTr.hidden = !startOpen;
  const failRows = failed
    .map(
      (m) =>
        `<div class="fail-row"><span class="fail-model">${escapeHtml(m.model)}</span> — ` +
        `<span class="fail-error">${escapeHtml(m.error || "unknown error")}</span></div>`
    )
    .join("");
  const skipRows = skipped
    .map((m) => {
      const when = m.last_completed ? new Date(m.last_completed).toLocaleString() : "earlier";
      return `<div class="fail-row"><span class="fail-model">${escapeHtml(m.model)}</span> — ` +
        `<span class="muted">already completed ${escapeHtml(when)} (skipped to save credits)</span></div>`;
    })
    .join("");
  const failBlock = failed.length
    ? `<div class="fail-title">Models that did not complete (${failed.length})</div>${failRows}`
    : "";
  const skipBlock = skipped.length
    ? `<div class="fail-title" style="margin-top:8px;">Skipped — already have a result (${skipped.length})</div>${skipRows}`
    : "";
  const warnRows = warned
    .map(
      (m) =>
        `<div class="fail-row"><span class="fail-model">${escapeHtml(m.model)}</span> — ` +
        `<span class="muted">${escapeHtml(m.error || "completed with errors")}</span></div>`
    )
    .join("");
  const warnBlock = warned.length
    ? `<div class="fail-title" style="margin-top:8px;">Completed with errors (${warned.length})</div>${warnRows}`
    : "";
  const summaryBlock = modelStatus.length
    ? `<div class="fail-summary">This run tested <b>${total}</b> model${total === 1 ? "" : "s"} — ` +
      `<b>${completed}</b> passed (${pct}%)${failed.length ? `, <b>${failed.length}</b> failed` : ""}.` +
      (skipped.length ? ` <b>${skipped.length}</b> skipped (already passed).` : "") +
      (cost != null ? ` Est. cost <b>${costText}</b>.` : "") +
      `</div>`
    : "";
  detailTr.innerHTML =
    `<td colspan="5"><div class="fail-detail">${summaryBlock}${failBlock}${warnBlock}${skipBlock}</div></td>`;
  tbody.appendChild(detailTr);

  const caret = tr.querySelector(".caret");
  if (caret && startOpen) caret.textContent = "▾";
  tr.addEventListener("click", () => {
    const opening = detailTr.hidden;
    detailTr.hidden = !detailTr.hidden;
    if (opening) expandedRuns.add(runId);
    else expandedRuns.delete(runId);
    if (caret) caret.textContent = detailTr.hidden ? "▸" : "▾";
  });
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function init() {
  const tokenInput = document.getElementById("token");
  tokenInput.value = getToken();
  document.getElementById("save-token").addEventListener("click", async () => {
    localStorage.setItem(TOKEN_KEY, tokenInput.value.trim());
    if (await unlock()) toast("Unlocked.");
  });
  tokenInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("save-token").click();
  });
  document.getElementById("refresh-runs").addEventListener("click", loadRuns);
  document.getElementById("refresh-stats")?.addEventListener("click", loadStats);

  const changeToken = document.getElementById("change-token");
  if (changeToken) {
    changeToken.addEventListener("click", (e) => {
      e.preventDefault();
      const tokenPanel = document.getElementById("token-panel");
      if (tokenPanel) tokenPanel.hidden = false;
      changeToken.hidden = true;
      tokenInput.value = getToken();
      tokenInput.focus();
    });
  }

  const toggleModels = document.getElementById("toggle-models");
  const modelsEl = document.getElementById("models");
  if (toggleModels && modelsEl) {
    toggleModels.addEventListener("click", () => {
      const collapsed = modelsEl.classList.toggle("collapsed");
      toggleModels.textContent = collapsed ? "Show individual models" : "Hide individual models";
    });
  }

  // Nothing is shown until an admin probe succeeds. Auto-attempt with any
  // stored token (or an open local-dev server) on load. The runs table then
  // only refreshes when you press Refresh — no invisible timer to fight with.
  unlock();
}

init();
