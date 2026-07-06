import { fetchJSON } from "../api.js";
import { state, loadModelSelection, notifyModelSelectionChanged, setCurrentStep } from "../state.js";
import { buildModelGroups, escapeHtml, getQuizTypeLabel } from "../utils.js";
import { providerLogoHtml } from "../model-logo.js";

// Normal users can compare up to this many models per run (keeps runs fast and
// affordable). The admin benchmark console has no such cap.
const MAX_MODELS = 5;

class ModelPicker extends HTMLElement {
  constructor() {
    super();
    this.filterText = "";
    this.showAvailableOnly = false;
    this.showAll = false;
  }

  connectedCallback() {
    loadModelSelection();
    this.load();
    // Re-render when the selected quiz changes so the quiz-context banner stays accurate.
    document.addEventListener("quiz:updated", () => {
      if (this.isConnected) this.render();
    });
  }

  async load() {
    const data = await fetchJSON("/api/models");
    state.models = data.models;
    state.groups = data.groups;
    const knownIds = new Set(state.models.map((model) => model.id));
    state.selectedModels = new Set(
      [...state.selectedModels].filter((id) => knownIds.has(id))
    );
    if (state.selectedGroup && !state.groups[state.selectedGroup]) {
      state.selectedGroup = "";
    }
    // Default first-time visitors to "The classics" set.
    if (state.selectedModels.size === 0 && !state.selectedGroup) {
      const classics = buildModelGroups(state.models).find((g) => g.id === "classics");
      if (classics) {
        state.selectedModels = new Set(classics.modelIds);
        notifyModelSelectionChanged();
      }
    }
    this.render();
  }

  render() {
    this.innerHTML = `
      <div class="model-picker-grid">
        <div class="panel">
          <div class="panel-header">
            <div class="panel-title">
              <h2>Pick your models</h2>
              <div class="panel-subtitle">Choose a ready-made set to compare — or browse every model.</div>
            </div>
            <span class="badge">Step 2</span>
          </div>
          ${
            state.quiz
              ? `<div class="quiz-context">
                   <div>
                     <div class="quiz-context-label">Your quiz</div>
                     <div class="quiz-context-title">${escapeHtml(state.quiz.title || "Untitled quiz")}</div>
                   </div>
                   <div class="quiz-context-meta">${escapeHtml(getQuizTypeLabel(state.quiz, state.quizMeta))} · ${(state.quiz.questions || []).length} questions</div>
                 </div>`
              : `<div class="quiz-context warn">No quiz selected yet — add or reuse one first.</div>`
          }
          <div class="model-groups" data-groups></div>
          <button class="link-toggle" data-toggle-all>${this.showAll ? "Hide full model list" : "Browse all models"}</button>
          <div class="advanced-models ${this.showAll ? "" : "hidden"}">
            <div class="toolbar">
              <input type="text" placeholder="Filter models..." value="${this.filterText}" />
              <label class="tag">
                <input type="checkbox" ${this.showAvailableOnly ? "checked" : ""} />
                available only
              </label>
            </div>
            <div class="actions">
              <button class="secondary" data-action="select-visible">Select visible</button>
              <button class="secondary" data-action="clear">Clear selection</button>
            </div>
            <div class="list scroll list-grid" data-model-list></div>
            <div class="hint">Tip: filter to a short list, then “Select visible”.</div>
          </div>
          <div class="actions">
            <button data-next ${state.selectedModels.size ? "" : "disabled"}>Next →</button>
          </div>
        </div>
        <div class="panel selection-panel">
          <div class="panel-header">
            <div class="panel-title">
              <h2>Your picks</h2>
              <div class="panel-subtitle">These models will take your quiz.</div>
            </div>
            <span class="badge">${state.selectedModels.size}</span>
          </div>
          <div class="selection-count"></div>
          <ul class="selection-list"></ul>
        </div>
      </div>
    `;
    this.renderGroups();
    this.updateModelList();
    this.updateSelectionSummary();
    this.querySelector(".advanced-models input[type=text]")?.addEventListener("input", (event) => {
      this.filterText = event.target.value.toLowerCase();
      this.updateModelList();
    });
    const availableToggle = this.querySelector(".toolbar input[type=checkbox]");
    if (availableToggle) {
      availableToggle.addEventListener("change", (event) => {
        this.showAvailableOnly = event.target.checked;
        this.updateModelList();
      });
    }
    this.querySelector("[data-toggle-all]")?.addEventListener("click", (event) => {
      this.showAll = !this.showAll;
      this.querySelector(".advanced-models")?.classList.toggle("hidden", !this.showAll);
      event.target.textContent = this.showAll ? "Hide full model list" : "Browse all models";
    });
    this.querySelectorAll("button[data-action]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.dataset.action === "clear") {
          state.selectedModels.clear();
        }
        if (btn.dataset.action === "select-visible") {
          for (const model of this.getFilteredModels()) {
            if (state.selectedModels.size >= MAX_MODELS) break;
            if (model.available) state.selectedModels.add(model.id);
          }
        }
        notifyModelSelectionChanged();
        this.renderGroups();
        this.updateSelectionSummary();
        this.updateModelList();
        this.syncNext();
      });
    });
    this.querySelector("button[data-next]")?.addEventListener("click", () => {
      if (state.selectedModels.size === 0) return;
      setCurrentStep(4);
    });
  }

  syncNext() {
    const next = this.querySelector("button[data-next]");
    if (next) next.disabled = state.selectedModels.size === 0;
  }

  isGroupActive(group) {
    return (
      state.selectedModels.size === group.modelIds.length &&
      group.modelIds.every((id) => state.selectedModels.has(id))
    );
  }

  renderGroups() {
    const el = this.querySelector("[data-groups]");
    if (!el) return;
    const groups = buildModelGroups(state.models);
    if (!groups.length) {
      el.innerHTML = `<div class="status">Browse all models below to choose.</div>`;
      return;
    }
    el.innerHTML = groups
      .map((g) => {
        const active = this.isGroupActive(g);
        return `
        <button class="group-card ${active ? "active" : ""}" data-group="${g.id}">
          <div class="group-card-top">
            <span class="group-card-label">${g.label}</span>
            <span class="group-card-count">${g.modelIds.length} models</span>
          </div>
          <div class="group-card-desc">${g.description}</div>
          <div class="group-card-egs">${g.examples.join(" · ")}</div>
        </button>`;
      })
      .join("");
    el.querySelectorAll("[data-group]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const group = groups.find((x) => x.id === btn.dataset.group);
        if (!group) return;
        if (this.isGroupActive(group)) {
          state.selectedModels.clear();
        } else {
          state.selectedModels = new Set(group.modelIds.slice(0, MAX_MODELS));
        }
        notifyModelSelectionChanged();
        this.renderGroups();
        this.updateSelectionSummary();
        this.updateModelList();
        this.syncNext();
      });
    });
  }

  getFilteredModels() {
    return state.models.filter((model) => {
      if (this.showAvailableOnly && !model.available) return false;
      if (!this.filterText) return true;
      const haystack = `${model.name || ""} ${model.id} ${model.description || ""}`.toLowerCase();
      return haystack.includes(this.filterText);
    });
  }

  updateModelList() {
    const list = this.querySelector("[data-model-list]");
    if (!list) return;
    const filteredModels = this.getFilteredModels();
    const atLimit = state.selectedModels.size >= MAX_MODELS;
    list.innerHTML = filteredModels
      .map((model) => {
        const completionPrice = Number(model.pricing?.completion);
        const priceLabel = Number.isFinite(completionPrice)
          ? `$${(completionPrice * 1_000_000).toFixed(2)} / 1M`
          : "n/a";
        const selected = state.selectedModels.has(model.id);
        const disabled = !model.available || (atLimit && !selected);
        return `
        <label class="list-item model-card">
          <input
            type="checkbox"
            value="${model.id}"
            ${disabled ? "disabled" : ""}
            ${selected ? "checked" : ""}
          />
          <div class="model-meta">
            <strong class="model-title">${providerLogoHtml(model.id, 16)}${model.name || model.id}</strong>
            <div class="model-id">${model.id}</div>
            <div class="model-desc">${model.description || "No description"}</div>
            <span class="tag">${priceLabel}</span>
          </div>
        </label>
      `;
      })
      .join("");
    this.querySelectorAll("[data-model-list] input[type=checkbox][value]").forEach((input) => {
      input.addEventListener("change", () => {
        if (input.checked) {
          if (state.selectedModels.size >= MAX_MODELS) {
            input.checked = false; // hard cap for normal users
            return;
          }
          state.selectedModels.add(input.value);
        } else {
          state.selectedModels.delete(input.value);
        }
        notifyModelSelectionChanged();
        this.updateSelectionSummary();
        this.renderGroups();
        this.refreshLimitState();
        this.syncNext();
      });
    });
  }

  // Toggle the disabled state of unchecked, available models once the cap is
  // reached, without re-rendering the whole list (keeps scroll position).
  refreshLimitState() {
    const atLimit = state.selectedModels.size >= MAX_MODELS;
    const lookup = new Map(state.models.map((model) => [model.id, model]));
    this.querySelectorAll("[data-model-list] input[type=checkbox][value]").forEach((input) => {
      const model = lookup.get(input.value);
      const available = model ? model.available : false;
      input.disabled = !available || (atLimit && !state.selectedModels.has(input.value));
    });
  }

  updateSelectionSummary() {
    const selectionCount = this.querySelector(".selection-count");
    const selectionList = this.querySelector(".selection-list");
    const selectionBadge = this.querySelector(".selection-panel .badge");
    if (!selectionCount || !selectionList || !selectionBadge) return;

    const modelLookup = new Map(state.models.map((model) => [model.id, model]));
    const selectedIds = [...state.selectedModels];
    selectionBadge.textContent = String(selectedIds.length);
    selectionCount.textContent = selectedIds.length
      ? `${selectedIds.length} of ${MAX_MODELS} selected${selectedIds.length >= MAX_MODELS ? " \u2014 limit reached" : ""}`
      : "None selected";
    selectionList.innerHTML = selectedIds.length
      ? selectedIds
          .map((id) => {
            const model = modelLookup.get(id);
            const label = model?.name || id;
            const showId = model?.name && model.name !== id;
            return `
              <li class="selection-item">
                <div class="selection-name">${providerLogoHtml(id, 15)}${label}</div>
                ${showId ? `<div class="selection-id">${id}</div>` : ""}
              </li>
            `;
          })
          .join("")
      : `<li class="selection-empty">No models selected yet.</li>`;
  }
}

if (!customElements.get("model-picker")) {
  customElements.define("model-picker", ModelPicker);
}
