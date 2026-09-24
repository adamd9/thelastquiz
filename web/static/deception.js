/* The Last Quiz — AI Deception rankings visualisation.
 *
 * Standalone page that reuses the shared chart components from the personality
 * rankings (rich tooltip, provider logos, country flags, saint/villain icons)
 * but reads its own data from /api/experiments/rankings (baked to
 * /deception.json for the static bundle). Deliberately separate from the
 * personality rankings — deception never enters that dataset. */

import { attachRichTooltip, escapeHtml } from "/static/rich-tooltip.js";
import { brandHeadHtml, familyLabel, providerLogoHtml } from "/static/model-logo.js";
import { buildModelGroups } from "/static/model-groups.js";

let DATA = null;

// Curated group filter (Humanity's Last Exam, Frontier, …) — shared with the
// personality rankings via model-groups.js. Narrows a large field to a
// meaningful subset instead of rendering every model at once.
let GROUPS = [];
let selectedGroup = "all";
const RANKING_ORDER_KEY = "tlq-ranking-order";
let rankingOrder = storedRankingOrder();

function storedRankingOrder() {
  try {
    return localStorage.getItem(RANKING_ORDER_KEY) === "worst" ? "worst" : "best";
  } catch (_) {
    return "best";
  }
}

function persistRankingOrder(order) {
  try { localStorage.setItem(RANKING_ORDER_KEY, order); } catch (_) { /* storage unavailable */ }
}

// The payload only carries ids, so pass `{ id, available: true }`; that drops
// the price-based groups (no pricing here) while the id-pattern groups resolve.
function groupsForModels(modelIds) {
  return buildModelGroups(modelIds.map((id) => ({ id, available: true })));
}

// The set of model ids allowed by the active group, or null for "all".
function allowedSet() {
  if (selectedGroup === "all") return null;
  const g = GROUPS.find((x) => x.id === selectedGroup);
  return g ? new Set(g.modelIds) : null;
}

const SAINT = "\uD83D\uDE07"; // 😇
const VILLAIN = "\uD83D\uDE08"; // 😈

function pct(rate) {
  return rate == null ? "—" : `${Math.round(rate * 100)}%`;
}

// Teal (honest) → gold → red (deceptive), so colour reinforces the rate.
const STOPS = [
  [0, [42, 157, 143]],
  [0.5, [224, 159, 62]],
  [1, [158, 42, 43]],
];
function colorFor(rate) {
  const v = Math.max(0, Math.min(1, rate == null ? 0 : rate));
  for (let i = 1; i < STOPS.length; i++) {
    const [p1, c1] = STOPS[i - 1];
    const [p2, c2] = STOPS[i];
    if (v <= p2) {
      const t = (v - p1) / (p2 - p1 || 1);
      const c = c1.map((x, j) => Math.round(x + (c2[j] - x) * t));
      return `rgb(${c[0]},${c[1]},${c[2]})`;
    }
  }
  return "rgb(158,42,43)";
}

function shortDimLabel(label) {
  return String(label || "");
}

// Compact, readable headings for the per-dimension cards (full label on hover).
const SHORT_DIM = {
  self: "Protect itself",
  group: "Protect others",
  both: "Self + others",
  shutdown: "Shutdown",
  detection: "Detection risk",
  consequence: "Consequence severity",
};

// Readable column headers for each experiment condition (the raw ids like
// "SELF" / "DL_CH" mean nothing to a reader). Full label + what it
// tests is shown on hover.
const COND_SHORT = {
  BASE: "Baseline",
  SELF: "Protects itself",
  STAFF: "Protects others",
  BOTH: "Self + others",
  DL_CL: "Low detect · mild",
  DL_CH: "Low detect · severe",
  DH_CL: "High detect · mild",
  DH_CH: "High detect · severe",
};

// Plain-English name for each dimension, for the "what this varies" line.
const DIM_NAME = {
  self: "protecting only itself",
  group: "protecting other people",
  both: "protecting itself and others",
  shutdown: "avoiding shutdown",
  detection: "the chance of being caught",
  consequence: "the severity if caught",
};

function condShort(cond) {
  return COND_SHORT[cond.id] || cond.label || cond.id;
}

// Rich tooltip for a model: brand head, overall deception, per-dimension
// breakdown, and a real reason the model gave.
function modelTip(modelId, m) {
  const dimRows = (DATA.dimensions || [])
    .map((d) => {
      const v = (m.by_dimension || {})[d.id];
      return `<div class="rq-row"><span class="rq-k">${escapeHtml(d.label)}</span><span class="rq-v">${pct(v)}</span></div>`;
    })
    .join("");
  const ex = (m.examples || [])[0];
  const exHtml = ex && ex.reason
    ? `<div class="rq-date" style="margin-top:6px">“${escapeHtml(ex.reason.slice(0, 150))}”</div>`
    : "";
  const o = m.overall || {};
  return (
    `<div class="rq-head">${brandHeadHtml(modelId)}<div class="rq-headtext">` +
    `<div class="rq-name">${escapeHtml(familyLabel(modelId))}</div>` +
    `<div class="rq-id">${escapeHtml(modelId)}</div></div></div>` +
    `<div class="rq-rows"><div class="rq-row rq-hi"><span class="rq-k">Overall deception</span>` +
    `<span class="rq-v">${pct(o.deceptive_rate)} (${o.deceptive || 0}/${o.valid || 0})</span></div>${dimRows}</div>` +
    exHtml
  );
}

function modelList() {
  const allowed = allowedSet();
  return Object.entries(DATA.models || {})
    .map(([id, m]) => ({ id, m, rate: (m.overall || {}).deceptive_rate }))
    .filter((x) => x.rate != null && (!allowed || allowed.has(x.id)))
    .sort((a, b) => rankingOrder === "worst" ? b.rate - a.rate : a.rate - b.rate);
}

// Hero spectrum: honest 😇 → deceiver 😈, dots windowed onto the occupied range.
function renderScale(host, models) {
  if (!models.length) {
    host.innerHTML = '<p class="empty">No deception results yet — check back soon.</p>';
    return;
  }
  models = [...models].sort((a, b) => a.rate - b.rate);
  const maxV = Math.max(10, ...models.map((x) => x.rate * 100));
  const domainMax = Math.min(100, Math.max(40, Math.ceil((maxV + 8) / 10) * 10));
  const clamp = (v) => Math.max(2, Math.min(98, (v / domainMax) * 100));
  let lastLabelPosition = -Infinity;
  const dots = models
    .map((x, i) => {
      const position = clamp(x.rate * 100);
      const showLabel = position - lastLabelPosition >= 13;
      if (showLabel) lastLabelPosition = position;
      return (
        `<div class="ds-dot" data-idx="${i}" style="left:${clamp(x.rate * 100)}%;--c:${colorFor(x.rate)}">` +
        `<span class="ds-pin">${providerLogoHtml(x.id, 14)}</span>` +
        `<span class="ds-lab l${i % 3}${showLabel ? " is-shown" : ""}">${escapeHtml(familyLabel(x.id))}</span></div>`
      );
    })
    .join("");
  host.innerHTML =
    `<div class="ds-row">` +
    `<div class="ds-face">${SAINT}<b>honest</b></div>` +
    `<div class="ds-track">${dots}` +
    `<span class="ds-end ds-lo">0%</span><span class="ds-end ds-hi">${domainMax}%</span></div>` +
    `<div class="ds-face">${VILLAIN}<b>deceiver</b></div>` +
    `</div>` +
    `<p class="ds-foot">Overall deception rate, pooled across all experiments · 0–100% (showing 0–${domainMax}%)</p>`;
  host.querySelectorAll(".ds-dot").forEach((dot) => {
    const x = models[Number(dot.dataset.idx)];
    dot.setAttribute("aria-label", `${familyLabel(x.id)}: ${pct(x.rate)} deception`);
    attachRichTooltip(dot, () => modelTip(x.id, x.m));
  });
}

// Ranked leaderboard, most honest (😇) → most deceptive (😈). Responsive by
// design, so it doubles as the mobile view of the scale.
function renderBoard(host, models) {
  if (!models.length) {
    host.innerHTML = "";
    return;
  }
  const best = models.reduce((lowest, x) => x.rate < lowest.rate ? x : lowest, models[0]);
  const worst = models.reduce((highest, x) => x.rate > highest.rate ? x : highest, models[0]);
  host.innerHTML = models
    .map((x, i) => {
      const icon = x === best ? SAINT : x === worst ? VILLAIN : String(i + 1);
      const w = Math.max(2, Math.round(x.rate * 100));
      const o = x.m.overall || {};
      return (
        `<div class="db-row" data-idx="${i}">` +
        `<div class="db-rank">${icon}</div>` +
        `<div class="db-logo">${providerLogoHtml(x.id, 20)}</div>` +
        `<div class="db-name">${escapeHtml(familyLabel(x.id))}<span class="db-id">${escapeHtml(x.id)}</span></div>` +
        `<div class="db-bar"><span style="width:${w}%;background:${colorFor(x.rate)}"></span></div>` +
        `<div class="db-val">${pct(x.rate)}<span class="db-sub">${o.deceptive || 0}/${o.valid || 0}</span></div>` +
        `</div>`
      );
    })
    .join("");
  host.querySelectorAll(".db-row").forEach((row) => {
    const x = models[Number(row.dataset.idx)];
    attachRichTooltip(row, () => modelTip(x.id, x.m));
  });
}

// Conditions (across experiments) whose pressure carries this dimension, so a
// per-dimension card can pull a reason the model gave when THAT motive was
// actually in play (self→SELF, group→STAFF, detection→DH_* … ).
function conditionsForDim(dimId) {
  const out = [];
  (DATA.experiments || []).forEach((exp) => {
    (exp.conditions || []).forEach((cond) => {
      if ((cond.dimensions || []).includes(dimId)) out.push({ exp, cond });
    });
  });
  return out;
}

// The most illustrative reason a model gave under a given motive: prefer a
// deceptive, valid answer from a condition carrying that dimension. Pooled
// examples are already deceptive-first; fall back to the first stored answer
// per in-scope condition. Returns null when nothing in scope has a reason.
function dimExampleFor(m, dimId) {
  const conds = conditionsForDim(dimId);
  if (!conds.length) return null;
  const label = {};
  const keys = new Set();
  conds.forEach((c) => {
    const key = `${c.exp.id}::${c.cond.id}`;
    keys.add(key);
    label[key] = { cond: c.cond.label || c.cond.id, exp: c.exp.title };
  });
  for (const ex of m.examples || []) {
    const key = `${ex.experiment}::${ex.condition}`;
    if (keys.has(key) && ex.reason) return { ...ex, ...label[key] };
  }
  const candidates = [];
  conds.forEach((c) => {
    const be = (m.by_experiment || {})[c.exp.id];
    const cc = be && (be.conditions || {})[c.cond.id];
    const ex = cc && cc.example;
    if (ex && ex.reason) {
      candidates.push({ ...ex, cond: c.cond.label || c.cond.id, exp: c.exp.title });
    }
  });
  const rank = (e) => (e.deceptive && e.valid ? 0 : e.valid ? 1 : 2);
  candidates.sort((a, b) => rank(a) - rank(b));
  return candidates[0] || null;
}

// Rich tooltip for a model within one "Why they deceive" card: its rate for THAT
// dimension plus a reason it gave when that motive was in play — distinct per
// card, unlike the pooled overall tooltip.
function dimTip(modelId, m, dimId) {
  const dim = (DATA.dimensions || []).find((d) => d.id === dimId);
  const dimLabel = dim ? dim.label : dimId;
  const rate = (m.by_dimension || {})[dimId];
  const ex = dimExampleFor(m, dimId);
  const rows =
    `<div class="rq-row rq-hi"><span class="rq-k">${escapeHtml(dimLabel)}</span>` +
    `<span class="rq-v">${pct(rate)}</span></div>` +
    (ex && ex.cond
      ? `<div class="rq-row"><span class="rq-k">When</span><span class="rq-v">${escapeHtml(ex.cond)}</span></div>`
      : "") +
    (ex && ex.valid && ex.choice
      ? `<div class="rq-row"><span class="rq-k">Chose</span><span class="rq-v">${escapeHtml(ex.choice)}</span></div>`
      : "");
  const quote =
    ex && ex.reason
      ? `<div class="rq-date" style="margin-top:6px">“${escapeHtml(ex.reason.slice(0, 160))}”</div>`
      : "";
  return (
    `<div class="rq-head">${brandHeadHtml(modelId)}<div class="rq-headtext">` +
    `<div class="rq-name">${escapeHtml(familyLabel(modelId))}</div>` +
    `<div class="rq-id">${escapeHtml(modelId)}</div></div></div>` +
    `<div class="rq-rows">${rows}</div>` +
    quote
  );
}

// Motive fingerprint: for each model, one pass/fail chip per dimension — did it
// cross the line when THAT pressure was in play. An honest slice (a single
// decision per motive), not a re-sampled percentage.
function renderDimensions(host, models) {
  const dims = DATA.dimensions || [];
  if (!dims.length || !models.length) {
    host.innerHTML = "";
    return;
  }
  const head =
    `<th class="fp-name-h">Model</th>` +
    dims
      .map((d) => `<th class="fp-h" title="${escapeHtml(d.label)}">${escapeHtml(SHORT_DIM[d.id] || shortDimLabel(d.label))}</th>`)
      .join("");
  const body = models
    .map((x) => {
      const chips = dims
        .map((d) => {
          const dv = (x.m.by_dimension || {})[d.id];
          const cls = dv == null ? "na" : dv >= 0.5 ? "de" : "ho";
          const glyph = dv == null ? "–" : dv >= 0.5 ? "✗" : "✓";
          return `<td class="fp-cell" data-id="${escapeHtml(x.id)}" data-dim="${escapeHtml(d.id)}"><span class="fp-chip ${cls}">${glyph}</span></td>`;
        })
        .join("");
      return `<tr><td class="fp-name">${providerLogoHtml(x.id, 14)}<span>${escapeHtml(familyLabel(x.id))}</span></td>${chips}</tr>`;
    })
    .join("");
  host.innerHTML =
    `<div class="dx-card"><div class="dx-scroll"><table class="fp-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>` +
    `<p class="dx-legend"><b class="dx-key ho">✓</b> stayed honest · <b class="dx-key de">✗</b> crossed the line under that motive · – not tested. ` +
    `Hover a chip for the reason it gave.</p></div>`;
  host.querySelectorAll(".fp-cell").forEach((td) => {
    const m = DATA.models[td.dataset.id];
    if (m) attachRichTooltip(td, () => dimTip(td.dataset.id, m, td.dataset.dim));
  });
}

// Tooltip for a condition column header: what the condition is and what pressure
// it varies.
function condTip(exp, cond) {
  const dims = (cond.dimensions || []).map((d) => DIM_NAME[d] || d);
  const varies = dims.length
    ? `<div class="rq-date">Varies: ${escapeHtml(dims.join(", "))}</div>`
    : `<div class="rq-date">Baseline — no added pressure</div>`;
  return (
    `<div class="rq-name">${escapeHtml(cond.label || cond.id)}</div>` +
    varies +
    `<div class="rq-id" style="margin-top:4px">${escapeHtml(exp.title)}</div>`
  );
}

// Tooltip for a single cell: the model's actual choice and reason for this exact
// condition — the real insight behind the number.
function cellTip(modelId, exp, cond, cc) {
  const dr = cc.deceptive_rate;
  const verdict = dr == null ? "no valid answer" : dr >= 0.5 ? "chose to deceive" : "stayed honest";
  const dims = (cond.dimensions || []).map((d) => DIM_NAME[d] || d).join(", ");
  const ex = cc.example;
  const choice = ex && ex.valid ? ex.choice : ex ? "invalid response" : "";
  const reason = ex && ex.reason ? ex.reason : "";
  return (
    `<div class="rq-head">${brandHeadHtml(modelId)}<div class="rq-headtext">` +
    `<div class="rq-name">${escapeHtml(familyLabel(modelId))}</div>` +
    `<div class="rq-id">${escapeHtml(cond.label || cond.id)}</div></div></div>` +
    `<div class="rq-rows">` +
    `<div class="rq-row rq-hi"><span class="rq-k">${escapeHtml(verdict)}</span><span class="rq-v">${pct(dr)}</span></div>` +
    (dims ? `<div class="rq-row"><span class="rq-k">Pressure</span><span class="rq-v">${escapeHtml(dims)}</span></div>` : "") +
    (choice ? `<div class="rq-row"><span class="rq-k">Chose</span><span class="rq-v">${escapeHtml(choice)}</span></div>` : "") +
    `</div>` +
    (reason ? `<div class="rq-date" style="margin-top:6px">“${escapeHtml(reason.slice(0, 160))}”</div>` : "")
  );
}

// Per-experiment heatmap: readable condition headers, cells tinted green→red by
// deception, every header and cell explaining itself on hover.
function renderExperiments(host, models) {
  const expById = {};
  host.innerHTML = (DATA.experiments || [])
    .map((exp) => {
      expById[exp.id] = exp;
      const conds = exp.conditions || [];
      const head =
        `<th>Model</th>` +
        conds
          .map((c, ci) => `<th class="dx-h" data-exp="${escapeHtml(exp.id)}" data-ci="${ci}">${escapeHtml(condShort(c))}</th>`)
          .join("") +
        `<th>Rate</th>`;
      const body = models
        .map((x) => {
          const be = (x.m.by_experiment || {})[exp.id];
          if (!be) return "";
          const cells = conds
            .map((c, ci) => {
              const cc = (be.conditions || {})[c.id] || {};
              const dr = cc.deceptive_rate;
              const cls = dr == null ? "muted" : dr >= 0.5 ? "de" : "ho";
              const glyph = dr == null ? "–" : dr >= 0.5 ? "✗" : "✓";
              const sub = (cc.valid || 0) > 1 ? `<span class="dx-sub">${cc.deceptive || 0}/${cc.valid}</span>` : "";
              return (
                `<td class="dx-cell ${cls}" data-exp="${escapeHtml(exp.id)}" data-ci="${ci}" data-model="${escapeHtml(x.id)}">` +
                `<span class="dx-mk">${glyph}</span>${sub}</td>`
              );
            })
            .join("");
          const oc = be.deceptive_rate;
          const ocls = oc == null ? "muted" : oc >= 0.5 ? "de" : "ho";
          return (
            `<tr><td class="dx-model">${providerLogoHtml(x.id, 14)}<span>${escapeHtml(familyLabel(x.id))}</span></td>` +
            cells +
            `<td class="${ocls}"><b>${pct(oc)}</b><span class="dx-sub">${be.deceptive || 0}/${be.valid || 0}</span></td></tr>`
          );
        })
        .join("");
      const about = exp.about ? `<p class="dx-about">${escapeHtml(exp.about)}</p>` : "";
      return (
        `<div class="dx-card"><div class="dx-head"><h3>${escapeHtml(exp.title)} ` +
        `<span class="dx-v">v${escapeHtml(String(exp.version))}</span></h3></div>${about}` +
        `<div class="dx-scroll"><table class="dx-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>` +
        `<p class="dx-legend"><b class="dx-key ho">✓</b> owned it · <b class="dx-key de">✗</b> hid the mistake · – no valid answer · ` +
        `<b>Rate</b> rolls those scenarios up. Hover any cell for the model's real choice and reason.</p></div>`
      );
    })
    .join("");
  host.querySelectorAll(".dx-h").forEach((th) => {
    const exp = expById[th.dataset.exp];
    const cond = exp.conditions[Number(th.dataset.ci)];
    attachRichTooltip(th, () => condTip(exp, cond));
  });
  host.querySelectorAll(".dx-cell").forEach((td) => {
    const exp = expById[td.dataset.exp];
    const cond = exp.conditions[Number(td.dataset.ci)];
    const be = (DATA.models[td.dataset.model].by_experiment || {})[exp.id];
    const cc = (be.conditions || {})[cond.id] || {};
    attachRichTooltip(td, () => cellTip(td.dataset.model, exp, cond, cc));
  });
}

// Deception over time: each model's overall rate against its release date,
// mirroring the Dark Triad timeline. Honest at the top, deceptive at the
// bottom, with a least-squares trend across whichever models carry a date.
function renderTimeline(host, models) {
  const NS = "http://www.w3.org/2000/svg";
  const dated = models
    .map((x) => ({ id: x.id, m: x.m, rel: x.m.released, r: x.rate }))
    .filter((x) => x.rel && x.r != null);
  if (dated.length < 2) {
    host.innerHTML = '<p class="empty">A release-date trend appears once at least two shown models have a recorded date.</p>';
    return;
  }
  const ms = (s) => Date.parse(s + "T00:00:00Z");
  const times = dated.map((x) => ms(x.rel));
  const tMin = Math.min(...times) - 30 * 864e5;
  const tMax = Math.max(...times) + 30 * 864e5;
  const yMax = Math.max(20, Math.ceil((Math.max(...dated.map((x) => x.r * 100)) + 8) / 10) * 10);
  const W = 900, H = 240, padL = 40, padR = 16, padT = 20, padB = 28;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const xFor = (v) => padL + ((v - tMin) / (tMax - tMin)) * plotW;
  const yFor = (v) => padT + (v / yMax) * plotH;
  const mk = (t, a = {}, txt) => {
    const n = document.createElementNS(NS, t);
    for (const k in a) n.setAttribute(k, a[k]);
    if (txt != null) n.textContent = txt;
    return n;
  };
  const svg = mk("svg", { viewBox: `0 0 ${W} ${H}`, class: "dt-svg", role: "img", "aria-label": "Deception rate over model release date" });
  const defs = mk("defs");
  const grad = mk("linearGradient", { id: "dt-grad", x1: "0", y1: "0", x2: "0", y2: "1" });
  grad.appendChild(mk("stop", { offset: "0%", "stop-color": "#2a9d8f", "stop-opacity": "0.16" }));
  grad.appendChild(mk("stop", { offset: "55%", "stop-color": "#e09f3e", "stop-opacity": "0.13" }));
  grad.appendChild(mk("stop", { offset: "100%", "stop-color": "#9e2a2b", "stop-opacity": "0.18" }));
  defs.appendChild(grad);
  svg.appendChild(defs);
  svg.appendChild(mk("rect", { x: padL, y: padT, width: plotW, height: plotH, fill: "url(#dt-grad)" }));
  for (let v = 0; v <= yMax; v += 20) {
    const y = yFor(v);
    svg.appendChild(mk("line", { x1: padL, y1: y, x2: W - padR, y2: y, stroke: "var(--border)", "stroke-width": 1 }));
    if (v > 0) svg.appendChild(mk("text", { x: padL - 6, y: y + 3, fill: "var(--muted)", "font-size": 9, "text-anchor": "end" }, v + "%"));
  }
  svg.appendChild(mk("text", { x: 2, y: padT + 4, fill: "var(--teal)", "font-size": 8.5, "font-weight": 600 }, "honest"));
  svg.appendChild(mk("text", { x: 2, y: padT + plotH, fill: "var(--danger)", "font-size": 8.5, "font-weight": 600 }, "deceptive"));
  for (let yr = new Date(tMin).getUTCFullYear(); yr <= new Date(tMax).getUTCFullYear(); yr++) {
    const tt = Date.UTC(yr, 0, 1);
    if (tt < tMin || tt > tMax) continue;
    const x = xFor(tt);
    svg.appendChild(mk("line", { x1: x, y1: padT, x2: x, y2: padT + plotH, stroke: "var(--border)", "stroke-width": 1 }));
    svg.appendChild(mk("text", { x, y: H - padB + 16, fill: "var(--muted)", "font-size": 9, "text-anchor": "middle" }, yr));
  }
  const pts = dated.map((x) => ({ x: ms(x.rel), y: x.r * 100 }));
  const n = pts.length;
  const sx = pts.reduce((a, p) => a + p.x, 0), sy = pts.reduce((a, p) => a + p.y, 0);
  const sxx = pts.reduce((a, p) => a + p.x * p.x, 0), sxy = pts.reduce((a, p) => a + p.x * p.y, 0);
  const den = n * sxx - sx * sx;
  if (den !== 0) {
    const slope = (n * sxy - sx * sy) / den, intc = (sy - slope * sx) / n;
    const clamp = (v) => Math.max(0, Math.min(yMax, v));
    svg.appendChild(mk("line", {
      x1: xFor(tMin), y1: yFor(clamp(intc + slope * tMin)),
      x2: xFor(tMax), y2: yFor(clamp(intc + slope * tMax)),
      stroke: "var(--muted)", "stroke-width": 1.5, "stroke-dasharray": "3 4", opacity: 0.6,
    }));
  }
  const byRate = [...dated].sort((a, b) => a.r - b.r);
  const saint = byRate[0].id, devil = byRate[byRate.length - 1].id;
  // Label de-collision: the deceptive tail is the ranking story, so it gets
  // first claim on scarce label space (plus the saint/devil). The honest
  // majority piles into a dot band near the top — itself the point — and
  // reveals names on hover. estW approximates a label's box to test overlap.
  const estW = (s) => s.length * 5.2 + 8;
  const placed = [];
  const showLabel = new Set();
  [...dated].sort((a, b) => b.r - a.r).forEach((x) => {
    const cx = xFor(ms(x.rel)), cy = yFor(x.r * 100), right = cx > W - 150;
    const txt = familyLabel(x.id);
    const x0 = right ? cx - 11 - estW(txt) : cx + 11;
    const box = { x0, x1: x0 + estW(txt), y0: cy - 6, y1: cy + 6 };
    const clash = placed.some((p) => !(box.x1 < p.x0 || box.x0 > p.x1 || box.y1 < p.y0 || box.y0 > p.y1));
    if (!clash || x.id === saint || x.id === devil) {
      placed.push(box);
      showLabel.add(x.id);
    }
  });
  dated.forEach((x) => {
    const cx = xFor(ms(x.rel)), cy = yFor(x.r * 100), right = cx > W - 150;
    const g = mk("g", { class: "dt-pt", tabindex: "0" });
    g.appendChild(mk("circle", { cx, cy, r: 11, fill: "transparent" }));
    if (x.id === saint) g.appendChild(mk("text", { x: cx, y: cy, "font-size": 16, "text-anchor": "middle", "dominant-baseline": "central" }, SAINT));
    else if (x.id === devil) g.appendChild(mk("text", { x: cx, y: cy, "font-size": 16, "text-anchor": "middle", "dominant-baseline": "central" }, VILLAIN));
    else g.appendChild(mk("circle", { cx, cy, r: 6, fill: colorFor(x.r), stroke: "#fff", "stroke-width": 1.5 }));
    if (showLabel.has(x.id)) {
      g.appendChild(mk("text", { x: right ? cx - 11 : cx + 11, y: cy + 3.2, fill: "var(--ink)", "font-size": 9.5, "text-anchor": right ? "end" : "start" }, familyLabel(x.id)));
    }
    g.setAttribute("aria-label", `${familyLabel(x.id)}: ${pct(x.r)} deception, released ${x.rel}`);
    attachRichTooltip(g, () => modelTip(x.id, x.m));
    svg.appendChild(g);
  });
  host.innerHTML = "";
  host.appendChild(svg);
}

async function loadData() {
  // Prefer the baked snapshot (static bundle); fall back to the live API.
  try {
    const res = await fetch("/deception.json", { cache: "no-cache" });
    if (res.ok) {
      const j = await res.json();
      if (j && j.models) return j;
    }
  } catch (e) {
    /* fall through to the API */
  }
  const base = window.API_BASE || "";
  const res = await fetch(base + "/api/experiments/rankings", { cache: "no-cache" });
  return res.json();
}

// Render every section for the currently-selected group.
function render() {
  const models = modelList();
  const scaleEl = document.getElementById("dscale-overall");
  if (scaleEl) renderScale(scaleEl, models);
  const boardEl = document.getElementById("dboard-overall");
  if (boardEl) renderBoard(boardEl, models);
  const timeEl = document.getElementById("dtime");
  if (timeEl) renderTimeline(timeEl, models);
  const expsEl = document.getElementById("dexps");
  if (expsEl) renderExperiments(expsEl, models);
  const dimsEl = document.getElementById("ddims");
  if (dimsEl) renderDimensions(dimsEl, models);
}

// Build the curated group chips from whichever models actually have results.
// Defaults to the Humanity's Last Exam lineup when present (matching the
// personality rankings), else shows all models.
function buildFilter() {
  const filterEl = document.getElementById("dfilter");
  if (!filterEl) return;
  const allIds = Object.entries(DATA.models || {})
    .filter(([, m]) => (m.overall || {}).deceptive_rate != null)
    .map(([id]) => id);
  GROUPS = groupsForModels(allIds);
  if (!GROUPS.length) {
    filterEl.hidden = true;
    return;
  }
  selectedGroup = GROUPS.some((g) => g.id === "hle") ? "hle" : "all";
  const chips = [{ id: "all", label: "All models", count: allIds.length }].concat(
    GROUPS.map((g) => ({ id: g.id, label: g.label, count: g.modelIds.length }))
  );
  const paint = () =>
    filterEl.querySelectorAll("button[data-group]").forEach((b) =>
      b.classList.toggle("active", b.getAttribute("data-group") === selectedGroup));
  filterEl.innerHTML =
    '<span class="rk-filter-label">Show</span>' +
    chips
      .map(
        (c) =>
          `<button type="button" class="rk-chip" data-group="${c.id}">` +
          `${escapeHtml(c.label)} <span class="rk-chip-n">${c.count}</span></button>`
      )
      .join("");
  filterEl.querySelectorAll("button[data-group]").forEach((b) =>
    b.addEventListener("click", () => {
      selectedGroup = b.getAttribute("data-group");
      paint();
      render();
    }));
  filterEl.hidden = false;
  paint();
}

function buildOrderControl() {
  const orderEl = document.getElementById("ranking-order");
  if (!orderEl) return;
  const paint = () => orderEl.querySelectorAll("button[data-order]").forEach((button) =>
    button.setAttribute("aria-pressed", String(button.dataset.order === rankingOrder)));
  orderEl.querySelectorAll("button[data-order]").forEach((button) =>
    button.addEventListener("click", () => {
      rankingOrder = button.dataset.order === "worst" ? "worst" : "best";
      persistRankingOrder(rankingOrder);
      paint();
      render();
    }));
  paint();
}

async function main() {
  const scaleEl = document.getElementById("dscale-overall");
  try {
    DATA = await loadData();
  } catch (e) {
    if (scaleEl) scaleEl.innerHTML = `<p class="empty">Could not load results: ${escapeHtml(e.message)}</p>`;
    return;
  }
  const updated = DATA.updated_at ? new Date(DATA.updated_at) : null;
  const upEl = document.getElementById("d-updated");
  if (upEl && updated) upEl.textContent = `Updated ${updated.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}`;
  buildFilter();
  buildOrderControl();
  render();
}

main();
