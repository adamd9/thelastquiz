import { fetchJSON, loadQuiz, refreshQuizzes } from "../api.js";
import { state, setCurrentStep } from "../state.js";
import { escapeHtml, formatRelativeTime, renderQuizPreview } from "../utils.js";

class QuizLibrary extends HTMLElement {
  constructor() {
    super();
    this.filterText = "";
    this.statusMessage = "";
  }

  connectedCallback() {
    this.render();
    refreshQuizzes();
    document.addEventListener("quizzes:updated", () => this.render());
    document.addEventListener("quiz:updated", () => this.render());
  }

  applyFilter(value) {
    this.filterText = value.toLowerCase();
    this.render();
  }

  setStatus(message) {
    this.statusMessage = message;
    const status = this.querySelector("[data-status]");
    if (status) {
      status.textContent = message;
    }
  }

  async selectQuiz(quizId) {
    this.setStatus("Loading quiz...");
    try {
      await loadQuiz(quizId);
      document.dispatchEvent(new CustomEvent("quiz:updated"));
      // Chosen a past quiz — jump straight into picking models.
      setCurrentStep(3);
    } catch (err) {
      this.setStatus(`Error: ${err.message}`);
    }
  }

  async previewQuiz(quizId) {
    this.setStatus("Loading preview...");
    try {
      const data = await fetchJSON(`/api/quizzes/${quizId}`);
      state.previewQuiz = data.quiz;
      state.previewQuizJson = data.quiz_json || null;
      state.previewRawPayload = data.raw_payload || null;
      state.previewRawPreview = data.raw_preview || null;
      state.previewQuizMeta = data.quiz_meta || null;
      this.setStatus(`Previewing: ${quizId}`);
      this.render();
    } catch (err) {
      this.setStatus(`Error: ${err.message}`);
    }
  }

  async reprocessQuiz(quizId) {
    this.setStatus("Reprocessing quiz...");
    try {
      const body = new FormData();
      const data = await fetchJSON(`/api/quizzes/${quizId}/reprocess`, {
        method: "POST",
        body,
      });
      state.previewQuiz = data.quiz;
      state.previewQuizJson = data.quiz_json || null;
      state.previewRawPayload = data.raw_payload || null;
      state.previewRawPreview = data.raw_preview || null;
      state.previewQuizMeta = data.quiz_meta || null;
      if (state.quiz?.id === quizId) {
        state.quiz = data.quiz;
        state.quizJson = data.quiz_json || null;
        state.quizRawPayload = data.raw_payload || null;
        state.quizRawPreview = data.raw_preview || null;
        state.quizMeta = data.quiz_meta || null;
        document.dispatchEvent(new CustomEvent("quiz:updated"));
      }
      this.setStatus(`Reprocessed: ${quizId}`);
      await refreshQuizzes();
      this.render();
    } catch (err) {
      this.setStatus(`Error: ${err.message}`);
    }
  }

  async deleteQuiz(quizId) {
    const confirmDelete = confirm(
      "Delete this quiz and any related runs? This action cannot be undone."
    );
    if (!confirmDelete) return;

    this.setStatus("Deleting quiz...");
    try {
      await fetchJSON(`/api/quizzes/${quizId}`, { method: "DELETE" });

      if (state.quiz?.id === quizId) {
        state.quiz = null;
        state.quizJson = null;
        state.quizRawPayload = null;
        state.quizRawPreview = null;
        state.quizMeta = null;
      }

      if (state.previewQuiz?.id === quizId) {
        state.previewQuiz = null;
        state.previewQuizJson = null;
        state.previewRawPayload = null;
        state.previewRawPreview = null;
        state.previewQuizMeta = null;
      }

      this.setStatus(`Deleted quiz: ${quizId}`);
      await refreshQuizzes();
      document.dispatchEvent(new CustomEvent("quiz:updated"));
      this.render();
    } catch (err) {
      this.setStatus(`Error: ${err.message}`);
    }
  }

  render() {
    const filter = this.filterText;
    const activeQuizId = String(state.quiz?.id ?? state.quiz?.quiz_id ?? "");
    const quizzes = state.quizzes.filter((quiz) => {
      if (filter) {
        const haystack = `${quiz.title || ""}`.toLowerCase();
        if (!haystack.includes(filter)) return false;
      }
      return true;
    });
    const seenTitles = new Set();
    const dedupedQuizzes = quizzes.filter((quiz) => {
      const key = (quiz.title || quiz.quiz_id).trim().toLowerCase();
      if (seenTitles.has(key)) return false;
      seenTitles.add(key);
      return true;
    });
    const items = dedupedQuizzes
      .map((quiz) => {
        const isActive = activeQuizId === quiz.quiz_id;
        const source = quiz.source?.publication || quiz.source?.source || "";
        const addedAt = formatRelativeTime(quiz.created_at);
        return `
        <div class="list-item ${isActive ? "active" : ""}">
          <div>
            <strong>${escapeHtml(quiz.title || "Untitled quiz")}</strong>
            <div class="status">${source ? escapeHtml(source) + " · " : ""}Added ${escapeHtml(addedAt)}</div>
          </div>
          <div class="actions">
            <button class="secondary" data-preview="${quiz.quiz_id}">View</button>
            <button data-quiz="${quiz.quiz_id}">
              ${isActive ? "Selected ✓" : "Use this"}
            </button>
            <button class="danger" data-delete="${quiz.quiz_id}">Delete</button>
          </div>
        </div>
      `;
      })
      .join("");
    const preview = state.previewQuiz
      ? `
        <div class="quiz-preview">
          <div class="panel-header">
            <div class="panel-title">
              <h3>${state.previewQuiz.title || state.previewQuiz.id}</h3>
              <div class="panel-subtitle">Quiz preview</div>
            </div>
            <div class="actions">
              ${state.previewRawPayload ? `<button class="secondary" data-reprocess="${state.previewQuiz.id}">Reprocess from raw</button>` : ""}
              <button class="secondary" data-clear-preview>Clear</button>
            </div>
          </div>
          ${renderQuizPreview(state.previewQuiz, {
            quizJson: state.previewQuizJson,
            rawPayload: state.previewRawPayload,
            rawPreview: state.previewRawPreview,
            quizMeta: state.previewQuizMeta,
          })}
        </div>
      `
      : "";
    const hasPreview = Boolean(state.previewQuiz);
    const statusMessage = this.statusMessage
      ? `<div class="status" data-status>${this.statusMessage}</div>`
      : "";
    this.innerHTML = `
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">
            <h2>Reuse a past quiz</h2>
            <div class="panel-subtitle">Run a quiz you've already added against a new set of models.</div>
          </div>
          <span class="badge">Step 2</span>
        </div>
        <div class="toolbar">
          <input type="text" placeholder="Search quizzes..." value="${this.filterText}" />
        </div>
        <div class="quiz-library-layout ${hasPreview ? "has-preview" : ""}">
          <div class="quiz-library-panel picker">
            <div class="list scroll">
              ${items || "<div class='status'>No saved quizzes yet.</div>"}
            </div>
          </div>
          ${
            hasPreview
              ? `<div class="quiz-library-panel viewer">${preview}</div>`
              : ""
          }
        </div>
        ${statusMessage}
        <div class="status">Using: ${escapeHtml(state.quiz?.title || "nothing yet")}</div>
        <div class="actions">
          <button data-next>Pick models →</button>
        </div>
      </div>
    `;
    this.querySelector("input[type=text]")?.addEventListener("input", (event) => {
      this.applyFilter(event.target.value);
    });
    this.querySelectorAll("button[data-quiz]").forEach((btn) => {
      btn.addEventListener("click", () => this.selectQuiz(btn.dataset.quiz));
    });
    this.querySelectorAll("button[data-preview]").forEach((btn) => {
      btn.addEventListener("click", () => this.previewQuiz(btn.dataset.preview));
    });
    this.querySelectorAll("button[data-delete]").forEach((btn) => {
      btn.addEventListener("click", () => this.deleteQuiz(btn.dataset.delete));
    });
    this.querySelectorAll("button[data-reprocess]").forEach((btn) => {
      btn.addEventListener("click", () => this.reprocessQuiz(btn.dataset.reprocess));
    });
    this.querySelector("button[data-clear-preview]")?.addEventListener("click", () => {
      state.previewQuiz = null;
      state.previewQuizJson = null;
      state.previewRawPayload = null;
      state.previewRawPreview = null;
      state.previewQuizMeta = null;
      this.render();
    });
    this.querySelector("button[data-next]")?.addEventListener("click", () => {
      setCurrentStep(3);
    });
  }
}

if (!customElements.get("quiz-library")) {
  customElements.define("quiz-library", QuizLibrary);
}
