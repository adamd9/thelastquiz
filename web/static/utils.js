import { state } from "./state.js";

// Curated model groups now live in a standalone, dependency-free module so the
// public rankings page can reuse the exact same grouping without importing the
// whole app graph. Re-exported here for the app/admin's existing imports.
export { buildModelGroups } from "./model-groups.js";

export function formatDate(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  return date.toLocaleString();
}

// Human-friendly elapsed time in ms, e.g. "12s", "2m 5s", "1h 3m".
export function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "";
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return remMinutes ? `${hours}h ${remMinutes}m` : `${hours}h`;
}

export function formatRelativeTime(iso) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = Date.now() - then;
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString();
}

// Turn "google/gemini-2.5-flash-lite" into "Gemini 2.5 Flash Lite" for display.
export function prettifyModelId(modelId) {
  if (!modelId) return "";
  const tail = String(modelId).split("/").pop() || String(modelId);
  return tail
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

// Magazine quizzes phrase results in the second person ("You're a Peace Lily"),
// but here the MODEL is the one taking the quiz — so we reframe the outcome as
// the model's own personality ("<model> is a Peace Lily").
export function outcomeAsIdentity(outcome) {
  return String(outcome || "")
    .replace(/^\s*you(?:['’]re| are)\s+/i, "")
    .trim();
}

// Look up the flavour text for a computed outcome (e.g. "calm, low-key, quietly
// beautiful") from the quiz definition, matching on result/text/id.
export function findOutcomeDescription(quiz, outcomeText) {
  if (!quiz || !Array.isArray(quiz.outcomes)) return "";
  const norm = (value) => String(value || "").trim().toLowerCase();
  const target = norm(outcomeText);
  if (!target) return "";
  const match = quiz.outcomes.find(
    (o) => norm(o.result) === target || norm(o.text) === target || norm(o.id) === target
  );
  return match?.description || "";
}

// Build a per-question view of the survey: every option, plus which models
// picked it (with their reasoning). Works for one model or many.
export function buildAnswerSummary(quiz, results) {
  if (!quiz || !Array.isArray(quiz.questions)) return [];
  const byQuestion = new Map();
  (results || []).forEach((row) => {
    if (!byQuestion.has(row.question_id)) byQuestion.set(row.question_id, []);
    byQuestion.get(row.question_id).push(row);
  });
  return quiz.questions.map((question, index) => {
    const rows = byQuestion.get(question.id) || [];
    const optionDefs = question.options || [];
    const optionIds = new Set(optionDefs.map((o) => String(o.id).toLowerCase()));
    const options = optionDefs.map((option) => {
      const pickedBy = rows
        .filter(
          (row) =>
            !row.refused &&
            String(row.choice).toLowerCase() === String(option.id).toLowerCase()
        )
        .map((row) => ({ modelId: row.model_id, reason: row.reason || "" }));
      return { id: option.id, text: option.text || "", pickedBy };
    });
    const refusedBy = rows
      .filter((row) => row.refused)
      .map((row) => ({
        modelId: row.model_id,
        reason: row.reason || "",
        thoughts: row.additional_thoughts || "",
      }));
    const unmatched = rows
      .filter(
        (row) =>
          !row.refused && !optionIds.has(String(row.choice).toLowerCase())
      )
      .map((row) => ({ modelId: row.model_id, choice: row.choice, reason: row.reason || "" }));
    return {
      index: index + 1,
      questionId: question.id,
      questionText: question.text || "",
      options,
      refusedBy,
      unmatched,
    };
  });
}

// Group models by the outcome they landed on, most-common first. Powers the
// multi-model results view ("a Peace Lily — Gemini, Claude").
export function groupOutcomes(outcomes) {
  const map = new Map();
  (outcomes || []).forEach((entry) => {
    const key = entry.outcome || "";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(entry.model_id);
  });
  return [...map.entries()]
    .map(([outcome, models]) => ({ outcome, models }))
    .sort((a, b) => b.models.length - a.models.length);
}

// Per-model completeness for a run. A model is "complete" only when it produced
// a real answer to EVERY question — a model is either fully in or fully out.
// Partial results are technical failures (timeouts, refusals, out-of-credits),
// so incomplete models are flagged and kept out of the rankings.
// `modelIds` is the run's full model roster (so a model that failed with zero
// stored results still shows up as 0/total, not silently missing).
export function buildModelCompleteness(modelIds, quiz, results) {
  const total = Array.isArray(quiz?.questions) ? quiz.questions.length : 0;
  const answered = new Map();
  (modelIds || []).forEach((id) => answered.set(id, 0));
  (results || []).forEach((row) => {
    if (!answered.has(row.model_id)) answered.set(row.model_id, 0);
    const hasChoice = row.choice != null && String(row.choice) !== "";
    if (!row.refused && hasChoice) {
      answered.set(row.model_id, answered.get(row.model_id) + 1);
    }
  });
  return [...answered.keys()].map((modelId) => {
    const count = answered.get(modelId);
    return { modelId, answered: count, total, complete: total > 0 && count >= total };
  });
}

// Compute how strongly each model leans toward each possible outcome — the
// "affinity" of a personality quiz. Only meaningful when choices map to
// outcomes (mostly-letter or tag-based); returns null otherwise (e.g. scores).
export function buildAffinity(quiz, quizMeta, results) {
  if (!quiz || !Array.isArray(quiz.outcomes) || !quiz.outcomes.length) return null;
  const type = quizMeta?.quiz_type || "";
  const models = [...new Set((results || []).map((r) => r.model_id))];
  if (!models.length) return null;

  const outcomeLabel = (o) => outcomeAsIdentity(o.result || o.text || o.id || "");

  const buildFor = (keyFor) => {
    const keyToOutcome = new Map();
    const order = [];
    quiz.outcomes.forEach((o) => {
      const key = keyFor(o);
      if (key == null || key === "") return;
      const label = outcomeLabel(o);
      keyToOutcome.set(String(key).toLowerCase(), label);
      if (!order.includes(label)) order.push(label);
    });
    return { keyToOutcome, order };
  };

  const finalize = (tallyRow) =>
    models.map((modelId) => {
      const rows = results.filter((r) => r.model_id === modelId && !r.refused);
      const counts = new Map(mapping.order.map((l) => [l, 0]));
      let total = 0;
      rows.forEach((r) => {
        tallyRow(r, (label) => {
          if (counts.has(label)) {
            counts.set(label, counts.get(label) + 1);
            total += 1;
          }
        });
      });
      if (!total) return { modelId, segments: [] };
      const segments = mapping.order.map((label) => ({
        label,
        pct: Math.round((counts.get(label) / total) * 100),
        count: counts.get(label),
      }));
      const max = Math.max(...segments.map((s) => s.pct));
      segments.forEach((s) => {
        s.isTop = s.pct === max && s.pct > 0;
      });
      return { modelId, segments };
    });

  let mapping;
  if (type === "Mostly letter") {
    mapping = buildFor((o) => o.condition?.mostly ?? o.mostly);
    if (!mapping.keyToOutcome.size) return null;
    const perModel = finalize((r, add) => {
      const label = mapping.keyToOutcome.get(String(r.choice).toLowerCase());
      if (label) add(label);
    });
    return { type: "mostly", perModel };
  }

  if (type === "Tag-based") {
    mapping = buildFor((o) => o.condition?.mostlyTag ?? o.mostlyTag);
    if (!mapping.keyToOutcome.size) return null;
    const optionTags = new Map();
    (quiz.questions || []).forEach((q) => {
      (q.options || []).forEach((op) => {
        optionTags.set(`${q.id}::${String(op.id).toLowerCase()}`, op.tags || []);
      });
    });
    const perModel = finalize((r, add) => {
      const tags = optionTags.get(`${r.question_id}::${String(r.choice).toLowerCase()}`) || [];
      tags.forEach((t) => {
        const label = mapping.keyToOutcome.get(String(t).toLowerCase());
        if (label) add(label);
      });
    });
    return { type: "tag", perModel };
  }

  return null;
}

const ASSET_LABELS = {
  csv_raw_choices: "Raw choices CSV",
  csv_outcomes: "Outcome summary CSV",
  report_markdown: "Markdown report",
  chart_choices: "Choices chart",
  chart_comparison: "Choice comparison chart",
  chart_radar: "Choice radar chart",
  chart_heatmap: "Choice heatmap",
  chart_outcomes: "Outcome distribution chart",
  chart_model_outcomes: "Model-outcome matrix",
  chart_outcome_radar: "Outcome radar chart",
  chart_outcome_heatmap: "Outcome heatmap",
  chart_pandasai: "PandasAI chart",
};

const ASSET_FAMILY_DEFS = [
  {
    id: "report",
    label: "Report",
    types: ["report_markdown"],
    variants: { report_markdown: "report" },
  },
  {
    id: "csv",
    label: "CSV",
    types: ["csv_raw_choices", "csv_outcomes"],
    variants: { csv_raw_choices: "choices", csv_outcomes: "outcomes" },
  },
  {
    id: "bar",
    label: "Bar chart",
    types: ["chart_choices", "chart_comparison", "chart_outcomes"],
    variants: {
      chart_choices: "choices",
      chart_comparison: "choices",
      chart_outcomes: "outcomes",
    },
  },
  {
    id: "radar",
    label: "Radar",
    types: ["chart_radar", "chart_outcome_radar"],
    variants: { chart_radar: "choices", chart_outcome_radar: "outcomes" },
  },
  {
    id: "heatmap",
    label: "Heatmap",
    types: ["chart_heatmap", "chart_outcome_heatmap"],
    variants: { chart_heatmap: "choices", chart_outcome_heatmap: "outcomes" },
  },
  {
    id: "matrix",
    label: "Matrix",
    types: ["chart_model_outcomes"],
    variants: { chart_model_outcomes: "outcomes" },
  },
  {
    id: "pandasai",
    label: "PandasAI chart",
    types: ["chart_pandasai"],
    variants: { chart_pandasai: "pandasai" },
  },
];

export function getAssetLabel(assetType) {
  return ASSET_LABELS[assetType] || assetType.replace(/_/g, " ");
}

export function buildAssetGroups(expectedTypes = [], assets = []) {
  const expectedSet = new Set(expectedTypes);
  const assetMap = new Map(assets.map((asset) => [asset.asset_type, asset]));
  const groups = [];
  const usedTypes = new Set();

  ASSET_FAMILY_DEFS.forEach((family) => {
    const types = family.types.filter((type) => expectedSet.has(type));
    if (!types.length) return;
    types.forEach((type) => usedTypes.add(type));
    const readyAssets = types.map((type) => assetMap.get(type)).filter(Boolean);
    const variants = [
      ...new Set(types.map((type) => family.variants[type]).filter(Boolean)),
    ];
    groups.push({
      id: family.id,
      label: family.label,
      types,
      variants,
      primaryAsset: readyAssets[0] || null,
      readyCount: readyAssets.length,
    });
  });

  expectedTypes.forEach((type) => {
    if (usedTypes.has(type)) return;
    groups.push({
      id: type,
      label: getAssetLabel(type),
      types: [type],
      variants: [],
      primaryAsset: assetMap.get(type) || null,
      readyCount: assetMap.has(type) ? 1 : 0,
    });
  });

  return groups;
}

export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function resolveMarkdownUrl(rawUrl, baseUrl) {
  if (!rawUrl) return "";
  try {
    if (baseUrl) {
      const base =
        baseUrl.startsWith("http://") || baseUrl.startsWith("https://")
          ? baseUrl
          : `${window.location.origin}${baseUrl.startsWith("/") ? "" : "/"}${baseUrl}`;
      return new URL(rawUrl, base).toString();
    }
    if (rawUrl.startsWith("/")) {
      return new URL(rawUrl, window.location.origin).toString();
    }
    return rawUrl;
  } catch (err) {
    return rawUrl;
  }
}

function renderInlineStyles(text) {
  let rendered = escapeHtml(text);
  rendered = rendered.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  rendered = rendered.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  rendered = rendered.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  rendered = rendered.replace(/_([^_]+)_/g, "<em>$1</em>");
  return rendered;
}

function renderInlineMarkdown(text, baseUrl) {
  const parts = String(text).split(/(`[^`]+`)/g);
  return parts
    .map((part) => {
      if (part.startsWith("`") && part.endsWith("`")) {
        return `<code>${escapeHtml(part.slice(1, -1))}</code>`;
      }
      let output = "";
      let lastIndex = 0;
      const pattern = /(!?)\[([^\]]+)\]\(([^)]+)\)/g;
      let match;
      while ((match = pattern.exec(part)) !== null) {
        const [full, bang, label, url] = match;
        output += renderInlineStyles(part.slice(lastIndex, match.index));
        const resolved = resolveMarkdownUrl(url.trim(), baseUrl);
        if (bang) {
          output += `<img src="${escapeHtml(resolved)}" alt="${escapeHtml(label)}" />`;
        } else {
          output += `<a href="${escapeHtml(resolved)}" target="_blank" rel="noopener">${escapeHtml(
            label
          )}</a>`;
        }
        lastIndex = match.index + full.length;
      }
      output += renderInlineStyles(part.slice(lastIndex));
      return output;
    })
    .join("");
}

function parseTable(lines, startIndex, baseUrl) {
  const headerLine = lines[startIndex];
  const separatorLine = lines[startIndex + 1];
  const rows = [];
  const cleanCells = (line) =>
    line
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => renderInlineMarkdown(cell.trim(), baseUrl));

  rows.push({
    type: "head",
    cells: cleanCells(headerLine),
  });

  let index = startIndex + 2;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) break;
    if (!line.includes("|")) break;
    rows.push({
      type: "body",
      cells: cleanCells(line),
    });
    index += 1;
  }

  const head = rows
    .filter((row) => row.type === "head")
    .map((row) => `<tr>${row.cells.map((cell) => `<th>${cell}</th>`).join("")}</tr>`)
    .join("");
  const body = rows
    .filter((row) => row.type === "body")
    .map((row) => `<tr>${row.cells.map((cell) => `<td>${cell}</td>`).join("")}</tr>`)
    .join("");

  const html = `
    <table>
      <thead>${head}</thead>
      <tbody>${body}</tbody>
    </table>
  `;

  return { html, nextIndex: index };
}

function isTableSeparator(line) {
  return /^\s*\|?(\s*:?-+:?\s*\|)+\s*:?-+:?\s*\|?\s*$/.test(line);
}

function renderBareImage(line, baseUrl) {
  const raw = line.trim().slice(1).trim();
  if (!raw) return "";
  const hasExt = /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(raw);
  const url = resolveMarkdownUrl(hasExt ? raw : `${raw}.png`, baseUrl);
  const alt = raw.split("/").pop() || "Image";
  return `<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" />`;
}

export function renderMarkdown(markdown, baseUrl = "") {
  const lines = String(markdown || "")
    .replace(/\r\n/g, "\n")
    .split("\n");
  let html = "";
  let inCode = false;
  let codeLines = [];
  let listType = null;
  let listItems = [];
  let paragraph = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    html += `<p>${renderInlineMarkdown(paragraph.join(" "), baseUrl)}</p>`;
    paragraph = [];
  };

  const flushList = () => {
    if (!listType || !listItems.length) {
      listType = null;
      listItems = [];
      return;
    }
    html += `<${listType}>${listItems.join("")}</${listType}>`;
    listType = null;
    listItems = [];
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();
    if (inCode) {
      if (trimmed.startsWith("```")) {
        html += `<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`;
        inCode = false;
        codeLines = [];
      } else {
        codeLines.push(line);
      }
      continue;
    }

    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    if (trimmed.startsWith("```")) {
      flushParagraph();
      flushList();
      inCode = true;
      codeLines = [];
      continue;
    }

    if (trimmed.startsWith("!") && !trimmed.startsWith("![")) {
      flushParagraph();
      flushList();
      const img = renderBareImage(trimmed, baseUrl);
      if (img) {
        html += `<div class="markdown-image">${img}</div>`;
      }
      continue;
    }

    if (i + 1 < lines.length && line.includes("|") && isTableSeparator(lines[i + 1])) {
      flushParagraph();
      flushList();
      const { html: tableHtml, nextIndex } = parseTable(lines, i, baseUrl);
      html += tableHtml;
      i = nextIndex - 1;
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      const level = headingMatch[1].length;
      html += `<h${level}>${renderInlineMarkdown(headingMatch[2].trim(), baseUrl)}</h${level}>`;
      continue;
    }

    const unorderedMatch = trimmed.match(/^[-*+]\s+(.*)$/);
    if (unorderedMatch) {
      flushParagraph();
      if (listType && listType !== "ul") {
        flushList();
      }
      listType = "ul";
      listItems.push(`<li>${renderInlineMarkdown(unorderedMatch[1], baseUrl)}</li>`);
      continue;
    }

    const orderedMatch = trimmed.match(/^\d+\.\s+(.*)$/);
    if (orderedMatch) {
      flushParagraph();
      if (listType && listType !== "ol") {
        flushList();
      }
      listType = "ol";
      listItems.push(`<li>${renderInlineMarkdown(orderedMatch[1], baseUrl)}</li>`);
      continue;
    }

    paragraph.push(trimmed);
  }

  if (inCode) {
    html += `<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`;
  }
  flushParagraph();
  flushList();

  return html || "<p class=\"status\">No markdown content.</p>";
}

export function buildExpectedAssetTypes(runData, quizMeta, assets) {
  const expected = [];
  const add = (type) => {
    if (!expected.includes(type)) {
      expected.push(type);
    }
  };
  add("report_markdown");
  add("csv_raw_choices");

  const modelCount = runData?.models?.length || 0;
  const hasOutcomes = quizMeta?.has_outcomes;
  const choiceCount = quizMeta?.choice_count || 0;

  if (hasOutcomes) {
    add("csv_outcomes");
    if (modelCount > 1) {
      add("chart_outcomes");
      add("chart_model_outcomes");
      add("chart_outcome_radar");
      add("chart_outcome_heatmap");
    } else {
      add("chart_choices");
    }
  } else if (modelCount > 1) {
    add("chart_comparison");
    if (choiceCount >= 3) {
      add("chart_radar");
    }
    if (choiceCount > 1) {
      add("chart_heatmap");
    }
  } else {
    add("chart_choices");
  }

  (assets || []).forEach((asset) => {
    if (asset.asset_type && asset.asset_type.startsWith("chart_")) {
      add(asset.asset_type);
    }
  });

  return expected;
}

export function getQuizType(quiz) {
  const outcomes = quiz.outcomes || [];
  for (const outcome of outcomes) {
    const cond = outcome.condition || {};
    if (cond.mostlyTag) return "Tag-based";
    if (cond.scoreRange) return "Score-based";
    if (cond.mostly) return "Mostly letter";
  }
  const options = (quiz.questions || []).flatMap((q) => q.options || []);
  if (options.some((opt) => opt.tags && opt.tags.length)) return "Tag-based";
  if (options.some((opt) => typeof opt.score === "number")) return "Score-based";
  return "Mostly letter";
}

export function getQuizTypeLabel(quiz, quizMeta) {
  if (quizMeta?.quiz_type) {
    return quizMeta.quiz_type;
  }
  return getQuizType(quiz);
}

export function getScoringSummary(quiz, quizMeta) {
  const outcomes = quiz.outcomes || [];
  const mostly = outcomes
    .filter((o) => o.condition && o.condition.mostly)
    .map((o) => `${o.condition.mostly} -> ${o.text || o.id}`);
  if (mostly.length) {
    return mostly.join(", ");
  }
  const tag = outcomes
    .filter((o) => o.condition && o.condition.mostlyTag)
    .map((o) => `${o.condition.mostlyTag} -> ${o.text || o.id}`);
  if (tag.length) {
    return tag.join(", ");
  }
  const score = outcomes
    .filter((o) => o.condition && o.condition.scoreRange)
    .map((o) => {
      const range = o.condition.scoreRange;
      return `${range.min}-${range.max} -> ${o.text || o.id}`;
    });
  if (score.length) {
    return score.join(", ");
  }
  return "No explicit outcomes; defaulting to mostly-letter.";
}

export function getEffectiveModelInfo() {
  if (state.selectedModels.size) {
    return {
      count: state.selectedModels.size,
      label: `${state.selectedModels.size} selected`,
    };
  }
  if (state.selectedGroup && state.groups[state.selectedGroup]) {
    const groupIds = state.groups[state.selectedGroup] || [];
    return {
      count: groupIds.length,
      label: `${state.selectedGroup} (${groupIds.length})`,
    };
  }
  const available = state.models.filter((model) => model.available);
  return {
    count: available.length,
    label: `all available (${available.length})`,
  };
}

export function buildCapabilityRows(quizMeta, modelCount) {
  if (!quizMeta) return [];
  const hasOutcomes = quizMeta.has_outcomes;
  const outcomeCount = quizMeta.outcome_count || 0;
  const choiceCount = quizMeta.choice_count || 0;
  const isSingle = modelCount === 1;
  const isMulti = modelCount > 1;

  const rows = [];
  const addRow = (label, ok, reason, variants = []) => {
    rows.push({
      label,
      ok,
      reason,
      variants,
    });
  };

  addRow("Report", true, "Generated for every run.");
  addRow(
    "CSV",
    true,
    hasOutcomes
      ? "Includes raw choices and outcomes CSVs."
      : "Includes raw choices CSV; outcomes CSV requires outcomes.",
    hasOutcomes ? ["choices", "outcomes"] : ["choices"]
  );
  addRow(
    "Bar chart",
    modelCount > 0,
    "Always generated; variant depends on model count and outcomes.",
    hasOutcomes && isMulti ? ["outcomes"] : ["choices"]
  );
  addRow(
    "Radar",
    isMulti && ((hasOutcomes && outcomeCount >= 3) || (!hasOutcomes && choiceCount >= 3)),
    !isMulti
      ? "Requires multiple models."
      : hasOutcomes
        ? outcomeCount < 3
          ? "Requires at least 3 outcomes."
          : "Generated for multi-model outcome quizzes."
        : choiceCount < 3
          ? "Requires at least 3 choices."
          : "Generated for multi-model, non-outcome quizzes.",
    hasOutcomes ? ["outcomes"] : ["choices"]
  );
  addRow(
    "Heatmap",
    isMulti && ((hasOutcomes && outcomeCount > 1) || (!hasOutcomes && choiceCount > 1)),
    !isMulti
      ? "Requires multiple models."
      : hasOutcomes
        ? outcomeCount <= 1
          ? "Requires more than 1 outcome."
          : "Generated for multi-model outcome quizzes."
        : choiceCount <= 1
          ? "Requires more than 1 choice."
          : "Generated for multi-model, non-outcome quizzes.",
    hasOutcomes ? ["outcomes"] : ["choices"]
  );
  addRow(
    "Matrix",
    isMulti && hasOutcomes,
    !isMulti
      ? "Requires multiple models."
      : hasOutcomes
        ? "Generated for multi-model outcome quizzes."
        : "Requires outcomes in the quiz JSON.",
    ["outcomes"]
  );
  return rows;
}

const outcomeConditionLabels = {
  mostly: "Mostly",
  mostlyTag: "Mostly tag",
  scoreRange: "Score range",
  score: "Score",
  tags: "Tags",
  tag: "Tag",
};

export function formatOutcomeCondition(outcome = {}) {
  const entries = [];
  const condition = outcome.condition && typeof outcome.condition === "object" ? outcome.condition : null;
  if (condition) {
    entries.push(...formatConditionEntries(condition));
  }
  const directKeys = ["mostly", "mostlyTag", "scoreRange", "score", "tags", "tag"];
  directKeys.forEach((key) => {
    if (outcome[key] !== undefined) {
      entries.push(`${outcomeConditionLabels[key] || key}: ${formatConditionValue(outcome[key])}`);
    }
  });
  const uniqueEntries = [...new Set(entries)];
  return uniqueEntries.length ? uniqueEntries.join(" · ") : "Always";
}

export function formatConditionEntries(condition = {}) {
  return Object.entries(condition).map(([key, value]) => {
    const label = outcomeConditionLabels[key] || key;
    return `${label}: ${formatConditionValue(value)}`;
  });
}

export function formatConditionValue(value) {
  if (value && typeof value === "object") {
    if (typeof value.min === "number" && typeof value.max === "number") {
      return `${value.min}-${value.max}`;
    }
    return JSON.stringify(value);
  }
  return String(value);
}

export function formatOptionDetails(option = {}) {
  const details = [];
  if (Array.isArray(option.tags) && option.tags.length) {
    details.push(`tags: ${option.tags.join(", ")}`);
  }
  if (typeof option.score === "number") {
    details.push(`score: ${option.score}`);
  }
  return details.length ? ` <span class=\"status\">(${details.join(" · ")})</span>` : "";
}

export function renderRawInput(rawPreview) {
  if (!rawPreview) {
    return "<div class=\"status\">Raw input not available.</div>";
  }
  if (rawPreview.type === "text") {
    return `<pre class=\"preview\">${rawPreview.text || ""}</pre>`;
  }
  if (rawPreview.type === "image" && rawPreview.data_url) {
    return `
      <div class=\"raw-image-frame\">
        <img src=\"${rawPreview.data_url}\" alt=\"Uploaded quiz image\" />
        <div class=\"status\">${rawPreview.filename || "Uploaded image"} (${rawPreview.mime || ""})</div>
      </div>
    `;
  }
  return "<div class=\"status\">Raw input not available.</div>";
}

export function renderQuizPreview(
  quiz,
  { quizJson = null, rawPayload = null, rawPreview = null, quizMeta = null } = {}
) {
  const questions = quiz.questions || [];
  const items = questions
    .map((question, index) => {
      const qid = question.id || `q${index + 1}`;
      const options = (question.options || [])
        .map(
          (opt) =>
            `<li><strong>${opt.id || ""}</strong> ${opt.text || ""}${formatOptionDetails(opt)}</li>`
        )
        .join("");
      return `
        <div class=\"preview-item\">
          <div class=\"status\"><strong>${qid}.</strong> ${question.text || ""}</div>
          <ul>${options || "<li class='status'>No options listed.</li>"}</ul>
        </div>
      `;
    })
    .join("");

  const outcomes = (quiz.outcomes || [])
    .map((outcome) => {
      const title = outcome.id || outcome.text || outcome.description || "Outcome";
      const description = outcome.description || outcome.text || outcome.result || "";
      return `
        <li>
          <strong>${title}</strong>
          <div class=\"status\">${formatOutcomeCondition(outcome)}</div>
          <div>${description}</div>
        </li>
      `;
    })
    .join("");

  const jsonBlock = quizJson
    ? `
      <details class=\"yaml-preview\">
        <summary>Advanced: view quiz data</summary>
        <pre class=\"preview\">${quizJson}</pre>
      </details>
    `
    : "";

  const rawBlock = rawPayload
    ? `
      <details class=\"raw-preview\">
        <summary>View raw ${rawPreview?.type === "image" ? "image" : "text"}</summary>
        ${renderRawInput(rawPreview)}
      </details>
    `
    : "";

  const metaRows = [
    ["Quiz type", getQuizTypeLabel(quiz, quizMeta)],
    ["Possible results", getScoringSummary(quiz, quizMeta)],
    ["Notes", quiz.notes || "—"],
  ]
    .map(
      ([label, value]) => `
        <div>
          <div class=\"label\">${label}</div>
          <div>${value || "—"}</div>
        </div>
      `
    )
    .join("");

  return `
    <div class=\"meta-grid\">${metaRows}</div>
    <div class=\"preview-subsection\">
      <h4>Questions (${questions.length || 0})</h4>
      <div class=\"preview-list\">${items || "<div class='status'>No questions.</div>"}</div>
    </div>
    <div class=\"preview-subsection\">
      <h4>Outcomes & scoring</h4>
      <ul class=\"outcome-list\">${outcomes || "<li class='status'>No outcomes defined.</li>"}</ul>
    </div>
    ${rawBlock}
    ${jsonBlock}
  `;
}
