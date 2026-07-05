export const state = {
  quiz: null,
  quizJson: null,
  quizRawPayload: null,
  quizRawPreview: null,
  quizMeta: null,
  quizzes: [],
  previewQuiz: null,
  previewQuizJson: null,
  previewRawPayload: null,
  previewRawPreview: null,
  previewQuizMeta: null,
  models: [],
  groups: {},
  selectedModels: new Set(),
  selectedGroup: "",
  runs: [],
  selectedRun: null,
  selectedRunData: null,
  selectedRunQuizMeta: null,
  selectedRunQuiz: null,
  selectedRunQuizId: null,
  runResults: [],
  runResultsSummary: null,
  runOutcomes: [],
  assets: [],
  runLog: "",
  runLogExists: false,
  runError: null,
  reanalysisInProgress: false,
  currentStep: 0,
};

const MODEL_SELECTION_KEY = "llm_pop_quiz_model_selection";

export function loadModelSelection() {
  try {
    const raw = localStorage.getItem(MODEL_SELECTION_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.models)) {
      state.selectedModels = new Set(parsed.models);
    }
    if (typeof parsed.group === "string") {
      state.selectedGroup = parsed.group;
    }
  } catch (err) {
    return;
  }
}

function saveModelSelection() {
  const payload = {
    models: [...state.selectedModels],
    group: state.selectedGroup || "",
  };
  try {
    localStorage.setItem(MODEL_SELECTION_KEY, JSON.stringify(payload));
  } catch (err) {
    return;
  }
}

export function notifyModelSelectionChanged() {
  saveModelSelection();
  document.dispatchEvent(new CustomEvent("models:updated"));
}

export function setCurrentStep(step) {
  state.currentStep = step;
  updateStepVisibility();
  document.dispatchEvent(new CustomEvent("step:changed"));
}

export function updateStepVisibility() {
  document.querySelectorAll(".step-panel").forEach((panel) => {
    const panelStep = Number(panel.dataset.step);
    panel.classList.toggle("active", panelStep === state.currentStep);
  });
  const stepper = document.querySelector("stepper-nav");
  if (stepper) {
    // Hide the wizard stepper on the dashboard (0) and the off-flow library (2).
    stepper.style.display = state.currentStep === 0 || state.currentStep === 2 ? "none" : "";
  }
}
