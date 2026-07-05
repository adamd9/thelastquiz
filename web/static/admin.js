/* The Last Quiz — benchmark admin console (dependency-free).
 * Talks to /api/admin/benchmarks* (auth-ready: sends X-Admin-Token if set) and
 * /api/models. Benchmark runs update the public /rankings page live. */

const TOKEN_KEY = "tlq_admin_token";
let selectedModels = new Set();

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
  const res = await fetch(path, {
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

async function loadModels() {
  const note = document.getElementById("models-note");
  try {
    const data = await api("/api/models");
    const container = document.getElementById("models");
    container.innerHTML = "";
    const models = data.models || [];
    for (const m of models) {
      const id = m.id;
      const label = document.createElement("label");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.value = id;
      cb.addEventListener("change", () => {
        cb.checked ? selectedModels.add(id) : selectedModels.delete(id);
      });
      const span = document.createElement("span");
      span.textContent = m.name || id;
      label.appendChild(cb);
      label.appendChild(span);
      container.appendChild(label);
    }
    const groupSel = document.getElementById("group");
    for (const g of Object.keys(data.groups || {})) {
      const opt = document.createElement("option");
      opt.value = g;
      opt.textContent = g;
      groupSel.appendChild(opt);
    }
    note.textContent = `${models.length} models available.`;
  } catch (e) {
    note.textContent = "Could not load models: " + e.message;
  }
}

async function loadBenchmarks() {
  const host = document.getElementById("benchmarks");
  try {
    const data = await api("/api/admin/benchmarks");
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
  const group = document.getElementById("group").value;
  const reps = parseInt(document.getElementById("reps").value, 10) || 1;
  const body = { reps };
  if (group) {
    body.group = group;
  } else {
    body.models = [...selectedModels];
    if (!body.models.length) {
      toast("Select at least one model or a group first.");
      return;
    }
  }
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = "Starting…";
  try {
    const res = await api(`/api/admin/benchmarks/${benchmarkId}/run`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    toast(`Started ${res.run_ids.length} run(s) for ${res.models.length} model(s).`);
    setTimeout(loadRuns, 800);
    setTimeout(loadBenchmarks, 1500);
  } catch (e) {
    toast("Run failed: " + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

async function loadRuns() {
  const tbody = document.getElementById("runs");
  try {
    const data = await api("/api/admin/benchmarks/runs");
    const runs = data.runs || [];
    if (!runs.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="muted">No benchmark runs yet.</td></tr>';
      return;
    }
    tbody.innerHTML = "";
    for (const r of runs.slice(0, 25)) {
      const tr = document.createElement("tr");
      const created = r.created_at ? new Date(r.created_at).toLocaleString() : "";
      tr.innerHTML =
        `<td>${r.quiz_title || r.quiz_id}</td>` +
        `<td class="s-${r.status}">${r.status}</td>` +
        `<td class="muted">${(r.models || []).length}</td>` +
        `<td class="muted">${created}</td>`;
      tbody.appendChild(tr);
    }
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="4" class="muted">Could not load runs: ${e.message}</td></tr>`;
  }
}

function init() {
  const tokenInput = document.getElementById("token");
  tokenInput.value = getToken();
  document.getElementById("save-token").addEventListener("click", () => {
    localStorage.setItem(TOKEN_KEY, tokenInput.value.trim());
    toast("Token saved.");
    loadBenchmarks();
    loadRuns();
  });
  document.getElementById("refresh-runs").addEventListener("click", loadRuns);

  loadModels();
  loadBenchmarks();
  loadRuns();
  setInterval(loadRuns, 5000);
}

init();
