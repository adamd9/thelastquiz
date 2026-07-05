import { fetchJSON, loadQuiz, refreshQuizzes } from "../api.js";
import { state, setCurrentStep } from "../state.js";
import { getQuizTypeLabel, getScoringSummary } from "../utils.js";

class QuizUploader extends HTMLElement {
  connectedCallback() {
    this.parsing = false;
    this.render();
  }

  async parseQuiz() {
    const textarea = this.querySelector("textarea");
    const fileInput = this.querySelector("input[type=file]");
    const text = textarea ? textarea.value.trim() : "";

    if (!text && (!fileInput || fileInput.files.length === 0)) {
      this.setStatus("Paste some quiz text or choose a photo first.", "warn");
      return;
    }

    this.parsing = true;
    this.setBusy(true);

    try {
      const body = new FormData();
      if (fileInput.files.length > 0) {
        body.append("file", fileInput.files[0]);
      } else {
        body.append("text", text);
      }
      const data = await fetchJSON("/api/quizzes/parse", { method: "POST", body });
      const newQuizId = data.quiz?.id;
      state.quiz = data.quiz;
      state.quizJson = data.quiz_json;
      state.quizRawPayload = data.raw_payload || null;
      state.quizRawPreview = data.raw_preview || null;
      state.quizMeta = data.quiz_meta || null;
      this.parsing = false;
      await refreshQuizzes();
      if (newQuizId) {
        try {
          await loadQuiz(newQuizId);
        } catch (err) {
          // Keep the parsed quiz in state even if the refresh lookup fails.
        }
      }
      document.dispatchEvent(new CustomEvent("quiz:updated"));
      this.render();
    } catch (err) {
      this.parsing = false;
      this.setBusy(false);
      this.setStatus(this.friendlyError(err.message), "warn");
    }
  }

  friendlyError(message) {
    if (!message) return "We couldn't read that quiz. Try pasting the text instead.";
    if (message.toLowerCase().includes("invalid quiz")) {
      return "Hmm, that didn't look like a quiz we could read. Try a clearer photo or paste the text.";
    }
    return `Something went wrong: ${message}`;
  }

  setStatus(message, tone = "") {
    const status = this.querySelector("[data-status]");
    if (status) {
      status.textContent = message;
      status.dataset.tone = tone;
    }
  }

  setBusy(isBusy) {
    const button = this.querySelector("[data-parse]");
    if (button) {
      button.disabled = isBusy;
      button.innerHTML = isBusy
        ? `<span class="spinner-sm" aria-hidden="true"></span> Reading your quiz…`
        : "Add quiz";
    }
    if (isBusy) this.setStatus("Reading your quiz — this takes a few seconds.", "info");
  }

  render() {
    const parsedOk = Boolean(state.quiz) && !this.parsing;
    const successCard = parsedOk
      ? `
        <div class="parse-success">
          <div class="parse-success-head">
            <span class="parse-check" aria-hidden="true">✓</span>
            <div>
              <strong>${state.quiz.title || "Your quiz"}</strong>
              <div class="status">Saved to your library.</div>
            </div>
          </div>
          <div class="status-grid">
            <div class="status">Quiz type: ${getQuizTypeLabel(state.quiz, state.quizMeta)}</div>
            <div class="status">Possible results: ${getScoringSummary(state.quiz, state.quizMeta)}</div>
          </div>
          <div class="actions">
            <button data-pick-models>Pick models →</button>
            <button class="secondary" data-add-another>Add another</button>
          </div>
        </div>
      `
      : "";

    this.innerHTML = `
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">
            <h2>Add a quiz</h2>
            <div class="panel-subtitle">Paste a quiz or snap a photo — we'll turn it into a playable quiz.</div>
          </div>
          <span class="badge">Step 1</span>
        </div>
        <div>
          <label>Paste the quiz text</label>
          <textarea placeholder="e.g. Which houseplant are you? 1) On a Saturday you… A) …"></textarea>
        </div>
        <div class="or-divider"><span>or</span></div>
        <div>
          <label>Upload a photo or screenshot</label>
          <input type="file" accept="image/*" capture="environment" />
        </div>
        <div class="actions">
          <button data-parse>Add quiz</button>
        </div>
        <div class="status" data-status>Paste a quiz or choose a photo to begin.</div>
        <button class="link-toggle" data-reuse>or reuse a past quiz</button>
        ${successCard}
      </div>
    `;

    this.querySelector("[data-parse]")?.addEventListener("click", () => this.parseQuiz());
    this.querySelector("[data-reuse]")?.addEventListener("click", () => setCurrentStep(2));
    this.querySelector("[data-pick-models]")?.addEventListener("click", () => setCurrentStep(3));
    this.querySelector("[data-add-another]")?.addEventListener("click", () => {
      state.quiz = null;
      state.quizJson = null;
      state.quizMeta = null;
      this.parsing = false;
      this.render();
    });
  }
}

if (!customElements.get("quiz-uploader")) {
  customElements.define("quiz-uploader", QuizUploader);
}
