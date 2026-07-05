/* The Last Quiz — public rankings page.
 * Dependency-free: fetches /api/rankings and renders four SVG radar charts
 * (Big Five, open MBTI, SD-3, and cross-benchmark answer stability). */

const PALETTE = [
  "#7c5cff", "#ff5c8a", "#37d3a0", "#ffb547", "#4aa8ff",
  "#e05cff", "#8bd450", "#ff7a59", "#5cd6ff", "#c8b6ff",
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

  // Concentric rings.
  for (let r = 1; r <= rings; r++) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const [x, y] = polarToXY(cx, cy, (R * r) / rings, angleFor(i));
      pts.push(`${x},${y}`);
    }
    svg.appendChild(el("polygon", { class: "ring", points: pts.join(" ") }));
  }

  // Spokes + axis labels.
  for (let i = 0; i < n; i++) {
    const [x, y] = polarToXY(cx, cy, R, angleFor(i));
    svg.appendChild(el("line", { class: "spoke", x1: cx, y1: cy, x2: x, y2: y }));
    const [lx, ly] = polarToXY(cx, cy, R + 18, angleFor(i));
    const anchor = Math.abs(lx - cx) < 6 ? "middle" : lx > cx ? "start" : "end";
    const label = el("text", { class: "axis-label", x: lx, y: ly + 3, "text-anchor": anchor });
    label.textContent = axes[i];
    svg.appendChild(label);
  }

  // Series polygons.
  for (const s of series) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const v = Math.max(0, Math.min(100, s.values[i] ?? 0));
      const [x, y] = polarToXY(cx, cy, (R * v) / 100, angleFor(i));
      pts.push(`${x},${y}`);
    }
    svg.appendChild(el("polygon", {
      points: pts.join(" "), fill: s.color, "fill-opacity": "0.14",
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
  const axes = bench.dimensions.map((d) =>
    d.poles ? `${d.poles.low}\u2013${d.poles.high}` : d.name,
  );
  const series = bench.models.map((m) => ({
    name: m.model_id,
    color: colorFor(m.model_id),
    values: bench.dimensions.map((d) => m.profile[d.id] ?? 0),
  }));
  const body = [drawRadar(axes, series)];

  // MBTI-style benchmarks: show each model's four-letter type.
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
  const footer = document.getElementById("footer");
  footer.innerHTML =
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
    content.innerHTML =
      '<div class="empty">No benchmark runs yet. An admin can run the benchmarks from the ' +
      '<a href="/admin">admin console</a>.</div>';
    return;
  }

  renderLegend(models, colorFor);

  const grid = document.createElement("div");
  grid.className = "grid";

  for (const bench of data.benchmarks) {
    if (!bench.models.length) continue;
    grid.appendChild(benchmarkCard(bench, colorFor));
  }

  // Fourth radar: cross-benchmark answer stability (higher = more consistent).
  const stab = data.stability;
  if (stab && stab.models && stab.models.length) {
    const series = stab.models.map((m) => ({
      name: m.model_id,
      color: colorFor(m.model_id),
      values: m.values.map((v) => (v == null ? 0 : v)),
    }));
    const shortAxes = stab.axes.map((t) => t.split(" (")[0].trim());
    grid.appendChild(
      card(
        "Answer stability",
        "how consistently each model answers across repeats (0 = single run)",
        [drawRadar(shortAxes, series)],
      ),
    );
  }

  content.appendChild(grid);
}

main();
