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

import { FRONTIER_MODELS } from "../web/static/model-groups.js";

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

console.log(
  problems
    ? `\n${problems} item(s) need attention — edit FRONTIER_MODELS in web/static/model-groups.js`
    : `\nAll curated frontier models are present on OpenRouter.`
);
process.exit(problems ? 1 : 0);
