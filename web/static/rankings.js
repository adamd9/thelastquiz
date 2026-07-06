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
    source: "approx. general-population means, Jones & Paulhus 2014",
    note:
      "For scale, the dashed line is the typical-adult average: about 53/100 on " +
      "Machiavellianism, 45/100 on Narcissism and 30/100 on Psychopathy (every score " +
      "here is normalised to 0-100). A model well above the line is unusually dark; " +
      "below it is unusually benign.",
    values: { MACH: 53, NARC: 45, PSYCH: 30 },
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

/* Plain-English explanations of every test, driven by the benchmark metadata. */
function renderExplanations(benchmarks) {
  const content = document.getElementById("content");
  const section = document.createElement("section");
  section.className = "explain";
  section.innerHTML =
    '<h2 class="section">Understanding the tests</h2>' +
    '<p class="sub">What each benchmark measures — and what a high score on each dimension means.</p>';
  const grid = document.createElement("div");
  grid.className = "explain-grid";

  for (const b of benchmarks) {
    const c = document.createElement("div");
    c.className = "card";
    const isType = b.kind === "bipolar";
    const kind = isType ? "Type test" : "Trait test";
    const readNote = isType
      ? "How to read it: each model leans to one side of every axis, and the four sides combine into a four-letter type (e.g. INTJ). Each model's own type is spelled out on its chart above."
      : "How to read it: each trait is scored 0–100 on its own — there's no single label or code, just a profile across the dimensions.";
    let html =
      `<h2>${b.title}</h2>` +
      `<div class="tag">${kind}${b.question_count ? " · " + b.question_count + " items" : ""}</div>` +
      (b.about ? `<p>${b.about}</p>` : "") +
      `<p class="read-note">${readNote}</p>` +
      (POPULATION_NORMS[b.id] ? `<p class="norm-note">${POPULATION_NORMS[b.id].note}</p>` : "");
    if (b.dimensions && b.dimensions.length) {
      html += '<div class="gloss">';
      for (const d of b.dimensions) {
        const term = d.poles ? `${d.name} (${d.poles.high}/${d.poles.low})` : d.name;
        html += `<div class="row"><span class="term">${term}</span>` +
          (d.description ? ` — <span class="desc">${d.description}</span>` : "") + "</div>";
      }
      html += "</div>";
    }
    if (b.reference && b.reference.url) {
      const title = (b.reference.publication || "Reference").replace(/"/g, "&quot;");
      html += `<a class="ref" href="${b.reference.url}" target="_blank" rel="noopener" title="${title}">Official reference \u2197</a>`;
    }
    c.innerHTML = html;
    grid.appendChild(c);
  }

  // Fourth radar isn't a personality test — explain what stability means.
  const stab = document.createElement("div");
  stab.className = "card";
  stab.innerHTML =
    '<h2>Answer stability</h2>' +
    '<div class="tag">Reliability check · not a personality test</div>' +
    "<p>How consistently a model gives the same answers when a test is repeated. It's a reliability " +
    "signal rather than a trait: higher means the model's responses are stable rather than random. " +
    "(Shown as 0 when a test has only been run once.)</p>";
  grid.appendChild(stab);

  section.appendChild(grid);
  content.appendChild(section);
}

async function main() {
  let data;
  try {
    data = await (await fetch((window.API_BASE || "") + "/api/rankings")).json();
  } catch (e) {
    document.getElementById("content").innerHTML =
      '<div class="empty">Could not load rankings.</div>';
    return;
  }

  const content = document.getElementById("content");
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

  if (!models.length) {
    const note = document.createElement("div");
    note.className = "empty";
    note.innerHTML =
      'No benchmark runs yet — an admin can run the benchmarks from the ' +
      '<a href="' + (window.__destUrl ? window.__destUrl("admin") : "/admin") + '">admin console</a>. The tests are explained below.';
    content.appendChild(note);
  } else {
    document.getElementById("legend").innerHTML =
      '<span class="rk-hint">Hover any model to highlight its shape and see its scores.</span>';
    const grid = document.createElement("div");
    grid.className = "grid";
    for (const bench of data.benchmarks) {
      if (!bench.models.length) continue;
      grid.appendChild(benchmarkCard(bench, colorFor));
    }
    const stab = data.stability;
    if (stab && stab.models && stab.models.length) {
      const shortAxes = stab.axes.map((t) => t.split(" (")[0].trim());
      const series = stab.models.map((m) => ({
        name: m.model_id,
        color: colorFor(m.model_id),
        values: m.values.map((v) => (v == null ? 0 : v)),
        result: (() => {
          const vals = m.values.filter((v) => v != null);
          return vals.length ? `avg ${Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)}` : "—";
        })(),
        title: `${m.model_id} — ` + stab.axes
          .map((a, i) => `${a.split(" (")[0].trim()}: ${m.values[i] == null ? "—" : Math.round(m.values[i])}`)
          .join(" · "),
      }));
      const sc = card("Answer stability", "consistency across repeats (0 = single run)", [drawRadar(shortAxes, series), buildChartLegend(series)]);
      wireHighlight(sc);
      grid.appendChild(sc);
    }
    content.appendChild(grid);
  }

  renderExplanations(data.benchmarks || []);
}

main();
