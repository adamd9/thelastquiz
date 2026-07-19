import { fetchJSON, refreshRuns, selectRun } from "../api.js";
import { state, setCurrentStep } from "../state.js";
import { getEffectiveModelInfo, getQuizTypeLabel } from "../utils.js";
import { needsSignIn, showAuthGate } from "../auth-gate.js";

class RunCreator extends HTMLElement {
  connectedCallback() {
    this.render();
    document.addEventListener("quiz:updated", () => this.render());
    document.addEventListener("models:updated", () => this.render());
    document.addEventListener("runs:updated", () => this.render());
  }

  async createRun() {
    const status = this.querySelector(".status");
    const quizId = String(state.quiz?.id ?? "");
    if (!quizId) {
      status.textContent = "Add or choose a quiz first.";
      return;
    }
    const group = state.selectedGroup || null;
    const checked = [...state.selectedModels];
    if (!checked.length && !group) {
      status.textContent = "Pick at least one model first.";
      return;
    }

    // Parsing/building a quiz is free; running it requires a (free) account.
    if (needsSignIn()) {
      const signedIn = await showAuthGate();
      if (!signedIn) {
        status.textContent =
          "No problem \u2014 your quiz is saved. Sign in whenever you're ready to run.";
        return;
      }
    }

    const payload = {
      quiz_id: quizId,
      models: checked.length ? checked : null,
      group: group || null,
      generate_report: true,
    };
    const runButton = this.querySelector("#runBtn");
    if (runButton) {
      runButton.disabled = true;
      runButton.innerHTML = `<span class="spinner-sm" aria-hidden="true"></span> Starting…`;
    }
    status.textContent = "Starting your quiz run…";
    try {
      const data = await fetchJSON("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      status.textContent = "Off we go! Opening your results…";
      if (window.tlqTrack) {
        window.tlqTrack("run_started", {
          models: (payload.models || []).length,
          group: payload.group || null,
        });
      }
      await refreshRuns();
      await selectRun(data.run_id);
      setCurrentStep(0);
    } catch (err) {
      if (runButton) {
        runButton.disabled = false;
        runButton.textContent = "Run quiz";
      }
      // Safety net: if the server says sign-in is required (e.g. the session
      // lapsed after the client-side check), re-open the gate and retry.
      if (/sign ?in|unauthor/i.test(err.message || "")) {
        const signedIn = await showAuthGate();
        if (signedIn) return this.createRun();
        status.textContent = "Sign in to run your quiz.";
        return;
      }
      status.textContent = this.friendlyError(err.message);
    }
  }

  friendlyError(message) {
    if (!message) return "Something went wrong starting the run.";
    if (message.includes("Daily") || message.includes("limit") || message.includes("not available")) {
      return message;
    }
    return `Couldn't start the run: ${message}`;
  }

  render() {
    const compact = this.hasAttribute("data-compact");
    const quizTitle = state.quiz?.title || "your quiz";
    const modelInfo = getEffectiveModelInfo();
    const modelCount = state.selectedModels.size || modelInfo.count || 0;
    const ready = Boolean(state.quiz) && modelCount > 0;

    this.innerHTML = `
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">
            <h2>Ready to run</h2>
            <div class="panel-subtitle">We'll ask each model to take your quiz and show you what they get.</div>
          </div>
          ${compact ? "" : '<span class="badge">Step 4</span>'}
        </div>
        <div class="run-summary">
          <div class="run-summary-item">
            <div class="label">Quiz</div>
            <div>${state.quiz ? `${escapeText(quizTitle)}` : "No quiz chosen yet"}</div>
          </div>
          <div class="run-summary-item">
            <div class="label">Style</div>
            <div>${state.quiz ? getQuizTypeLabel(state.quiz, state.quizMeta) : "—"}</div>
          </div>
          <div class="run-summary-item">
            <div class="label">Models</div>
            <div>${modelCount ? `${modelCount} selected` : "None picked yet"}</div>
          </div>
        </div>
        <div class="you-will-get">
          <div class="label">You'll get</div>
          <ul>
            <li>A shareable result for each model</li>
            <li>A full report with charts</li>
            <li>An estimated cost for the run</li>
          </ul>
        </div>
        <div class="actions">
          <button id="runBtn" ${ready ? "" : "disabled"}>Run quiz</button>
          ${compact ? '<button class="secondary" data-setup>Change setup</button>' : '<button class="secondary" data-back>Back</button>'}
        </div>
        <div class="status">${ready ? "" : "Add a quiz and pick at least one model to continue."}</div>
      </div>
    `;
    this.querySelector("#runBtn")?.addEventListener("click", () => this.createRun());
    this.querySelector("button[data-back]")?.addEventListener("click", () => {
      setCurrentStep(3);
    });
    this.querySelector("button[data-setup]")?.addEventListener("click", () => {
      setCurrentStep(1);
    });
  }
}

function escapeText(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

if (!customElements.get("run-creator")) {
  customElements.define("run-creator", RunCreator);
}
