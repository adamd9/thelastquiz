/* The Last Quiz — public rankings page.
 * Dependency-free: fetches /api/rankings and renders SVG radar charts plus
 * plain-English explanations of each test. Styled to match the main app
 * (warm palette, shared design tokens via /static/styles.css). */

// On-brand palette that reads well on the app's cream panels.
const PALETTE = [
  "#da5f35", "#0f5c78", "#b5179e", "#2a9d8f", "#e09f3e",
  "#6d597a", "#386641", "#9e2a2b", "#3a7ca5", "#8a5a44",
];

// Approximate general-population averages, normalized to the 0-100 scale the
// radars use ((mean - 1) / 4 * 100 for a 1-5 item scale), shown as a dashed
// "Human average" baseline. Especially important for the Dark Triad, where a
// raw model score is meaningless without a human reference point.
const POPULATION_NORMS = {
  sd3_short_dark_triad: {
    label: "Human average (typical adult)",
    source: "general-population means (N=1,518), Kaufman et al. 2019 (SD-3)",
    note:
      "For scale, the dashed line is the typical-adult average: about 46/100 on " +
      "Machiavellianism, 38/100 on Narcissism and 29/100 on Psychopathy (every score " +
      "here is normalised to 0-100). A model well above the line is unusually dark; " +
      "below it is unusually benign.",
    values: { MACH: 46, NARC: 38, PSYCH: 29 },
  },
};

// Decoder for the four-letter Jungian/MBTI-style type codes, so each model's
// result (e.g. INTJ) can be spelled out in plain English rather than left as
// opaque letters.
const MBTI_LETTERS = {
  E: "Extraversion", I: "Introversion",
  S: "Sensing", N: "Intuition",
  T: "Thinking", F: "Feeling",
  J: "Judging", P: "Perceiving",
};

const SVGNS = "http://www.w3.org/2000/svg";

function el(tag, attrs = {}, children = []) {
  const node = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  for (const c of children) node.appendChild(c);
  return node;
}

function polarToXY(cx, cy, radius, angle) {
  return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
}

/* Draw a radar chart. axes: [label,...]; series: [{name,color,values:[0..100]}]. */
function drawRadar(axes, series) {
  const width = 460;
  const height = 360;
  const cx = width / 2;
  const cy = height / 2;
  const R = 104;
  const rings = 4;
  const svg = el("svg", { viewBox: `0 0 ${width} ${height}`, role: "img" });
  const n = axes.length;
  const angleFor = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / n;

  for (let r = 1; r <= rings; r++) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const [x, y] = polarToXY(cx, cy, (R * r) / rings, angleFor(i));
      pts.push(`${x},${y}`);
    }
    svg.appendChild(el("polygon", { class: "ring", points: pts.join(" ") }));
  }

  for (let i = 0; i < n; i++) {
    const [x, y] = polarToXY(cx, cy, R, angleFor(i));
    svg.appendChild(el("line", { class: "spoke", x1: cx, y1: cy, x2: x, y2: y }));
    const [lx, ly] = polarToXY(cx, cy, R + 16, angleFor(i));
    const anchor = Math.abs(lx - cx) < 6 ? "middle" : lx > cx ? "start" : "end";
    const label = el("text", { class: "axis-label", x: lx, y: ly + 3, "text-anchor": anchor });
    label.textContent = axes[i];
    svg.appendChild(label);
  }

  series.forEach((s, si) => {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const v = Math.max(0, Math.min(100, s.values[i] ?? 0));
      const [x, y] = polarToXY(cx, cy, (R * v) / 100, angleFor(i));
      pts.push(`${x},${y}`);
    }
    const attrs = {
      class: s.baseline ? "series baseline" : "series", "data-series": si,
      points: pts.join(" "), fill: s.color, "fill-opacity": s.baseline ? "0.06" : "0.16",
      stroke: s.color, "stroke-width": "2", "stroke-linejoin": "round",
    };
    if (s.dash) attrs["stroke-dasharray"] = "5 4";
    const poly = el("polygon", attrs);
    if (s.title) {
      const t = el("title");
      t.textContent = s.title;
      poly.appendChild(t);
    }
    svg.appendChild(poly);
  });
  return svg;
}

function card(title, tag, bodyNodes) {
  const c = document.createElement("div");
  c.className = "card";
  const h = document.createElement("h2");
  h.textContent = title;
  const t = document.createElement("div");
  t.className = "tag";
  t.textContent = tag;
  c.appendChild(h);
  c.appendChild(t);
  for (const b of bodyNodes) c.appendChild(b);
  return c;
}

/* Spell out the four-letter type each model got (e.g. INTJ -> Introversion,
   Intuition, Thinking, Judging) so the per-model result is clear on its own,
   separate from the general test explanation lower down the page. */
function buildTypeBreakdown(series) {
  const wrap = document.createElement("div");
  wrap.className = "typebreak";
  const head = document.createElement("div");
  head.className = "typebreak-h";
  head.textContent = "What each model's type means";
  wrap.appendChild(head);
  for (const s of series) {
    if (s.baseline || !s.result) continue;
    const decoded = [...s.result].map((l) => MBTI_LETTERS[l]).filter(Boolean).join(" · ");
    const row = document.createElement("div");
    row.className = "typebreak-row";
    const model = document.createElement("span");
    model.className = "tb-model";
    model.textContent = s.name;
    const code = document.createElement("b");
    code.className = "tb-code";
    code.textContent = s.result;
    const words = document.createElement("span");
    words.className = "tb-words";
    words.textContent = decoded;
    row.appendChild(model);
    row.appendChild(code);
    row.appendChild(words);
    wrap.appendChild(row);
  }
  return wrap;
}

/* Per-chart legend: one model per line, colour swatch + one-glance result,
   hover-linked to the matching shape on the radar. */
function buildChartLegend(series) {
  const ul = document.createElement("ul");
  ul.className = "rk-clegend";
  series.forEach((s, si) => {
    const li = document.createElement("li");
    li.dataset.series = String(si);
    if (s.baseline) li.classList.add("baseline");
    if (s.title) li.title = s.title;
    const sw = document.createElement("span");
    sw.className = "sw";
    sw.style.background = s.color;
    const nm = document.createElement("span");
    nm.className = "nm";
    nm.textContent = s.name;
    li.appendChild(sw);
    li.appendChild(nm);
    if (s.result) {
      const res = document.createElement("span");
      res.className = "res";
      res.textContent = s.result;
      li.appendChild(res);
    }
    ul.appendChild(li);
  });
  return ul;
}

/* Hover a shape or a legend row to highlight that model across the chart. */
function wireHighlight(cardEl) {
  const polys = [...cardEl.querySelectorAll("polygon.series")];
  const rows = [...cardEl.querySelectorAll("li[data-series]")];
  const apply = (idx) => {
    for (const p of polys) {
      const me = Number(p.dataset.series);
      const isBaseline = p.classList.contains("baseline");
      const baseFill = isBaseline ? "0.06" : "0.16";
      if (me === idx) {
        p.setAttribute("fill-opacity", isBaseline ? "0.18" : "0.34");
        p.setAttribute("stroke-opacity", "1");
        p.setAttribute("stroke-width", "3");
      } else if (idx == null || isBaseline) {
        // Keep the human-average reference visible even while dimming others.
        p.setAttribute("fill-opacity", baseFill);
        p.setAttribute("stroke-opacity", isBaseline ? "0.8" : "1");
        p.setAttribute("stroke-width", "2");
      } else {
        p.setAttribute("fill-opacity", "0.04");
        p.setAttribute("stroke-opacity", "0.22");
        p.setAttribute("stroke-width", "2");
      }
    }
    for (const r of rows) {
      r.classList.toggle("active", idx != null && Number(r.dataset.series) === idx);
    }
  };
  for (const p of polys) {
    p.addEventListener("mouseenter", () => apply(Number(p.dataset.series)));
    p.addEventListener("mouseleave", () => apply(null));
  }
  for (const r of rows) {
    r.addEventListener("mouseenter", () => apply(Number(r.dataset.series)));
    r.addEventListener("mouseleave", () => apply(null));
  }
}

/* Radar series for a benchmark: values, a hover tooltip that spells out every
   dimension (so a code like INTJ is explained), and a one-glance result. */
function seriesForBench(bench, colorFor) {
  const dims = bench.dimensions;
  return bench.models.map((m) => {
    const parts = dims.map((d) => {
      const v = Math.round(m.profile[d.id] ?? 0);
      if (d.poles) return `${d.name}: ${v >= 50 ? d.poles.high : d.poles.low} (${v})`;
      return `${d.name} ${v}`;
    });
    let result = m.type_code || "";
    if (!result) {
      let best = dims[0];
      let bestV = -Infinity;
      for (const d of dims) {
        const v = m.profile[d.id] ?? 0;
        if (v > bestV) { bestV = v; best = d; }
      }
      result = best ? `${best.name} ${Math.round(bestV)}` : "";
    }
    return {
      name: m.model_id,
      color: colorFor(m.model_id),
      values: dims.map((d) => m.profile[d.id] ?? 0),
      result,
      title: `${m.model_id} — ${parts.join(" · ")}`,
    };
  });
}

/* A dashed grey "Human average" baseline from published population norms. */
function buildNormSeries(bench, norm) {
  const parts = bench.dimensions.map((d) => `${d.name} ${Math.round(norm.values[d.id] ?? 0)}`);
  return {
    name: norm.label,
    color: "#8a8a8a",
    baseline: true,
    dash: true,
    result: "reference",
    values: bench.dimensions.map((d) => norm.values[d.id] ?? 0),
    title: `${norm.label} — ${norm.source} — ${parts.join(" · ")}`,
  };
}

function benchmarkCard(bench, colorFor) {
  const axes = bench.dimensions.map((d) => (d.poles ? `${d.poles.low}\u2013${d.poles.high}` : d.name));
  const series = seriesForBench(bench, colorFor);
  const norm = POPULATION_NORMS[bench.id];
  if (norm) series.unshift(buildNormSeries(bench, norm));
  const body = [drawRadar(axes, series), buildChartLegend(series)];
  // Type tests (four-letter codes) get an explicit, decoded breakdown so the
  // result each model gets is spelled out, distinct from the general glossary.
  if (bench.dimensions.some((d) => d.poles)) body.push(buildTypeBreakdown(series));
  const c = card(
    bench.title,
    `${bench.dimensions.length} dimensions · v${bench.version}`,
    body,
  );
  wireHighlight(c);
  return c;
}

/* One benchmark's plain-English explanation card (used under every view). */
function explanationCard(b) {
  const c = document.createElement("div");
  c.className = "card";
  const isType = b.kind === "bipolar";
  const kind = isType ? "Type test" : "Trait test";
  const readNote = isType
    ? "How to read it: each model leans to one side of every axis, and the four sides combine into a four-letter type (e.g. INTJ). Each model's own type is spelled out on its chart above."
    : "How to read it: each trait is scored 0\u2013100 on its own \u2014 there's no single label or code, just a profile across the dimensions.";
  let html =
    `<h2>${b.title}</h2>` +
    `<div class="tag">${kind}${b.question_count ? " \u00b7 " + b.question_count + " items" : ""}</div>` +
    (b.about ? `<p>${b.about}</p>` : "") +
    `<p class="read-note">${readNote}</p>` +
    (POPULATION_NORMS[b.id] ? `<p class="norm-note">${POPULATION_NORMS[b.id].note}</p>` : "");
  if (b.dimensions && b.dimensions.length) {
    html += '<div class="gloss">';
    for (const d of b.dimensions) {
      const term = d.poles ? `${d.name} (${d.poles.high}/${d.poles.low})` : d.name;
      html += `<div class="row"><span class="term">${term}</span>` +
        (d.description ? ` \u2014 <span class="desc">${d.description}</span>` : "") + "</div>";
    }
    html += "</div>";
  }
  if (b.reference && b.reference.url) {
    const title = (b.reference.publication || "Reference").replace(/"/g, "&quot;");
    html += `<a class="ref" href="${b.reference.url}" target="_blank" rel="noopener" title="${title}">Official reference \u2197</a>`;
  }
  c.innerHTML = html;
  return c;
}

/* Cross-benchmark answer-stability radar (reliability, not a trait). */
function stabilityCard(data, colorFor) {
  const stab = data.stability;
  if (!stab || !stab.models || !stab.models.length) return null;
  const shortAxes = stab.axes.map((t) => t.split(" (")[0].trim());
  const series = stab.models.map((m) => ({
    name: m.model_id,
    color: colorFor(m.model_id),
    values: m.values.map((v) => (v == null ? 0 : v)),
    result: (() => {
      const vals = m.values.filter((v) => v != null);
      return vals.length ? `avg ${Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)}` : "\u2014";
    })(),
    title: `${m.model_id} \u2014 ` + stab.axes
      .map((a, i) => `${a.split(" (")[0].trim()}: ${m.values[i] == null ? "\u2014" : Math.round(m.values[i])}`)
      .join(" \u00b7 "),
  }));
  const sc = card("Answer stability", "consistency across repeats (0 = single run)", [drawRadar(shortAxes, series), buildChartLegend(series)]);
  wireHighlight(sc);
  return sc;
}

/* ------------------------- Dark Triad (home) view ------------------------- */
const SD3_ID = "sd3_short_dark_triad";
const SD3_TRAITS = [
  { id: "MACH", name: "Machiavellianism", blurb: "strategic manipulation", color: "#6a4c93" },
  { id: "NARC", name: "Narcissism", blurb: "grandiosity & entitlement", color: "#b5179e" },
  { id: "PSYCH", name: "Psychopathy", blurb: "callousness, low empathy", color: "#9e2a2b" },
];
function shortName(id) { return id.split("/").pop() || id; }

/* Three per-trait leaderboards: most restrained on top, the human ranked in. */
function darkTriadLeaderboard(sd3, human) {
  const wrap = document.createElement("div");
  wrap.className = "dt-lanes";
  for (const t of SD3_TRAITS) {
    const lane = document.createElement("div");
    lane.className = "dt-lane";
    const humanVal = human[t.id] ?? 0;
    lane.innerHTML = `<h3>${t.name}</h3><p class="sub">${t.blurb} \u00b7 human avg ${Math.round(humanVal)}</p>`;
    const entries = [
      ...sd3.models.map((m) => ({ name: shortName(m.model_id), v: m.profile[t.id] ?? 0 })),
      { name: "Typical adult (human)", v: humanVal, human: true },
    ].sort((a, b) => a.v - b.v);
    let rank = 0;
    for (const e of entries) {
      if (!e.human) rank++;
      const above = !e.human && e.v > humanVal;
      const row = document.createElement("div");
      row.className = "dt-row" + (above ? " above" : "") + (e.human ? " humanrow" : "");
      const w = Math.max(0, Math.min(100, e.v));
      row.innerHTML =
        `<div class="rank">${e.human ? "\uD83E\uDDD1" : rank}</div>` +
        `<div><div class="who"><span class="mname">${e.name}</span>` +
        `<span class="val">${Math.round(e.v)}${above ? ' <span class="up">darker</span>' : ""}</span></div>` +
        `<div class="dt-track"><div class="zone" style="left:${humanVal}%"></div>` +
        `<div class="bar${e.human ? " humbar" : ""}" style="width:${w}%;${e.human ? "" : "background:" + t.color}"></div>` +
        `</div></div>`;
      lane.appendChild(row);
    }
    wrap.appendChild(lane);
  }
  return wrap;
}

/* Stacked HLE-style time charts (release date vs score); axis flipped so up = restrained. */
function darkTriadTimeline(sd3, human, colorFor) {
  const NS = "http://www.w3.org/2000/svg";
  const wrap = document.createElement("div");
  wrap.className = "dt-time";
  const dated = sd3.models.filter((m) => m.released);
  if (dated.length < 2) {
    const note = document.createElement("p");
    note.className = "dt-note";
    note.textContent = "Release-date trends appear here once at least two models have a recorded release date (captured automatically on each run).";
    wrap.appendChild(note);
    return wrap;
  }
  const ms = (s) => Date.parse(s + "T00:00:00Z");
  const times = dated.map((m) => ms(m.released));
  const tMin = Math.min(...times) - 30 * 864e5;
  const tMax = Math.max(...times) + 30 * 864e5;
  const allVals = [];
  for (const t of SD3_TRAITS) { for (const m of sd3.models) allVals.push(m.profile[t.id] ?? 0); allVals.push(human[t.id] ?? 0); }
  const yMax = Math.min(100, Math.max(20, Math.ceil((Math.max(...allVals) + 8) / 10) * 10));
  const mk = (tag, attrs = {}, txt) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); if (txt != null) n.textContent = txt; return n; };
  const yearMarks = () => {
    const marks = [];
    for (let y = new Date(tMin).getUTCFullYear(); y <= new Date(tMax).getUTCFullYear(); y++) marks.push([Date.UTC(y, 0, 1), String(y)]);
    return marks;
  };
  for (const t of SD3_TRAITS) {
    const W = 900, H = 210, padL = 42, padR = 16, padT = 22, padB = 26;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const xFor = (v) => padL + ((v - tMin) / (tMax - tMin)) * plotW;
    const yFor = (v) => padT + (v / yMax) * plotH; // flipped: low (restrained) at top
    const svg = mk("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": t.name + " over time" });
    svg.appendChild(mk("text", { x: padL, y: 14, fill: "var(--ink)", "font-size": 13, "font-weight": 600 }, t.name));
    const humanVal = human[t.id] ?? 0;
    const humY = yFor(humanVal);
    svg.appendChild(mk("rect", { x: padL, y: humY, width: plotW, height: padT + plotH - humY, fill: "rgba(158,42,43,0.10)" }));
    svg.appendChild(mk("rect", { x: padL, y: padT, width: plotW, height: humY - padT, fill: "rgba(15,92,120,0.07)" }));
    for (const v of [0, 20, 40, 60, 80].filter((x) => x <= yMax)) {
      const y = yFor(v);
      svg.appendChild(mk("line", { x1: padL, y1: y, x2: W - padR, y2: y, stroke: "#eee2d3", "stroke-width": 1 }));
      svg.appendChild(mk("text", { x: padL - 6, y: y + 3, fill: "var(--muted)", "font-size": 9, "text-anchor": "end" }, v));
    }
    svg.appendChild(mk("text", { x: 10, y: padT + 4, fill: "var(--accent-2)", "font-size": 8.5, "font-weight": 600 }, "calm"));
    svg.appendChild(mk("text", { x: 10, y: padT + plotH, fill: "#9e2a2b", "font-size": 8.5, "font-weight": 600 }, "dark"));
    for (const [tt, lab] of yearMarks()) {
      if (tt < tMin || tt > tMax) continue;
      const x = xFor(tt);
      svg.appendChild(mk("line", { x1: x, y1: padT, x2: x, y2: padT + plotH, stroke: "#efe6da", "stroke-width": 1 }));
      svg.appendChild(mk("text", { x, y: H - padB + 16, fill: "var(--muted)", "font-size": 9, "text-anchor": "middle" }, lab));
    }
    svg.appendChild(mk("line", { x1: padL, y1: humY, x2: W - padR, y2: humY, stroke: "var(--ink)", "stroke-width": 1.5, "stroke-dasharray": "5 4" }));
    svg.appendChild(mk("text", { x: W - padR, y: humY - 4, fill: "var(--ink)", "font-size": 9, "font-weight": 600, "text-anchor": "end" }, "human average (" + Math.round(humanVal) + ")"));
    const pts = dated.map((m) => ({ x: ms(m.released), y: m.profile[t.id] ?? 0 }));
    const n = pts.length, sx = pts.reduce((a, p) => a + p.x, 0), sy = pts.reduce((a, p) => a + p.y, 0);
    const sxx = pts.reduce((a, p) => a + p.x * p.x, 0), sxy = pts.reduce((a, p) => a + p.x * p.y, 0);
    const denom = n * sxx - sx * sx;
    if (denom !== 0) {
      const slope = (n * sxy - sx * sy) / denom, intc = (sy - slope * sx) / n;
      const ln = (xr) => intc + slope * xr;
      svg.appendChild(mk("line", { x1: xFor(tMin), y1: yFor(ln(tMin)), x2: xFor(tMax), y2: yFor(ln(tMax)), stroke: "var(--muted)", "stroke-width": 1.5, "stroke-dasharray": "3 4", opacity: 0.65 }));
    }
    for (const m of dated) {
      const cx = xFor(ms(m.released)), cy = yFor(m.profile[t.id] ?? 0);
      const rightEdge = cx > W - 130;
      const g = mk("g");
      g.appendChild(mk("circle", { cx, cy, r: 6, fill: colorFor(m.model_id), "fill-opacity": 0.92, stroke: "#fff", "stroke-width": 1.5 }));
      svg.appendChild(mk("text", { x: rightEdge ? cx - 10 : cx + 10, y: cy + 3.2, fill: "var(--ink)", "font-size": 9.5, "text-anchor": rightEdge ? "end" : "start" }, shortName(m.model_id)));
      g.appendChild(mk("title", {}, `${m.model_id} \u2014 ${t.name}: ${Math.round(m.profile[t.id] ?? 0)} \u00b7 released ${m.released}`));
      svg.appendChild(g);
    }
    wrap.appendChild(svg);
  }
  return wrap;
}

/* Combined "Dark Index" leaderboard: the mean of the three traits (the Dark
   Triad total), with the typical adult ranked in. Least dark on top. */
function darkIndexLeaderboard(sd3, human) {
  const wrap = document.createElement("div");
  wrap.className = "dt-index";
  const idxOf = (profile) => SD3_TRAITS.reduce((s, t) => s + (profile[t.id] ?? 0), 0) / SD3_TRAITS.length;
  const humanIdx = idxOf(human);
  const entries = [
    ...sd3.models.map((m) => ({ name: shortName(m.model_id), v: idxOf(m.profile) })),
    { name: "Typical adult (human)", v: humanIdx, human: true },
  ].sort((a, b) => a.v - b.v);
  let rank = 0;
  for (const e of entries) {
    if (!e.human) rank++;
    const above = !e.human && e.v > humanIdx;
    const row = document.createElement("div");
    row.className = "dt-row" + (above ? " above" : "") + (e.human ? " humanrow" : "");
    const w = Math.max(0, Math.min(100, e.v));
    row.innerHTML =
      `<div class="rank">${e.human ? "\uD83E\uDDD1" : rank}</div>` +
      `<div><div class="who"><span class="mname">${e.name}</span>` +
      `<span class="val">${Math.round(e.v)}${above ? ' <span class="up">darker</span>' : ""}</span></div>` +
      `<div class="dt-track"><div class="zone" style="left:${humanIdx}%"></div>` +
      `<div class="bar${e.human ? " humbar" : ""}" style="width:${w}%;${e.human ? "" : "background:#6a4c93"}"></div>` +
      `</div></div>`;
    wrap.appendChild(row);
  }
  return wrap;
}

function renderDarkTriad(content, data, colorFor) {
  const sd3 = (data.benchmarks || []).find((b) => b.id === SD3_ID);
  const human = (POPULATION_NORMS[SD3_ID] || {}).values || {};
  const intro = document.createElement("p");
  intro.className = "dt-intro";
  intro.innerHTML =
    "The <b>Short Dark Triad</b> measures three socially aversive traits. We score each model like a human respondent and rank it against the <b>typical adult</b> \u2014 the models you want are the ones sitting <b>below</b> the human line.";
  content.appendChild(intro);
  if (!sd3 || !sd3.models || !sd3.models.length) {
    const note = document.createElement("div");
    note.className = "empty";
    note.innerHTML = "No Dark Triad runs yet \u2014 an admin can run the benchmark from the " +
      '<a href="' + (window.__destUrl ? window.__destUrl("admin") : "/admin") + '">admin console</a>.';
    content.appendChild(note);
    return;
  }
  const h2i = document.createElement("h2"); h2i.className = "section"; h2i.textContent = "Overall \u2014 the Dark Triad Index";
  content.appendChild(h2i);
  const humanIdx = Math.round(SD3_TRAITS.reduce((s, t) => s + (human[t.id] ?? 0), 0) / SD3_TRAITS.length);
  const idxNote = document.createElement("p"); idxNote.className = "dt-note";
  idxNote.innerHTML = "A single \u201cdark core\u201d score \u2014 the mean of all three traits, the way the Dark Triad total is treated in the literature (Kaufman, 2019). Lower is more restrained; the typical adult lands around " + humanIdx + ".";
  content.appendChild(idxNote);
  content.appendChild(darkIndexLeaderboard(sd3, human));
  const h2a = document.createElement("h2"); h2a.className = "section"; h2a.textContent = "By trait \u2014 least dark on top";
  content.appendChild(h2a);
  content.appendChild(darkTriadLeaderboard(sd3, human));
  const h2b = document.createElement("h2"); h2b.className = "section"; h2b.textContent = "Over time \u2014 by model release date";
  content.appendChild(h2b);
  content.appendChild(darkTriadTimeline(sd3, human, colorFor));
  content.appendChild(explanationCard(sd3));
  const sc = stabilityCard(data, colorFor);
  if (sc) content.appendChild(sc);
}

function renderSecondary(content, data, colorFor, benchId) {
  const bench = (data.benchmarks || []).find((b) => b.id === benchId);
  if (!bench || !bench.models || !bench.models.length) {
    const note = document.createElement("div");
    note.className = "empty";
    note.textContent = "No runs yet for this test.";
    content.appendChild(note);
    return;
  }
  document.getElementById("legend").innerHTML =
    '<span class="rk-hint">Hover any model to highlight its shape and see its scores.</span>';
  const grid = document.createElement("div");
  grid.className = "grid";
  grid.appendChild(benchmarkCard(bench, colorFor));
  content.appendChild(grid);
  content.appendChild(explanationCard(bench));
}

const VIEWS = [
  { id: "dark-triad", label: "Dark Triad", bench: SD3_ID },
  { id: "big-five", label: "Big Five", bench: "big_five_ipip50" },
  { id: "type", label: "Jungian Type", bench: "mbti_oejts" },
];

// Load rankings preferring the CDN-served snapshot baked in at deploy time, so
// the public page loads with no backend call. Fall back to the live API when
// the snapshot is absent (local dev, or a build that couldn't reach the API).
async function loadRankings() {
  try {
    const r = await fetch("/rankings.json");
    if (r.ok && (r.headers.get("content-type") || "").includes("json")) {
      return await r.json();
    }
  } catch (_) {
    /* fall through to the live API */
  }
  return (await fetch((window.API_BASE || "") + "/api/rankings")).json();
}

async function main() {
  let data;
  try {
    data = await loadRankings();
  } catch (e) {
    document.getElementById("content").innerHTML =
      '<div class="empty">Could not load rankings.</div>';
    return;
  }

  document.getElementById("footer").innerHTML =
    "Instruments: Big Five via the public-domain IPIP-50; an open OEJTS-inspired Jungian type test; " +
    "and the Short Dark Triad (Jones &amp; Paulhus, 2014), reproduced for research. " +
    "Models answer each item as a self-report; scores are computed deterministically. " +
    "For entertainment and research — not a clinical assessment of anything.";

  const models = data.models || [];
  const colorMap = new Map(models.map((m, i) => [m, PALETTE[i % PALETTE.length]]));
  const colorFor = (m) => colorMap.get(m) || "#888";

  if (data.updated_at) {
    document.getElementById("updated").textContent =
      "Last updated " + new Date(data.updated_at).toLocaleString();
  }

  // Build the header nav: test views first, then the cross-subdomain links.
  const nav = document.querySelector(".rk-nav");
  if (nav) {
    nav.innerHTML =
      VIEWS.map((v) => `<a href="#${v.id}" data-view="${v.id}">${v.label}</a>`).join("") +
      '<a href="/" data-dest="app">Make your own</a>' +
      '<a href="/admin" data-dest="admin">Admin</a>';
    if (window.__destUrl) {
      nav.querySelectorAll("a[data-dest]").forEach((a) =>
        a.setAttribute("href", window.__destUrl(a.getAttribute("data-dest"))));
    }
  }

  const currentView = () => {
    const h = (location.hash || "").replace("#", "");
    return VIEWS.some((v) => v.id === h) ? h : "dark-triad";
  };
  const render = () => {
    const view = currentView();
    if (nav) nav.querySelectorAll("a[data-view]").forEach((a) =>
      a.classList.toggle("active", a.getAttribute("data-view") === view));
    const content = document.getElementById("content");
    content.innerHTML = "";
    document.getElementById("legend").innerHTML = "";
    if (view === "dark-triad") {
      renderDarkTriad(content, data, colorFor);
    } else {
      renderSecondary(content, data, colorFor, VIEWS.find((v) => v.id === view).bench);
    }
    window.scrollTo(0, 0);
  };
  window.addEventListener("hashchange", render);
  render();
}

main();
