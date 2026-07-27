#!/usr/bin/env node
// Verify the hand-curated FRONTIER_MODELS list against the LIVE OpenRouter
// catalogue. Run this whenever you review the frontier list (every few months):
//
//   node scripts/check-frontier-models.mjs
//
// One line per curated lab:
//   OK       present on OpenRouter (shows its release date)
//   MISSING  the id is NOT in the OpenRouter catalogue any more — fix the id
//   TODO     no model curated for this lab (id: null) — pick one manually
//
// For every MISSING/TODO row it also lists that lab's newest OpenRouter models
// so you (or a coding agent) can eyeball a replacement. Exits non-zero if any
// row needs attention, so it doubles as a CI / pre-review guard.

import { FRONTIER_MODELS, GLOBAL_LEADERS, HLE_MODELS } from "../web/static/model-groups.js";

const OPENROUTER = "https://openrouter.ai/api/v1/models";

// Rough lab -> OpenRouter author prefix(es); only used to suggest replacements.
const LAB_PREFIXES = {
  OpenAI: ["openai"],
  Anthropic: ["anthropic"],
  Google: ["google"],
  xAI: ["x-ai"],
  Moonshot: ["moonshotai"],
  Alibaba: ["qwen"],
  DeepSeek: ["deepseek"],
  "Z.ai": ["z-ai"],
  Meta: ["meta-llama", "meta"],
};

const res = await fetch(OPENROUTER, { headers: { "User-Agent": "frontier-check" } });
if (!res.ok) {
  console.error(`Failed to fetch OpenRouter catalogue: ${res.status} ${res.statusText}`);
  process.exit(2);
}

const catalogue = (await res.json()).data || [];
const byId = new Map(catalogue.map((m) => [m.id, m]));
const dateOf = (m) => (m?.created ? new Date(m.created * 1000).toISOString().slice(0, 10) : "?");

const suggest = (lab, fallbackPrefix) => {
  const prefixes = LAB_PREFIXES[lab] || (fallbackPrefix ? [fallbackPrefix] : []);
  const rows = catalogue
    .filter((m) => prefixes.some((p) => m.id.startsWith(p + "/")))
    .sort((a, b) => (b.created || 0) - (a.created || 0))
    .slice(0, 6)
    .map((m) => `       ${dateOf(m)}  ${m.id}`);
  return rows.length ? `     newest ${lab} models on OpenRouter:\n${rows.join("\n")}` : "";
};

console.log(
  `Frontier list check — ${new Date().toISOString().slice(0, 10)} · ` +
    `${catalogue.length} models on OpenRouter\n`
);

let problems = 0;
for (const f of FRONTIER_MODELS) {
  const lab = f.lab.padEnd(10);
  if (!f.id) {
    problems++;
    console.log(`TODO     ${lab} (no model curated) — ${f.note}`);
    const s = suggest(f.lab);
    if (s) console.log(s);
  } else if (byId.has(f.id)) {
    console.log(`OK       ${lab} ${f.id}  (${dateOf(byId.get(f.id))})`);
  } else {
    problems++;
    console.log(`MISSING  ${lab} ${f.id}  — NOT ON OPENROUTER`);
    const s = suggest(f.lab, f.id.split("/")[0]);
    if (s) console.log(s);
  }
}

// Also validate the country-organised GLOBAL_LEADERS list (exact ids, like
// FRONTIER_MODELS) so a stale pick in either list is caught in one run.
console.log(`\nGlobal leaders — by country:`);
for (const block of GLOBAL_LEADERS) {
  console.log(`  ${block.flag} ${block.region}`);
  for (const m of block.models) {
    const name = m.name.padEnd(20);
    if (byId.has(m.id)) {
      console.log(`  OK       ${name} ${m.id}  (${dateOf(byId.get(m.id))})`);
    } else {
      problems++;
      console.log(`  MISSING  ${name} ${m.id}  — NOT ON OPENROUTER`);
    }
  }
}

// Validate the HLE-Rolling lineup too (exact ids; null = intentionally absent,
// documented in `note`, and never counts as a problem).
console.log(`\nHumanity's Last Exam — HLE-Rolling lineup (${HLE_MODELS.length} rows):`);
for (const m of HLE_MODELS) {
  const name = m.name.padEnd(24);
  if (!m.id) {
    console.log(`  --       ${name} (intentionally absent)`);
  } else if (byId.has(m.id)) {
    console.log(`  OK       ${name} ${m.id}  (${dateOf(byId.get(m.id))})`);
  } else {
    problems++;
    console.log(`  MISSING  ${name} ${m.id}  — NOT ON OPENROUTER`);
  }
}

console.log(
  problems
    ? `\n${problems} item(s) need attention — edit web/static/model-groups.js`
    : `\nAll curated frontier + global-leaders + HLE models are present on OpenRouter.`
);
process.exit(problems ? 1 : 0);
