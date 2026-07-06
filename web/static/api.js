import { state } from "./state.js";

// The SPA (Cloudflare Pages) and the API (Azure) may be on different origins;
// window.API_BASE (set by site-links.js) points absolute API calls at the
// backend. Empty locally / on the backend host, so calls stay same-origin.
export function apiUrl(path) {
  const base = (typeof window !== "undefined" && window.API_BASE) || "";
  return typeof path === "string" && path.startsWith("/") ? base + path : path;
}

export async function fetchJSON(url, options) {
  const resp = await fetch(apiUrl(url), options);
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(text || resp.statusText);
  }
  return resp.json();
}

export async function refreshRuns() {
  const data = await fetchJSON("/api/runs");
  state.runs = data.runs;
  state.runsLoaded = true;
  document.dispatchEvent(new CustomEvent("runs:updated"));
}

export async function refreshQuizzes() {
  const data = await fetchJSON("/api/quizzes");
  state.quizzes = data.quizzes || [];
  document.dispatchEvent(new CustomEvent("quizzes:updated"));
}
export async function loadQuiz(quizId) {
  const data = await fetchJSON(`/api/quizzes/${quizId}`);
  state.quiz = data.quiz;
  state.quizJson = data.quiz_json || null;
  state.quizRawPayload = data.raw_payload || null;
  state.quizRawPreview = data.raw_preview || null;
  state.quizMeta = data.quiz_meta || null;
  return data;
}

export async function loadRunDetails(runId, includeLog = false) {
  const requests = [
    fetchJSON(`/api/runs/${runId}`),
    fetchJSON(`/api/runs/${runId}/results`),
  ];
  if (includeLog) {
    requests.push(fetchJSON(`/api/runs/${runId}/log?tail=300`));
  }
  const [runData, resultsData, logData] = await Promise.all(requests);
  state.selectedRun = runId;
  state.selectedRunData = runData.run || null;
  state.assets = runData.assets || [];
  state.runResults = resultsData.results || [];
  state.runResultsSummary = resultsData.summary || null;
  state.runOutcomes = resultsData.outcomes || [];
  state.runError = null;
  if (logData) {
    state.runLog = logData.log || "";
    state.runLogExists = Boolean(logData.exists);
  }
  if (!state.selectedRunQuizMeta || state.selectedRunQuizId !== runData.run.quiz_id) {
    try {
      const quizData = await fetchJSON(`/api/quizzes/${runData.run.quiz_id}`);
      state.selectedRunQuizMeta = quizData.quiz_meta || null;
      state.selectedRunQuiz = quizData.quiz || null;
      state.selectedRunQuizId = runData.run.quiz_id;
    } catch (err) {
      state.selectedRunQuizMeta = null;
      state.selectedRunQuiz = null;
      state.selectedRunQuizId = null;
    }
  }
}

export async function selectRun(runId) {
  await loadRunDetails(runId, true);
  document.dispatchEvent(new CustomEvent("run:selected"));
}

export async function rerunReport(runId) {
  return fetchJSON(`/api/runs/${runId}/report`, { method: "POST" });
}
