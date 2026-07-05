import { state, setCurrentStep } from "../state.js";

// The main flow is three steps. (The past-quiz library is a separate, tertiary
// entry point, not part of this wizard.)
const STEPS = [
  { id: 1, label: "Add quiz" },
  { id: 3, label: "Pick models" },
  { id: 4, label: "Run" },
];

function isReachable(id) {
  if (id === 1) return true;
  if (id === 3) return Boolean(state.quiz);
  if (id === 4) return Boolean(state.quiz) && (state.selectedModels.size > 0 || state.selectedGroup);
  return true;
}

class StepperNav extends HTMLElement {
  connectedCallback() {
    this.render();
    const rerender = () => this.render();
    document.addEventListener("step:changed", rerender);
    document.addEventListener("quiz:updated", rerender);
    document.addEventListener("models:updated", rerender);
  }

  render() {
    const buttons = STEPS.map((step, index) => {
      const active = state.currentStep === step.id;
      const reachable = isReachable(step.id);
      return `
        <button
          class="${active ? "active" : ""}"
          data-step="${step.id}"
          ${reachable ? "" : "disabled"}
          ${reachable ? "" : 'title="Finish the previous step first"'}
        >
          ${index + 1}. ${step.label}
        </button>
      `;
    }).join("");
    this.innerHTML = `
      <div class="stepper">
        <div class="stepper-nav">${buttons}</div>
        <div class="step-hint">Complete each step to unlock the next.</div>
      </div>
    `;
    this.querySelectorAll("button[data-step]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.disabled) return;
        setCurrentStep(Number(btn.dataset.step));
      });
    });
  }
}

if (!customElements.get("stepper-nav")) {
  customElements.define("stepper-nav", StepperNav);
}
