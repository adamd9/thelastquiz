// Sign-up gate for running a quiz.
//
// Parsing and building a quiz stays free and open to everyone. Running a quiz
// spends on real AI-model calls, so it is gated behind a (free) account. The
// gate is a friendly, benefit-forward modal that signs the visitor in with a
// popup and then lets the run continue in place — no lost work, no page reload.

import {
  currentAccount,
  isEnabled,
  login,
  loginPopup,
  signup,
  signupPopup,
} from "./entra-auth.js";

// True when auth is configured for this deployment and the visitor isn't signed
// in yet. When auth is not configured (e.g. local dev), this is always false so
// runs stay anonymous.
export function needsSignIn() {
  return isEnabled() && !currentAccount();
}

// Show the gate. Resolves `true` once the visitor is signed in (so the caller
// can continue the run), or `false` if they dismissed it.
export function showAuthGate() {
  return new Promise((resolve) => {
    const root = document.createElement("div");
    root.className = "auth-gate";
    root.innerHTML = `
      <div class="auth-gate-backdrop" data-gate-close></div>
      <div class="auth-gate-panel" role="dialog" aria-modal="true"
           aria-label="Create an account to run your quiz">
        <button class="auth-gate-x" type="button" data-gate-close aria-label="Close">&times;</button>
        <p class="auth-gate-kicker">Your quiz is ready</p>
        <h2 class="auth-gate-title">Create a free account to run it</h2>
        <p class="auth-gate-sub">
          Sign in to send your quiz to the AI models and see how each one scores &mdash;
          it only takes a few seconds.
        </p>
        <ul class="auth-gate-benefits">
          <li><strong>Free forever</strong> &mdash; no credit card, no spam.</li>
          <li><strong>Your results are saved</strong> &mdash; revisit and share them anytime.</li>
          <li><strong>Track models over time</strong> &mdash; compare runs as you go.</li>
          <li><strong>One tap</strong> with Google, Apple, or email.</li>
        </ul>
        <div class="auth-gate-actions">
          <button class="auth-gate-primary" type="button" data-gate-signup>Create free account</button>
          <button class="auth-gate-secondary" type="button" data-gate-login>I already have an account</button>
        </div>
        <p class="auth-gate-fine">
          Building and parsing quizzes stays free without an account &mdash; you only
          sign in to run. Running sends your quiz to AI models (via OpenRouter); your
          run and results are saved to your account.
        </p>
        <p class="auth-gate-status" data-gate-status aria-live="polite"></p>
      </div>
    `;
    document.body.appendChild(root);
    // Enter animation on the next frame.
    requestAnimationFrame(() => root.classList.add("open"));

    const status = root.querySelector("[data-gate-status]");
    const actionButtons = root.querySelectorAll(".auth-gate-actions button");

    function onKey(event) {
      if (event.key === "Escape") close(false);
    }
    function close(result) {
      document.removeEventListener("keydown", onKey);
      root.remove();
      resolve(result);
    }
    document.addEventListener("keydown", onKey);
    root.querySelectorAll("[data-gate-close]").forEach((el) =>
      el.addEventListener("click", () => close(false)),
    );

    async function proceed(isSignup) {
      status.textContent = isSignup ? "Opening sign-up\u2026" : "Opening sign-in\u2026";
      actionButtons.forEach((b) => (b.disabled = true));
      try {
        const account = isSignup ? await signupPopup() : await loginPopup();
        if (account) return close(true);
        actionButtons.forEach((b) => (b.disabled = false));
        status.textContent = "";
      } catch (err) {
        const code = String((err && (err.errorCode || err.name)) || "");
        if (/popup|window/i.test(code)) {
          // Popups blocked — fall back to a full-page redirect.
          status.textContent = "Continuing in this window\u2026";
          return isSignup ? signup() : login();
        }
        actionButtons.forEach((b) => (b.disabled = false));
        status.textContent = "That didn't finish \u2014 want to try again?";
      }
    }

    root.querySelector("[data-gate-signup]").addEventListener("click", () => proceed(true));
    root.querySelector("[data-gate-login]").addEventListener("click", () => proceed(false));
  });
}
