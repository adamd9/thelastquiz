import { fetchJSON, loadRunDetails, refreshRuns, rerunReport, selectRun } from "../api.js";
import { state, setCurrentStep } from "../state.js";
import {
  buildAffinity,
  buildAnswerSummary,
  buildAssetGroups,
  buildExpectedAssetTypes,
  buildModelGroups,
  escapeHtml,
  findOutcomeDescription,
  formatDuration,
  formatRelativeTime,
  getScoringSummary,
  groupOutcomes,
  outcomeAsIdentity,
  prettifyModelId,
} from "../utils.js";

function runDisplayTitle(run) {
  return run?.quiz_title || run?.quiz_id || "Untitled quiz";
}

// Run logs are written with UTC ISO timestamps; show them in the viewer's local time.
function localizeLogTimestamps(text) {
  return String(text || "").replace(
    /\[(\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2}))\]/g,
    (full, iso) => {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return full;
      return `[${d.toLocaleTimeString()}]`;
    }
  );
}

class RunList extends HTMLElement {
  connectedCallback() {
    this._sig = null;
    this.render();
    refreshRuns();
    document.addEventListener("runs:updated", () => this.render());
    document.addEventListener("run:selected", () => this.render());
  }

  computeSignature() {
    return JSON.stringify({
      selected: state.selectedRun,
      error: state.runError || "",
      runs: state.runs.map((run) => [run.run_id, run.status, runDisplayTitle(run)]),
    });
  }

  render() {
    // Skip DOM writes when nothing visible changed (prevents flicker during polling).
    const signature = this.computeSignature();
    if (signature === this._sig) return;
    this._sig = signature;

    const items = state.runs
      .map((run) => {
        const isActive = state.selectedRun === run.run_id;
        return `
        <div class="list-item ${isActive ? "active" : ""}" data-run="${run.run_id}">
          <strong>${escapeHtml(runDisplayTitle(run))}</strong>
          <div class="status">
            <span class="status-pill status-${run.status}">${run.status}</span>
            <span class="run-when">${escapeHtml(formatRelativeTime(run.created_at))}</span>
          </div>
        </div>
      `;
      })
      .join("");
    this.innerHTML = `
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">
            <h2>Quiz runs</h2>
            <div class="panel-subtitle">Each run of a quiz against a set of models.</div>
          </div>
          <div class="actions">
            <button data-new-run>+ New quiz</button>
            <button class="secondary" data-reuse-quiz>Reuse a past quiz</button>
          </div>
        </div>
        ${state.runError ? `<div class="status">${escapeHtml(state.runError)}</div>` : ""}
        <div class="list scroll">${items || "<div class='status'>No runs yet — tap “New quiz” to start.</div>"}</div>
      </div>
    `;
    this.querySelector("button[data-new-run]")?.addEventListener("click", () => {
      setCurrentStep(1);
    });
    this.querySelector("button[data-reuse-quiz]")?.addEventListener("click", () => {
      setCurrentStep(2);
    });
    this.querySelectorAll(".list-item[data-run]").forEach((item) => {
      item.addEventListener("click", async () => {
        const runId = item.dataset.run;
        try {
          state.runError = null;
          await selectRun(runId);
        } catch (err) {
          state.runError = `Failed to load run: ${err.message}`;
          this._sig = null;
          this.render();
        }
      });
    });
  }
}

const TERMINAL_STATUSES = ["completed", "failed"];

function buildAssetGroupsForRun(runData) {
  const expectedAssets = buildExpectedAssetTypes(runData, state.selectedRunQuizMeta, state.assets);
  return buildAssetGroups(expectedAssets, state.assets || []);
}

function assetRowHtml(group, isActive) {
  const asset = group.primaryAsset;
  const stateClass = group.readyCount > 0 ? "ready" : isActive ? "pending" : "missing";
  const stateLabel = group.readyCount > 0 ? "Ready" : isActive ? "Generating" : "Missing";
  const rawPath = asset?.path || "";
  const fileName = rawPath.split(/[/\\]/).pop() || "report.md";
  const lowerPath = rawPath.toLowerCase();
  const isMarkdown =
    Boolean(asset) &&
    (asset.asset_type === "report_markdown" ||
      lowerPath.endsWith(".md") ||
      lowerPath.endsWith(".markdown"));
  const isChart =
    Boolean(asset) &&
    (asset.asset_type?.startsWith("chart_") ||
      lowerPath.endsWith(".png") ||
      lowerPath.endsWith(".jpg") ||
      lowerPath.endsWith(".jpeg") ||
      lowerPath.endsWith(".gif") ||
      lowerPath.endsWith(".webp") ||
      lowerPath.endsWith(".svg"));
  const link = asset?.url
    ? isMarkdown
      ? `<button class="asset-link" data-markdown-url="${escapeHtml(asset.url)}" data-markdown-title="${escapeHtml(
          group.label
        )}" data-markdown-filename="${escapeHtml(fileName)}">${group.label}</button>`
      : isChart
        ? `<button class="asset-link" data-chart-url="${escapeHtml(asset.url)}" data-chart-title="${escapeHtml(
            group.label
          )}" data-chart-filename="${escapeHtml(fileName)}">${group.label}</button>`
        : `<a href="${asset.url}" target="_blank" rel="noopener">${group.label}</a>`
    : `<span>${group.label}</span>`;
  const variants =
    group.variants?.length > 1
      ? `<div class="status">Includes: ${group.variants.join(", ")}</div>`
      : "";
  return `
    <div class="asset-item ${stateClass}">
      <span class="asset-status ${stateClass}" aria-hidden="true"></span>
      <div class="asset-label">
        <div class="asset-title">${link}</div>
        ${variants}
      </div>
      <div class="asset-state">${stateLabel}</div>
    </div>
  `;
}

// A model's pick shown as a chip. When the model gave a reason, the chip becomes
// a collapsible so the (sometimes hilarious) explanation can be revealed on demand.
function pickerHtml(pick, multi) {
  const name = escapeHtml(prettifyModelId(pick.modelId));
  const reason = pick.reason ? escapeHtml(pick.reason) : "";
  if (!reason) {
    return `<span class="model-chip">${name}</span>`;
  }
  const label = multi ? name : "Why?";
  return `
    <details class="qa-why">
      <summary class="qa-why-summary"><span class="model-chip is-toggle">${label}<span class="why-caret" aria-hidden="true">▾</span></span></summary>
      <div class="qa-why-body">${reason}</div>
    </details>
  `;
}

// A model that declined to answer. We keep (and reveal) its reason, since a
// refusal — especially to an inappropriate question — is often the interesting bit.
function declineHtml(refusal, multi) {
  const name = escapeHtml(prettifyModelId(refusal.modelId));
  const reason = refusal.reason ? escapeHtml(refusal.reason) : "";
  const label = multi ? `${name} declined` : "Declined to answer";
  if (!reason) {
    return `<span class="model-chip decline">${label}</span>`;
  }
  return `
    <details class="qa-why decline">
      <summary class="qa-why-summary"><span class="model-chip is-toggle decline">${label}<span class="why-caret" aria-hidden="true">▾</span></span></summary>
      <div class="qa-why-body">${reason}</div>
    </details>
  `;
}

const RADAR_COLORS = [
  "#da5f35",
  "#0f5c78",
  "#3d8b5f",
  "#8a5fbf",
  "#c9a227",
  "#b83b2f",
  "#2f8f8a",
  "#a4508b",
];

// Shorten an outcome label for use as a radar/bar axis ("a Peace Lily" -> "Peace Lily").
function affinityAxisLabel(label) {
  let s = String(label).replace(/^\s*(a|an|the)\s+/i, "").trim();
  if (s.length > 18) s = `${s.slice(0, 17).trim()}…`;
  return s;
}

// Render an inline SVG radar/spider chart. `axes` = outcome labels (>=3),
// `series` = [{ name, color, values:[0..100 per axis] }]. All models overlaid.
function radarSvg(axes, series) {
  const K = axes.length;
  if (K < 3) return "";
  const W = 440;
  const H = 360;
  const cx = 220;
  const cy = 182;
  const R = 116;
  const LR = R + 20;
  const ang = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / K;
  const at = (i, radius) => [cx + radius * Math.cos(ang(i)), cy + radius * Math.sin(ang(i))];
  const atV = (i, v) => at(i, (R * Math.max(0, Math.min(100, v))) / 100);
  const fmt = (n) => n.toFixed(1);

  const rings = [20, 40, 60, 80, 100]
    .map((v) => `<circle cx="${cx}" cy="${cy}" r="${fmt((R * v) / 100)}" class="radar-ring" />`)
    .join("");

  let axisLines = "";
  let labels = "";
  for (let i = 0; i < K; i += 1) {
    const [ax, ay] = at(i, R);
    axisLines += `<line x1="${cx}" y1="${cy}" x2="${fmt(ax)}" y2="${fmt(ay)}" class="radar-axis" />`;
    const [lx, ly] = at(i, LR);
    const anchor = Math.abs(lx - cx) < 6 ? "middle" : lx < cx ? "end" : "start";
    labels += `<text x="${fmt(lx)}" y="${fmt(ly)}" text-anchor="${anchor}" dominant-baseline="middle" class="radar-label">${escapeHtml(axes[i])}</text>`;
  }

  const scale = [20, 40, 60, 80, 100]
    .map((v) => {
      const [sx, sy] = at(0, (R * v) / 100);
      return `<text x="${fmt(sx + 5)}" y="${fmt(sy)}" dominant-baseline="middle" class="radar-scale">${v}</text>`;
    })
    .join("");

  const polys = series
    .map((s) => {
      const pts = axes.map((_, i) => atV(i, s.values[i] || 0).map(fmt).join(",")).join(" ");
      return `<polygon points="${pts}" fill="${s.color}" fill-opacity="0.16" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" />`;
    })
    .join("");

  const dots = series
    .map((s) =>
      axes
        .map((_, i) => {
          const [x, y] = atV(i, s.values[i] || 0);
          return `<circle cx="${fmt(x)}" cy="${fmt(y)}" r="2.6" fill="${s.color}" />`;
        })
        .join("")
    )
    .join("");

  return `<svg viewBox="0 0 ${W} ${H}" class="radar-svg" role="img" aria-label="Personality radar">${rings}${axisLines}${scale}${labels}${polys}${dots}</svg>`;
}

function radarLegend(series) {
  return `<div class="radar-legend">${series
    .map(
      (s) =>
        `<span class="radar-legend-item"><span class="radar-swatch" style="background:${s.color}"></span>${escapeHtml(s.name)}</span>`
    )
    .join("")}</div>`;
}

// Fallback for 2-dimension quizzes where a radar would be degenerate.
function affinityBars(perModel, multi) {
  return perModel
    .filter((m) => m.segments.length)
    .map((m) => {
      const rows = m.segments
        .map(
          (s) => `
          <div class="affinity-row ${s.isTop ? "top" : ""}">
            <div class="affinity-label">${escapeHtml(affinityAxisLabel(s.label))}</div>
            <div class="affinity-track"><div class="affinity-fill" style="width:${s.pct}%"></div></div>
            <div class="affinity-pct">${s.pct}%</div>
          </div>`
        )
        .join("");
      return `<div class="affinity-card">${
        multi ? `<div class="affinity-model">${escapeHtml(prettifyModelId(m.modelId))}</div>` : ""
      }<div class="affinity-bars">${rows}</div></div>`;
    })
    .join("");
}

class RunPanel extends HTMLElement {
  connectedCallback() {
    this._built = false;
    this._sigMeta = null;
    this._sigAssets = null;
    this._sigHero = null;
    this._sigAffinity = null;
    this._sigSummary = null;
    this._sigRerun = null;
    this._onChange = () => this.update();
    document.addEventListener("run:selected", this._onChange);
    document.addEventListener("run:datachanged", this._onChange);
    this.update();
  }

  disconnectedCallback() {
    document.removeEventListener("run:selected", this._onChange);
    document.removeEventListener("run:datachanged", this._onChange);
  }

  update() {
    if (!state.selectedRun) {
      this._built = false;
      this.innerHTML = `
        <div class="panel">
          <div class="panel-title"><h2>Results</h2></div>
          <div class="status">Pick a quiz on the left to see its results.</div>
        </div>
      `;
      return;
    }
    if (!this._built) {
      this.buildShell();
    }
    this.updateHeader();
    this.updateHero();
    this.updateAffinity();
    this.updateSummary();
    this.updateMeta();
    this.updateRerun();
    this.updateAssets();
    this.updateLog();
    this.updateRerunButton();
  }

  buildShell() {
    this.innerHTML = `
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">
            <h2 data-region="title">Results</h2>
            <div class="panel-subtitle" data-region="subtitle"></div>
          </div>
        </div>
        <div data-region="hero"></div>
        <div data-region="rerun"></div>
        <div data-region="affinity"></div>
        <div data-region="summary"></div>
        <div class="status-grid" data-region="meta"></div>
        <details class="downloads" data-region="downloads">
          <summary>Report, charts & data</summary>
          <div class="asset-list" data-region="assets"></div>
          <div class="actions">
            <button class="secondary" data-rerun-report>Re-run analysis</button>
          </div>
        </details>
        <details class="run-log" data-region="logwrap">
          <summary>Run log</summary>
          <pre class="run-log-body" data-region="log"></pre>
        </details>
      </div>
    `;
    this.addEventListener("click", (event) => this.handleClick(event));
    this._built = true;
    this._sigMeta = null;
    this._sigAssets = null;
    this._sigHero = null;
    this._sigAffinity = null;
    this._sigSummary = null;
    this._sigRerun = null;
    const status = state.selectedRunData?.status || "";
    const isActive = status && !TERMINAL_STATUSES.includes(status);
    const logwrap = this.querySelector('[data-region="logwrap"]');
    if (logwrap && isActive) logwrap.open = true;
  }

  handleClick(event) {
    if (event.target.closest("[data-rerun-report]")) {
      this.doRerun();
      return;
    }
    if (event.target.closest("[data-share]")) {
      this.shareRun();
      return;
    }
    const toggleReasoning = event.target.closest("[data-toggle-reasoning]");
    if (toggleReasoning) {
      const details = [...this.querySelectorAll(".qa-why")];
      const anyClosed = details.some((d) => !d.open);
      details.forEach((d) => {
        d.open = anyClosed;
      });
      toggleReasoning.textContent = anyClosed ? "Hide all explanations" : "Show all explanations";
      return;
    }
    if (event.target.closest("[data-rerun-open]")) {
      this.querySelector("[data-rerun-modal]")?.classList.add("open");
      return;
    }
    if (event.target.closest("[data-rerun-close]")) {
      this.querySelector("[data-rerun-modal]")?.classList.remove("open");
      return;
    }
    const rerunGroup = event.target.closest("[data-rerun-group]");
    if (rerunGroup) {
      const group = (this._rerunGroups || []).find((g) => g.id === rerunGroup.dataset.rerunGroup);
      this.querySelector("[data-rerun-modal]")?.classList.remove("open");
      if (group) this.launchRerun(group.modelIds, rerunGroup);
      return;
    }
    if (event.target.closest("[data-rerun-custom]")) {
      // Load this run's quiz into the wizard, then jump to model selection.
      if (state.selectedRunQuiz) {
        state.quiz = state.selectedRunQuiz;
        state.quizJson = null;
        state.quizMeta = state.selectedRunQuizMeta;
        document.dispatchEvent(new CustomEvent("quiz:updated"));
      }
      setCurrentStep(3);
      return;
    }
    const md = event.target.closest("[data-markdown-url]");
    if (md) {
      document.dispatchEvent(
        new CustomEvent("markdown:open", {
          detail: {
            url: md.dataset.markdownUrl,
            title: md.dataset.markdownTitle,
            filename: md.dataset.markdownFilename,
          },
        })
      );
      return;
    }
    const chart = event.target.closest("[data-chart-url]");
    if (chart) {
      document.dispatchEvent(
        new CustomEvent("chart:open", {
          detail: {
            url: chart.dataset.chartUrl,
            title: chart.dataset.chartTitle,
            filename: chart.dataset.chartFilename,
          },
        })
      );
    }
  }

  updateHeader() {
    const runData = state.selectedRunData;
    const title = this.querySelector('[data-region="title"]');
    const subtitle = this.querySelector('[data-region="subtitle"]');
    if (title) title.textContent = runDisplayTitle(runData);
    if (subtitle) {
      const status = runData?.status || "unknown";
      subtitle.textContent =
        status === "completed"
          ? "Here's the personality each model landed on."
          : status === "failed"
            ? "Something went wrong with this run."
            : "Running your quiz…";
    }
  }

  updateHero() {
    const region = this.querySelector('[data-region="hero"]');
    if (!region) return;
    const runData = state.selectedRunData;
    const status = runData?.status || "unknown";
    const isActive = status && !TERMINAL_STATUSES.includes(status);
    const outcomes = state.runOutcomes || [];
    const quiz = state.selectedRunQuiz;
    const sig = JSON.stringify({ status, outcomes, quizId: quiz?.id || null });
    if (sig === this._sigHero) return;
    this._sigHero = sig;

    if (isActive) {
      region.innerHTML = `
        <div class="result-hero pending">
          <span class="spinner-lg" aria-hidden="true"></span>
          <div>
            <div class="kicker">Working on it</div>
            <h3>Asking the models…</h3>
            <div class="status">Your results will appear here in a moment.</div>
          </div>
        </div>
      `;
      return;
    }
    if (status !== "completed" || !outcomes.length) {
      region.innerHTML = "";
      return;
    }
    const single = outcomes.length === 1;
    const description = single ? findOutcomeDescription(quiz, outcomes[0].outcome) : "";
    let body;
    if (single) {
      body = `
        <div class="result-single">
          <span class="result-model">${escapeHtml(prettifyModelId(outcomes[0].model_id))} is…</span>
          <div class="result-outcome-big">${escapeHtml(outcomeAsIdentity(outcomes[0].outcome))}</div>
          ${description ? `<div class="result-desc">${escapeHtml(description)}</div>` : ""}
        </div>
      `;
    } else {
      const groups = groupOutcomes(outcomes);
      if (groups.length === 1) {
        body = `
          <div class="result-single">
            <span class="result-model">All ${outcomes.length} models landed on the same personality</span>
            <div class="result-outcome-big">${escapeHtml(outcomeAsIdentity(groups[0].outcome))}</div>
          </div>
        `;
      } else {
        body = `
          <ul class="result-groups">
            ${groups
              .map(
                (g) => `
                <li class="result-group">
                  <div class="result-group-outcome">${escapeHtml(outcomeAsIdentity(g.outcome))}</div>
                  <div class="result-group-models">
                    ${g.models
                      .map((m) => `<span class="model-chip">${escapeHtml(prettifyModelId(m))}</span>`)
                      .join("")}
                  </div>
                </li>
              `
              )
              .join("")}
          </ul>
        `;
      }
    }
    region.innerHTML = `
      <div class="result-hero">
        <div class="result-hero-top">
          <div>
            <div class="kicker">Result</div>
            <h3 class="result-quiz-title">${escapeHtml(runDisplayTitle(runData))}</h3>
          </div>
          <button class="share-btn" data-share>Share result</button>
        </div>
        ${body}
      </div>
    `;
  }

  updateAffinity() {
    const region = this.querySelector('[data-region="affinity"]');
    if (!region) return;
    const status = state.selectedRunData?.status || "unknown";
    // The appropriate visual is classified at parse time and carried on quiz_meta,
    // so this works for any questionnaire (radar / bars / none).
    const heroVisual = state.selectedRunQuizMeta?.hero_visual || "none";
    const affinity = buildAffinity(
      state.selectedRunQuiz,
      state.selectedRunQuizMeta,
      state.runResults || []
    );
    const usableModels = (affinity?.perModel || []).filter((m) => m.segments.length);
    const sig = JSON.stringify({
      status,
      heroVisual,
      perModel: usableModels.map((m) => [m.modelId, m.segments.map((s) => s.pct)]),
    });
    if (sig === this._sigAffinity) return;
    this._sigAffinity = sig;

    if (status !== "completed" || heroVisual === "none" || !usableModels.length) {
      region.innerHTML = "";
      return;
    }

    const multi = usableModels.length > 1;
    const axes = usableModels[0].segments.map((s) => affinityAxisLabel(s.label));
    const series = usableModels.map((m, i) => ({
      name: prettifyModelId(m.modelId),
      color: RADAR_COLORS[i % RADAR_COLORS.length],
      values: m.segments.map((s) => s.pct),
    }));

    const useRadar = heroVisual === "radar" && axes.length >= 3;
    let chart;
    let legend = "";
    if (useRadar) {
      chart = `<div class="radar-wrap">${radarSvg(axes, series)}</div>`;
      if (multi) legend = radarLegend(series);
    } else {
      chart = `<div class="affinity-grid ${multi ? "multi" : ""}">${affinityBars(usableModels, multi)}</div>`;
    }

    region.innerHTML = `
      <div class="affinity">
        <div class="result-summary-head">
          <div class="result-summary-headings">
            <h3 class="result-summary-title">${useRadar ? "Personality radar" : "Personality lean"}</h3>
            <div class="panel-subtitle">How strongly ${multi ? "each model leans" : "it leans"} toward each result.</div>
          </div>
        </div>
        ${chart}
        ${legend}
      </div>
    `;
  }

  updateSummary() {
    const region = this.querySelector('[data-region="summary"]');
    if (!region) return;
    const status = state.selectedRunData?.status || "unknown";
    const quiz = state.selectedRunQuiz;
    const results = state.runResults || [];
    const summary = buildAnswerSummary(quiz, results);
    const models = [...new Set(results.map((r) => r.model_id))];
    const multi = models.length > 1;
    const sig = JSON.stringify({
      status,
      multi,
      picks: summary.map((q) => q.options.map((o) => [o.id, o.pickedBy.map((p) => p.modelId)])),
      refusals: summary.map((q) => q.refusedBy.map((r) => r.modelId)),
    });
    if (sig === this._sigSummary) return;
    this._sigSummary = sig;

    const hasAnswers = summary.some(
      (q) => q.options.some((o) => o.pickedBy.length) || q.refusedBy.length || q.unmatched.length
    );
    if (status !== "completed" || !hasAnswers) {
      region.innerHTML = "";
      return;
    }

    const scoring = getScoringSummary(quiz, state.selectedRunQuizMeta);
    const hasReasons = summary.some(
      (q) =>
        q.options.some((o) => o.pickedBy.some((p) => p.reason)) ||
        q.refusedBy.some((r) => r.reason)
    );

    const items = summary
      .map((q) => {
        const opts = q.options
          .map((o) => {
            const chosen = o.pickedBy.length > 0;
            const pickers = chosen
              ? `<div class="qa-pickers">${o.pickedBy.map((p) => pickerHtml(p, multi)).join("")}</div>`
              : "";
            return `
              <li class="qa-option ${chosen ? "chosen" : ""}">
                <div class="qa-option-row">
                  <span class="qa-letter">${escapeHtml(o.id)}</span>
                  <span class="qa-option-text">${escapeHtml(o.text)}</span>
                </div>
                ${pickers}
              </li>
            `;
          })
          .join("");
        const declines = q.refusedBy.length
          ? `<div class="qa-declines">${q.refusedBy.map((r) => declineHtml(r, multi)).join("")}</div>`
          : "";
        const unmatched = q.unmatched.length
          ? `<div class="qa-note">Other answers: ${q.unmatched
              .map((u) => `${escapeHtml(prettifyModelId(u.modelId))} (${escapeHtml(u.choice)})`)
              .join(", ")}</div>`
          : "";
        return `
          <div class="qa-item">
            <div class="qa-q">${q.index}. ${escapeHtml(q.questionText)}</div>
            <ul class="qa-options">${opts}</ul>
            ${declines}
            ${unmatched}
          </div>
        `;
      })
      .join("");

    region.innerHTML = `
      <div class="result-summary">
        <div class="result-summary-head">
          <div class="result-summary-headings">
            <h3 class="result-summary-title">${multi ? "How each model answered" : "How it answered"}</h3>
            <div class="panel-subtitle">The full quiz${multi ? " — and which model picked what." : ", with its answer highlighted."}</div>
          </div>
          ${hasReasons ? `<button class="link-toggle" data-toggle-reasoning>Show all explanations</button>` : ""}
        </div>
        ${scoring ? `<div class="qa-scoring"><span class="qa-scoring-label">How results are scored:</span> ${escapeHtml(scoring)}</div>` : ""}
        <div class="qa-list">${items}</div>
      </div>
    `;
  }

  updateMeta() {
    const region = this.querySelector('[data-region="meta"]');
    if (!region) return;
    const runData = state.selectedRunData;
    const status = runData?.status || "unknown";
    const modelCount = runData?.models?.length || 0;
    const modelList = modelCount
      ? runData.models.map((model) => escapeHtml(prettifyModelId(model))).join(", ")
      : "No models recorded.";
    const costSummary = state.runResultsSummary?.cost;
    const costValue = costSummary?.total;
    const missingPricing = costSummary?.missing_pricing || [];
    const hasCost = Number.isFinite(costValue);
    const costLabel = hasCost ? `$${costValue.toFixed(4)}` : "Unavailable";
    const missingLabel =
      missingPricing.length > 0
        ? ` (missing pricing for ${missingPricing.length} model${missingPricing.length === 1 ? "" : "s"})`
        : "";
    const isActive = status && !TERMINAL_STATUSES.includes(status);
    const createdMs = runData?.created_at ? new Date(runData.created_at).getTime() : NaN;
    const updatedMs = runData?.updated_at ? new Date(runData.updated_at).getTime() : NaN;
    let durationLine = "";
    let durSig = "";
    if (Number.isFinite(createdMs)) {
      if (isActive) {
        const elapsed = Date.now() - createdMs;
        durationLine = `Running for ${formatDuration(elapsed)}`;
        durSig = String(Math.floor(elapsed / 3000));
      } else if (Number.isFinite(updatedMs) && updatedMs >= createdMs) {
        durationLine = `Ran in ${formatDuration(updatedMs - createdMs)}`;
        durSig = "done";
      }
    }
    const sig = JSON.stringify({ status, modelList, costLabel, missingLabel, durSig, err: state.runError || "" });
    if (sig === this._sigMeta) return;
    this._sigMeta = sig;
    region.innerHTML = `
      <div class="status status-wrap">Models (${modelCount}): ${modelList}</div>
      ${costSummary ? `<div class="status">Est. cost: ${costLabel}${missingLabel}</div>` : ""}
      ${durationLine ? `<div class="status">${durationLine}</div>` : ""}
      ${state.runError ? `<div class="status">${escapeHtml(state.runError)}</div>` : ""}
      <div class="status">
        Status: <span class="status-pill status-${status}">${status}</span>
      </div>
    `;
  }

  updateAssets() {
    const region = this.querySelector('[data-region="assets"]');
    if (!region) return;
    const runData = state.selectedRunData;
    const status = runData?.status || "unknown";
    const isActive = status && !TERMINAL_STATUSES.includes(status);
    const assetGroups = buildAssetGroupsForRun(runData);
    const sig = JSON.stringify({
      isActive,
      groups: assetGroups.map((g) => [g.id, g.readyCount, g.primaryAsset?.url || ""]),
    });
    if (sig === this._sigAssets) return;
    this._sigAssets = sig;
    const rows = assetGroups.map((group) => assetRowHtml(group, isActive)).join("");
    region.innerHTML = rows || "<div class='status'>No downloads yet.</div>";
  }

  updateLog() {
    const pre = this.querySelector('[data-region="log"]');
    if (!pre) return;
    const raw = state.runLogExists
      ? state.runLog || "Log is still streaming…"
      : "The run log will appear here once the quiz starts.";
    const body = localizeLogTimestamps(raw);
    if (pre.textContent === body) return;
    const atBottom = Math.abs(pre.scrollHeight - pre.clientHeight - pre.scrollTop) < 40;
    pre.textContent = body;
    if (atBottom) pre.scrollTop = pre.scrollHeight;
  }

  updateRerunButton() {
    const btn = this.querySelector("[data-rerun-report]");
    if (!btn) return;
    const status = state.selectedRunData?.status || "unknown";
    const isActive = status && !TERMINAL_STATUSES.includes(status);
    const hasResults = (state.runResults || []).length > 0;
    const canRerun = !isActive && hasResults;
    btn.disabled = state.reanalysisInProgress || !canRerun;
    btn.textContent = state.reanalysisInProgress ? "Re-running analysis…" : "Re-run analysis";
  }

  async ensureModels() {
    if (state.models && state.models.length) return;
    try {
      const data = await fetchJSON("/api/models");
      state.models = data.models || [];
      state.groups = data.groups || {};
    } catch (err) {
      /* groups just won't show */
    }
  }

  updateRerun() {
    const region = this.querySelector('[data-region="rerun"]');
    if (!region) return;
    const status = state.selectedRunData?.status;
    const terminal = status === "completed" || status === "failed";
    const quizId = state.selectedRunData?.quiz_id;
    if (!quizId || !terminal) {
      region.innerHTML = "";
      this._sigRerun = null;
      return;
    }
    const sig = `${state.selectedRun}|${state.models?.length || 0}`;
    if (sig === this._sigRerun) return;
    this._sigRerun = sig;
    if (!state.models || !state.models.length) {
      region.innerHTML = `
        <div class="rerun">
          <div class="rerun-head"><strong>Run again with a different set of models</strong></div>
          <div class="status">Loading model sets…</div>
        </div>`;
      this.ensureModels().then(() => {
        this._sigRerun = null;
        this.updateRerun();
      });
      return;
    }
    this.renderRerun(region);
  }

  renderRerun(region) {
    const groups = buildModelGroups(state.models);
    this._rerunGroups = groups;
    const groupRows = groups.length
      ? groups
          .map(
            (g) => `
            <div class="rerun-group">
              <div class="rerun-group-head">
                <div class="rerun-group-info">
                  <div class="rerun-group-label">${escapeHtml(g.label)}</div>
                  <div class="rerun-group-desc">${escapeHtml(g.description)}</div>
                </div>
                <button data-rerun-group="${g.id}">Run these ${g.modelIds.length}</button>
              </div>
              <div class="rerun-group-models">${g.modelIds
                .map((id) => `<span class="rerun-model-pill">${escapeHtml(prettifyModelId(id))}</span>`)
                .join("")}</div>
            </div>`
          )
          .join("")
      : `<div class="status">No ready-made model sets available.</div>`;
    region.innerHTML = `
      <div class="rerun">
        <div class="rerun-cta-row">
          <button data-rerun-open>↻ Run again with different models</button>
          <button class="link-toggle" data-rerun-custom>choose specific models…</button>
        </div>
        <div class="status" data-rerun-status></div>
      </div>
      <div class="rerun-modal" data-rerun-modal>
        <div class="rerun-modal-backdrop" data-rerun-close></div>
        <div class="rerun-modal-panel" role="dialog" aria-modal="true" aria-label="Run again with a different set of models">
          <div class="rerun-modal-head">
            <h3>Run again with a different set</h3>
            <button class="secondary" data-rerun-close>Close</button>
          </div>
          <div class="rerun-modal-body">
            ${groupRows}
            <button class="link-toggle" data-rerun-custom>choose specific models…</button>
          </div>
        </div>
      </div>
    `;
  }

  async launchRerun(modelIds, sourceEl) {
    const quizId = state.selectedRunData?.quiz_id;
    if (!quizId || !modelIds || !modelIds.length) return;
    const statusEl = this.querySelector("[data-rerun-status]");
    if (statusEl) statusEl.textContent = "Starting a new run…";
    if (sourceEl) sourceEl.disabled = true;
    try {
      const data = await fetchJSON("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quiz_id: quizId, models: modelIds, generate_report: true }),
      });
      await refreshRuns();
      await selectRun(data.run_id);
    } catch (err) {
      if (statusEl) statusEl.textContent = `Couldn't start run: ${err.message}`;
      if (sourceEl) sourceEl.disabled = false;
    }
  }

  async doRerun() {
    const btn = this.querySelector("[data-rerun-report]");
    if (btn?.disabled) return;
    state.reanalysisInProgress = true;
    state.runError = null;
    this.updateRerunButton();
    try {
      await rerunReport(state.selectedRun);
      await refreshRuns();
      await selectRun(state.selectedRun);
    } catch (err) {
      state.runError = `Failed to re-run analysis: ${err.message}`;
    } finally {
      state.reanalysisInProgress = false;
      this.update();
    }
  }

  async shareRun() {
    const runData = state.selectedRunData;
    const outcomes = state.runOutcomes || [];
    const title = runDisplayTitle(runData);
    const url = `${window.location.origin}/run/${state.selectedRun}`;
    const lines = [title];
    outcomes.forEach((o) => lines.push(`${prettifyModelId(o.model_id)} is ${outcomeAsIdentity(o.outcome)}`));
    const text = lines.join("\n");
    try {
      if (navigator.share) {
        await navigator.share({ title, text, url });
        return;
      }
    } catch (err) {
      if (err && err.name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(`${text}\n\nTry it: ${url}`);
      this.flashShare("Copied link!");
    } catch (err) {
      this.flashShare("Copy failed");
    }
  }

  flashShare(message) {
    const btn = this.querySelector("[data-share]");
    if (!btn) return;
    const original = btn.textContent;
    btn.textContent = message;
    btn.classList.add("shared");
    setTimeout(() => {
      btn.textContent = original;
      btn.classList.remove("shared");
    }, 2000);
  }
}

class RunResults extends HTMLElement {
  connectedCallback() {
    this.pollId = null;
    document.addEventListener("run:selected", () => this.startPolling());
    this.render();
    if (state.selectedRun) this.startPolling();
  }

  disconnectedCallback() {
    this.stopPolling();
  }

  stopPolling() {
    if (this.pollId) {
      clearInterval(this.pollId);
      this.pollId = null;
    }
  }

  async startPolling() {
    this.stopPolling();
    await this.refresh();
    const status = state.selectedRunData?.status || "";
    if (state.selectedRun && !TERMINAL_STATUSES.includes(status)) {
      this.pollId = setInterval(() => this.refresh(), 4000);
    }
  }

  async refresh() {
    if (!state.selectedRun) {
      document.dispatchEvent(new CustomEvent("run:datachanged"));
      return;
    }
    try {
      await loadRunDetails(state.selectedRun, true);
      // Keep the list's status pill in sync with the active run (no extra request).
      const idx = state.runs.findIndex((r) => r.run_id === state.selectedRun);
      if (idx >= 0 && state.selectedRunData && state.runs[idx].status !== state.selectedRunData.status) {
        state.runs[idx] = { ...state.runs[idx], status: state.selectedRunData.status };
        document.dispatchEvent(new CustomEvent("runs:updated"));
      }
    } catch (err) {
      state.runError = `Failed to refresh run: ${err.message}`;
    }
    document.dispatchEvent(new CustomEvent("run:datachanged"));
    const status = state.selectedRunData?.status || "";
    if (status && TERMINAL_STATUSES.includes(status)) {
      this.stopPolling();
    }
  }

  render() {
    if (!this.querySelector("run-panel")) {
      this.innerHTML = `<run-panel></run-panel>`;
    }
  }
}

class RunDashboard extends HTMLElement {
  connectedCallback() {
    this.render();
  }

  render() {
    this.innerHTML = `
      <div class="dashboard-grid">
        <div class="dashboard-column">
          <run-list></run-list>
        </div>
        <div class="dashboard-column">
          <run-results></run-results>
        </div>
      </div>
    `;
  }
}

if (!customElements.get("run-list")) {
  customElements.define("run-list", RunList);
}
if (!customElements.get("run-panel")) {
  customElements.define("run-panel", RunPanel);
}
if (!customElements.get("run-results")) {
  customElements.define("run-results", RunResults);
}
if (!customElements.get("run-dashboard")) {
  customElements.define("run-dashboard", RunDashboard);
}
