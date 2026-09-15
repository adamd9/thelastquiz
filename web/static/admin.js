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
// Both test kinds (personality benchmarks + deception experiments) and which
// models already have a result, for the coverage table + "run missing".
let benchmarksData = [];
let experimentsData = [];
let coverageByBench = {};
let coverageByExp = {};
// Per test, model_id -> ISO timestamp of the model's latest result, so the
// coverage table can show WHEN each tick was produced (spot rerun freshness).
let coverageDatesByBench = {};
let coverageDatesByExp = {};
// Tests list filter: all | benchmark | experiment (cosmetic; the coverage matrix
// and "run all missing" always span every test).
let testFilter = "all";
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
  loadExperiments();
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

// A matrix of the currently-selected models (rows) against every test (columns:
// personality benchmarks + deception experiments), showing which already have a
// completed result and a per-model "Run missing" button that tops up the gaps.
function renderCoverage() {
  const host = document.getElementById("coverage-table");
  const runAll = document.getElementById("run-all-missing");
  if (!host) return;
  const ids = [...selectedModels];
  const tests = allTests();
  if (!tests.length) {
    host.innerHTML = '<div class="muted">Tests not loaded yet.</div>';
    if (runAll) { runAll.disabled = true; runAll.textContent = "Run all missing"; }
    return;
  }
  if (!ids.length) {
    host.innerHTML = '<div class="muted">Select models (or a group) to see which tests they already have results for.</div>';
    if (runAll) { runAll.disabled = true; runAll.textContent = "Run all missing"; }
    return;
  }
  const head =
    "<tr><th>Model</th>" +
    tests
      .map((t) => {
        const kind = t.kind === "experiment" ? "Deception" : "Personality";
        return `<th class="cov-h" title="${escapeHtml(kind + " · v" + t.version)}">${escapeHtml(t.title || t.id)}</th>`;
      })
      .join("") +
    '<th class="cov-h">Missing</th></tr>';
  let totalMissing = 0;
  const rows = ids
    .map((id) => {
      let miss = 0;
      const cells = tests
        .map((t) => {
          if (!t.cov.has(id)) {
            miss++;
            return '<td class="cov-no" title="No result yet — a run would test this">—</td>';
          }
          const iso = t.dates[id];
          const d = iso ? new Date(iso) : null;
          const valid = d && !isNaN(d.getTime());
          const short = valid ? d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";
          const title = valid ? `Result from ${d.toLocaleString()}` : "Has a result";
          return `<td class="cov-yes" title="${escapeHtml(title)}">✓${short ? `<span class="cov-date">${escapeHtml(short)}</span>` : ""}</td>`;
        })
        .join("");
      totalMissing += miss;
      const action = miss
        ? `<button class="btn cov-run" data-model="${escapeHtml(id)}" title="Run the ${miss} missing test${miss === 1 ? "" : "s"} for this model">Run ${miss}</button>`
        : '<span class="cov-alldone" title="Fully tested">✓ all</span>';
      return `<tr><td class="cov-model">${escapeHtml(modelNames[id] || id)}</td>${cells}<td class="cov-missing">${action}</td></tr>`;
    })
    .join("");
  const totals = tests
    .map((t) => {
      const done = ids.filter((id) => t.cov.has(id)).length;
      return `<td class="cov-total">${done}/${ids.length}</td>`;
    })
    .join("");
  host.innerHTML =
    `<table class="cov"><thead>${head}</thead><tbody>${rows}` +
    `<tr class="cov-totals"><td>Have a result</td>${totals}<td></td></tr></tbody></table>`;
  host.querySelectorAll("button.cov-run").forEach((b) => {
    b.addEventListener("click", () => runMissing([b.dataset.model], b));
  });
  if (runAll) {
    runAll.disabled = totalMissing === 0;
    runAll.textContent = totalMissing ? `Run all missing (${totalMissing})` : "Run all missing";
  }
}

// One normalised view over both test kinds, so a single list, coverage matrix
// and "run missing" path treat them identically. Coverage sets/dates are
// populated by the two loaders below.
function allTests() {
  const b = benchmarksData.map((x) => ({
    kind: "benchmark", id: x.id, title: x.title, version: x.version,
    count: x.question_count, unit: "items",
    modelCount: x.model_count, totalRuns: x.total_runs, updatedAt: x.updated_at,
    cov: coverageByBench[x.id] || new Set(), dates: coverageDatesByBench[x.id] || {},
  }));
  const e = experimentsData.map((x) => ({
    kind: "experiment", id: x.id, title: x.title, version: x.version,
    count: x.condition_count, unit: "conditions",
    modelCount: x.model_count, totalRuns: x.total_runs, updatedAt: x.updated_at,
    cov: coverageByExp[x.id] || new Set(), dates: coverageDatesByExp[x.id] || {},
    exp: x,
  }));
  return [...b, ...e];
}

// Render the single combined Tests list (respecting the filter tabs). Both
// loaders call this, so it renders whatever data has arrived so far.
function renderTests() {
  const host = document.getElementById("tests");
  if (!host) return;
  if (!benchmarksData.length && !experimentsData.length) {
    host.innerHTML = '<div class="muted">Loading…</div>';
    return;
  }
  const tests = allTests().filter((t) => testFilter === "all" || t.kind === testFilter);
  if (!tests.length) {
    host.innerHTML = '<div class="muted">No tests in this view.</div>';
    return;
  }
  host.innerHTML = "";
  for (const t of tests) {
    const block = document.createElement("div");
    block.className = "bench-block";
    const row = document.createElement("div");
    row.className = "bench";
    const left = document.createElement("div");
    const updated = t.updatedAt ? new Date(t.updatedAt).toLocaleString() : "never run";
    const kindPill = t.kind === "experiment" ? "deception" : "personality";
    left.innerHTML =
      `<div><b>${escapeHtml(t.title)}</b> <span class="pill">v${escapeHtml(String(t.version))}</span> <span class="pill pill-${t.kind}">${kindPill}</span></div>` +
      `<div class="muted" style="font-size:12.5px;">${t.count} ${t.unit} · ${t.modelCount} models · ${t.totalRuns} runs · updated ${escapeHtml(updated)}</div>`;
    const runBtn = document.createElement("button");
    runBtn.className = "btn";
    runBtn.textContent = t.modelCount ? "Run / rerun" : "Run";
    runBtn.addEventListener("click", () => runTest(t, runBtn));
    if (t.kind === "experiment") {
      const actions = document.createElement("div");
      actions.className = "bench-actions";
      const resultHost = document.createElement("div");
      resultHost.className = "exp-results";
      resultHost.hidden = true;
      const resultsBtn = document.createElement("button");
      resultsBtn.className = "btn secondary";
      resultsBtn.textContent = "Results";
      resultsBtn.addEventListener("click", () => loadExperimentResults(t.exp, resultHost, resultsBtn));
      actions.appendChild(resultsBtn);
      actions.appendChild(runBtn);
      row.appendChild(left);
      row.appendChild(actions);
      block.appendChild(row);
      block.appendChild(resultHost);
    } else {
      row.appendChild(left);
      row.appendChild(runBtn);
      block.appendChild(row);
    }
    host.appendChild(block);
  }
}

function runReps() {
  return parseInt(document.getElementById("reps").value, 10) || 1;
}

async function postRun(kind, id, models, reps, force) {
  const path = kind === "experiment"
    ? `/api/admin/experiments/${id}/run`
    : `/api/admin/benchmarks/${id}/run`;
  return api(path, { method: "POST", body: JSON.stringify({ models, reps, force }) });
}

// Run one test against the current model selection (unifies the old
// runBenchmark/runExperiment).
async function runTest(test, btn) {
  const models = [...selectedModels];
  if (!models.length) {
    toast("Select a group or tick at least one model first.");
    return;
  }
  const force = Boolean(document.getElementById("force")?.checked);
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = "Starting…";
  try {
    const res = await postRun(test.kind, test.id, models, runReps(), force);
    if (!res.run_ids || !res.run_ids.length) {
      toast(res.message || "Nothing to run — all selected models already have a result.");
    } else {
      const tested = (res.models || []).length;
      const skipped = (res.skipped || []).length;
      const skipNote = skipped ? ` (${skipped} already done, skipped)` : "";
      toast(`Testing ${tested} model${tested === 1 ? "" : "s"}${skipNote} · ${res.run_ids.length} run(s) started.`);
    }
    setTimeout(loadRuns, 800);
    setTimeout(test.kind === "experiment" ? loadExperiments : loadBenchmarks, 1500);
  } catch (e) {
    toast("Run failed: " + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

// The "top up" path: for the given models, run ONLY the (model × test) cells
// that don't have a result yet — one POST per test with just its missing models.
// This is what turns onboarding a newly-added model into a single click.
async function runMissing(models, btn) {
  if (!models.length) {
    toast("Select a group or tick at least one model first.");
    return;
  }
  const tests = allTests();
  if (!tests.length) {
    toast("Tests not loaded yet.");
    return;
  }
  const jobs = [];
  let cells = 0;
  const touched = new Set();
  for (const t of tests) {
    const miss = models.filter((m) => !t.cov.has(m));
    if (miss.length) {
      jobs.push({ t, miss });
      cells += miss.length;
      miss.forEach((m) => touched.add(m));
    }
  }
  if (!jobs.length) {
    toast("Nothing to top up — every selected model already has every test.");
    return;
  }
  const label = btn ? btn.textContent : "";
  if (btn) { btn.disabled = true; btn.textContent = "Queuing…"; }
  const reps = runReps();
  const results = await Promise.allSettled(
    jobs.map((j) => postRun(j.t.kind, j.t.id, j.miss, reps, false))
  );
  const failed = results.filter((r) => r.status === "rejected").length;
  const okTests = jobs.length - failed;
  toast(
    `Topped up ${touched.size} model${touched.size === 1 ? "" : "s"} across ${okTests} test${okTests === 1 ? "" : "s"} · ${cells} model-run${cells === 1 ? "" : "s"} queued` +
      (failed ? ` · ${failed} failed` : "") + "."
  );
  if (btn) { btn.disabled = false; btn.textContent = label; }
  setTimeout(loadRuns, 900);
  setTimeout(() => { loadBenchmarks(); loadExperiments(); }, 1700);
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
  try {
    const data = preloaded || (await api("/api/admin/benchmarks"));
    benchmarksData = data.benchmarks || [];
    coverageByBench = {};
    coverageDatesByBench = {};
    for (const b of benchmarksData) {
      coverageByBench[b.id] = new Set(b.models || []);
      coverageDatesByBench[b.id] = b.model_dates || {};
    }
    renderTests();
    renderCoverage();
  } catch (e) {
    const host = document.getElementById("tests");
    if (host) host.innerHTML = `<div class="muted">Could not load benchmarks: ${escapeHtml(e.message)}</div>`;
  }
}

// --- Operational deception experiments (separate from personality benchmarks) ---
function pct(value) {
  return value == null ? "—" : `${Math.round(Number(value) * 100)}%`;
}

function shortCond(label) {
  return String(label || "").split(" (")[0];
}

function expMethodUrl() {
  const home = window.__destUrl ? window.__destUrl("home") : "/";
  try {
    return new URL("ai-deception-experiment", new URL(home, window.location.origin)).toString();
  } catch (e) {
    return "/ai-deception-experiment";
  }
}

async function loadExperiments() {
  try {
    const data = await api("/api/admin/experiments");
    experimentsData = data.experiments || [];
    coverageByExp = {};
    coverageDatesByExp = {};
    for (const e of experimentsData) {
      coverageByExp[e.id] = new Set(e.models || []);
      coverageDatesByExp[e.id] = e.model_dates || {};
    }
    renderTests();
    renderCoverage();
  } catch (e) {
    // Don't clobber a good benchmarks list if only experiments failed.
    const host = document.getElementById("tests");
    if (host && !benchmarksData.length) {
      host.innerHTML = `<div class="muted">Could not load experiments: ${escapeHtml(e.message)}</div>`;
    }
  }
}

async function loadExperimentResults(exp, host, btn) {
  if (!host.hidden) {
    host.hidden = true;
    btn.textContent = "Results";
    return;
  }
  host.hidden = false;
  btn.textContent = "Hide results";
  host.innerHTML = '<div class="muted">Loading results…</div>';
  try {
    const data = await api(`/api/admin/experiments/${exp.id}/results`);
    const models = data.models || {};
    const rows = Object.entries(models).sort(([a], [b]) => a.localeCompare(b));
    if (!rows.length) {
      host.innerHTML = '<div class="muted">No complete model results yet.</div>';
      return;
    }
    const conditions = exp.conditions || [];
    const header =
      `<th>Model</th><th>Deception</th>` +
      conditions
        .map((c) => `<th title="${escapeHtml((c.dimensions || []).join(", "))}">${escapeHtml(shortCond(c.label))}</th>`)
        .join("") +
      `<th>Invalid</th>`;
    const body = rows
      .map(([modelId, entry]) => {
        const conds = entry.conditions || {};
        const cells = conditions
          .map((c) => {
            const cell = conds[c.id] || {};
            const ex = (cell.examples || [])[0];
            const title = ex ? `${ex.choice || "invalid"} — ${ex.reason || ""}` : "";
            const t = title ? ` title="${escapeHtml(title)}"` : "";
            if (cell.deceptive_rate == null) return `<td class="muted"${t}>—</td>`;
            const cls = cell.deceptive_rate >= 0.5 ? "exp-deny" : "exp-ok";
            return `<td class="${cls}"${t}>${pct(cell.deceptive_rate)}<span class="cell-detail">${cell.deceptive}/${cell.valid}</span></td>`;
          })
          .join("");
        const overall = entry.deceptive_rate == null ? "—" : pct(entry.deceptive_rate);
        return (
          `<tr><td class="cov-model">${escapeHtml(modelNames[modelId] || modelId)}</td>` +
          `<td><b>${overall}</b><span class="cell-detail">${entry.deceptive}/${entry.valid}</span></td>` +
          cells +
          `<td>${entry.invalid}</td></tr>`
        );
      })
      .join("");
    const contrastDefs = exp.contrasts || [];
    const summary = rows
      .map(([modelId, entry]) => {
        const cs = contrastDefs
          .map((cd) => {
            const v = (entry.contrasts || {})[cd.id];
            const shown = v == null ? "—" : `${v > 0 ? "+" : ""}${Math.round(v * 100)} pts`;
            return `${escapeHtml(cd.label)}: <b>${shown}</b>`;
          })
          .join(" · ");
        return cs ? `<div><span class="muted">${escapeHtml(modelNames[modelId] || modelId)}:</span> ${cs}</div>` : "";
      })
      .join("");
    const reasons = rows
      .map(([modelId, entry]) => {
        const conds = entry.conditions || {};
        const items = conditions
          .map((c) => {
            const ex = ((conds[c.id] || {}).examples || [])[0];
            if (!ex) return "";
            const cls = ex.deceptive ? "exp-deny" : ex.valid ? "exp-ok" : "muted";
            const label = ex.valid ? ex.choice || "" : "invalid";
            return `<div class="exp-reason"><b>${escapeHtml(shortCond(c.label))}</b> <span class="${cls}">${escapeHtml(label)}</span> — <span class="muted">${escapeHtml(ex.reason || "")}</span></div>`;
          })
          .join("");
        return items
          ? `<details class="exp-reasons"><summary>${escapeHtml(modelNames[modelId] || modelId)} — reasons</summary>${items}</details>`
          : "";
      })
      .join("");
    const methodUrl = expMethodUrl();
    host.innerHTML =
      `<div class="exp-head"><div><b>Deception by condition</b> <span class="muted">· deny/omit rate + reasons, pooled across runs</span></div>` +
      `<a href="${escapeHtml(methodUrl)}">Method</a></div>` +
      `<div class="table-scroll"><table class="exp-table"><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table></div>` +
      (summary
        ? `<div class="exp-summary"><div class="fail-title" style="margin-bottom:4px;">Contrasts (percentage-point change)</div>${summary}</div>`
        : "") +
      (reasons ? `<div class="exp-reason-wrap">${reasons}</div>` : "");
  } catch (e) {
    host.innerHTML = `<div class="muted">Could not load results: ${escapeHtml(e.message)}</div>`;
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
    const done = settings.models_done != null ? settings.models_done : 0;
    const totalM = total || attempted;
    const p = totalM ? Math.round((done / totalM) * 100) : 0;
    resultsCell =
      `<span class="s-running">${done}/${totalM} models \u00b7 ${p}%</span>` +
      `<span class="progress-bar"><span style="width:${p}%"></span></span>`;
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

  const runAllMissing = document.getElementById("run-all-missing");
  if (runAllMissing) {
    runAllMissing.addEventListener("click", () => runMissing([...selectedModels], runAllMissing));
  }
  document.querySelectorAll("#test-filters .tf-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      testFilter = tab.dataset.filter || "all";
      document.querySelectorAll("#test-filters .tf-tab").forEach((t) => t.classList.toggle("active", t === tab));
      renderTests();
    });
  });

  // Nothing is shown until an admin probe succeeds. Auto-attempt with any
  // stored token (or an open local-dev server) on load. The runs table then
  // only refreshes when you press Refresh — no invisible timer to fight with.
  unlock();
}

init();
