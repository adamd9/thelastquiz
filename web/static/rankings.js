/* The Last Quiz — public rankings page.
 * Dependency-free: fetches /api/rankings and renders SVG radar charts plus
 * plain-English explanations of each test. Styled to match the main app
 * (warm palette, shared design tokens via /static/styles.css). */

// On-brand palette that reads well on the app's cream panels.
const PALETTE = [
  "#da5f35", "#0f5c78", "#b5179e", "#2a9d8f", "#e09f3e",
  "#6d597a", "#386641", "#9e2a2b", "#3a7ca5", "#8a5a44",
];

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

  for (const s of series) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const v = Math.max(0, Math.min(100, s.values[i] ?? 0));
      const [x, y] = polarToXY(cx, cy, (R * v) / 100, angleFor(i));
      pts.push(`${x},${y}`);
    }
    svg.appendChild(el("polygon", {
      points: pts.join(" "), fill: s.color, "fill-opacity": "0.16",
      stroke: s.color, "stroke-width": "2", "stroke-linejoin": "round",
    }));
  }
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

function renderLegend(models, colorFor) {
  const legend = document.getElementById("legend");
  legend.innerHTML = "";
  for (const m of models) {
    const item = document.createElement("div");
    item.className = "item";
    const sw = document.createElement("span");
    sw.className = "sw";
    sw.style.background = colorFor(m);
    const label = document.createElement("span");
    label.textContent = m;
    item.appendChild(sw);
    item.appendChild(label);
    legend.appendChild(item);
  }
}

function benchmarkCard(bench, colorFor) {
  const axes = bench.dimensions.map((d) => (d.poles ? `${d.poles.low}\u2013${d.poles.high}` : d.name));
  const series = bench.models.map((m) => ({
    name: m.model_id,
    color: colorFor(m.model_id),
    values: bench.dimensions.map((d) => m.profile[d.id] ?? 0),
  }));
  const body = [drawRadar(axes, series)];

  const codes = bench.models.filter((m) => m.type_code);
  if (codes.length) {
    const tc = document.createElement("div");
    tc.className = "typecodes";
    for (const m of codes) {
      const span = document.createElement("span");
      span.innerHTML = `${m.model_id}: <b>${m.type_code}</b>`;
      tc.appendChild(span);
    }
    body.push(tc);
  }
  return card(bench.title, `${bench.dimensions.length} dimensions · v${bench.version}`, body);
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
    const kind = b.kind === "bipolar" ? "Type test" : "Trait test";
    let html =
      `<h2>${b.title}</h2>` +
      `<div class="tag">${kind}${b.question_count ? " · " + b.question_count + " items" : ""}</div>` +
      (b.about ? `<p>${b.about}</p>` : "");
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
    data = await (await fetch("/api/rankings")).json();
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
      '<a href="/admin">admin console</a>. The tests are explained below.';
    content.appendChild(note);
  } else {
    renderLegend(models, colorFor);
    const grid = document.createElement("div");
    grid.className = "grid";
    for (const bench of data.benchmarks) {
      if (!bench.models.length) continue;
      grid.appendChild(benchmarkCard(bench, colorFor));
    }
    const stab = data.stability;
    if (stab && stab.models && stab.models.length) {
      const series = stab.models.map((m) => ({
        name: m.model_id,
        color: colorFor(m.model_id),
        values: m.values.map((v) => (v == null ? 0 : v)),
      }));
      const shortAxes = stab.axes.map((t) => t.split(" (")[0].trim());
      grid.appendChild(
        card("Answer stability", "consistency across repeats (0 = single run)", [drawRadar(shortAxes, series)]),
      );
    }
    content.appendChild(grid);
  }

  renderExplanations(data.benchmarks || []);
}

main();
