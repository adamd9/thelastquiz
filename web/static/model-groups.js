// Curated model groups — the single source of truth shared by the main app,
// the admin console AND the public rankings page. Kept dependency-free (no
// state.js import) so the public rankings page can load it without pulling in
// the whole app module graph.
//
// Editorial groups are explicitly curated below, then intersected by EXACT id
// with the available models. Research and verify each selection before editing;
// never infer membership from names, prefixes, descriptions, or catalogue order.
// Only the objective price-based groups are computed dynamically. The rankings
// page passes models with results as `{ id, available: true }`, so editorial
// groups still work there while price-based groups drop out (no pricing).

// Local, dependency-free version of prettifyModelId (utils.js keeps its own
// copy for the app; duplicated here to avoid a utils.js <-> model-groups.js
// import cycle).
function pretty(modelId) {
  if (!modelId) return "";
  const tail = String(modelId).split("/").pop() || String(modelId);
  return tail
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

// ===========================================================================
// MODEL ORIGIN — OpenRouter author/lab prefix -> country of origin (name +
// flag emoji). Keyed off the prefix before "/" (e.g. "x-ai/grok-4.3" -> "x-ai").
// Powers BOTH the "Global leaders" group below and the country flag shown above
// a model's logo in the rich chart tooltips. Unlike the exact-id group lists,
// this maps by LAB so it still resolves for whatever build is in the payload
// (e.g. a benchmarked grok-4.3, not just the curated newest grok-4.5).
// Community fine-tuners with no clear national HQ are deliberately omitted so we
// never assert a nationality we're unsure of (they simply get no flag).
// ===========================================================================
const _US = { country: "United States", flag: "🇺🇸" };
const _CN = { country: "China", flag: "🇨🇳" };
const _EU = { country: "European Union", flag: "🇪🇺" };
const _CA = { country: "Canada", flag: "🇨🇦" };
const _KR = { country: "South Korea", flag: "🇰🇷" };
const _JP = { country: "Japan", flag: "🇯🇵" };
const _IL = { country: "Israel", flag: "🇮🇱" };
const _AE = { country: "United Arab Emirates", flag: "🇦🇪" };
const _IN = { country: "India", flag: "🇮🇳" };
const _CH = { country: "Switzerland", flag: "🇨🇭" };

export const MODEL_COUNTRY = {
  // United States
  openai: _US, anthropic: _US, google: _US, "google-vertex": _US, "x-ai": _US,
  meta: _US, "meta-llama": _US, nvidia: _US, microsoft: _US, amazon: _US,
  perplexity: _US, allenai: _US, thinkingmachines: _US, deepcogito: _US,
  inception: _US, writer: _US, poolside: _US, morph: _US, relace: _US,
  nousresearch: _US, cognitivecomputations: _US, liquidai: _US, servicenow: _US,
  "prime-intellect": _US,
  // China
  deepseek: _CN, qwen: _CN, moonshotai: _CN, "z-ai": _CN, zhipu: _CN, thudm: _CN,
  minimax: _CN, tencent: _CN, xiaomi: _CN, baidu: _CN, bytedance: _CN,
  "bytedance-seed": _CN, stepfun: _CN, meituan: _CN, inclusionai: _CN,
  kwaipilot: _CN, nanbeige: _CN, openbmb: _CN,
  // European Union (Mistral / France — the EU's frontier champion)
  mistralai: _EU, mistral: _EU,
  // Canada
  cohere: _CA,
  // Other notable AI nations (mapped so their flag is correct if they appear)
  upstage: _KR, "lg-ai": _KR, lgai: _KR, naver: _KR,
  sakana: _JP, ai21: _IL, tii: _AE, mbzuai: _AE, sarvam: _IN, "swiss-ai": _CH,
};

/* The country of origin for a model id, or null if its lab isn't mapped. The
 * OpenRouter "~author" alias prefix (e.g. "~x-ai/grok-latest") is stripped so
 * aliases resolve to the same country. */
export function countryForModelId(modelId) {
  let prefix = String(modelId || "").split("/")[0].toLowerCase();
  if (prefix.startsWith("~")) prefix = prefix.slice(1);
  return MODEL_COUNTRY[prefix] || null;
}

// ===========================================================================
// FRONTIER MODELS — HAND-CURATED. Review and edit this list directly.
// ---------------------------------------------------------------------------
// "Frontier" is an editorial judgement (which models the field currently treats
// as state-of-the-art). It CANNOT be derived from ids or release dates — labs
// ship many SKUs and silently refresh old ones — so we hard-code one flagship
// per lab and refresh it by hand every few months.
//
// Rules for editing:
//   • Every `id` MUST be copied exactly from https://openrouter.ai/models so it
//     can actually be selected and benchmarked.
//   • If a lab has NO suitable model on OpenRouter yet, set `id: null` and
//     explain in `note`. Run `node scripts/check-frontier-models.mjs` to verify
//     the whole list against the live catalogue — it loudly flags every null id
//     and every id that has gone missing, and suggests that lab's newest models.
//
// Last reviewed: 2026-10-18 · source: Artificial Analysis Intelligence Index
// leaderboard (https://artificialanalysis.ai/models) + the CAIS Text
// Capabilities Index (https://dashboard.safe.ai) + provider announcements.
// ===========================================================================
export const FRONTIER_MODELS = [
  {
    lab: "OpenAI",
    id: "openai/gpt-6-astra",
    note: "GPT-6 Astra — OpenAI's flagship; GPT-6.1 Sol is a lower-cost tier, not its replacement",
  },
  {
    lab: "Anthropic",
    id: "anthropic/claude-opus-5.5",
    note: "Claude Opus 5.5 — Anthropic's current flagship; ahead of Fable 5.1 on the AA Intelligence Index",
  },
  {
    lab: "Google",
    id: "google/gemini-4-argon",
    note: "Gemini 4 Argon — Google's current flagship reasoning model",
  },
  {
    lab: "xAI",
    id: "x-ai/grok-4.7",
    note: "Grok 4.7 — newest xAI flagship",
  },
  {
    lab: "Moonshot",
    id: "moonshotai/kimi-k3",
    note: "Kimi K3 — Moonshot's current flagship",
  },
  {
    lab: "Alibaba",
    id: "qwen/qwen3.8-max-0902",
    note: "Qwen3.8 Max 0902 — current OpenRouter build of Alibaba's flagship",
  },
  {
    lab: "DeepSeek",
    id: "deepseek/deepseek-v4-pro-0813",
    note: "DeepSeek V4 Pro 0813 — GA release of V4 Pro",
  },
  {
    lab: "Meta",
    id: "meta/muse-wonder",
    note: "Muse Wonder (Meta Superintelligence Labs) — current flagship. NB: lives under the 'meta/' author prefix, NOT 'meta-llama/'.",
  },
];

// ===========================================================================
// HUMANITY'S LAST EXAM — HAND-CURATED, EXACT. Review and edit this list directly.
// ---------------------------------------------------------------------------
// The exact model lineup on HLE-Rolling (CAIS + Scale AI), in the leaderboard's
// own chronological order. Like FRONTIER_MODELS this is hard-coded and matched to
// OpenRouter by EXACT id — never fuzzy/needle matching. Each row is HLE's exact
// build, or — when that build has aged off OpenRouter — the nearest NEWER build,
// always spelled out in `note` (never a silent swap). If the only newer build is
// already another row, this one stays id: null so the gap stays visible.
//
// Rules for editing:
//   • Every `id` MUST be copied exactly from https://openrouter.ai/models.
//   • Prefer HLE's exact build. If it's gone, use the nearest newer build and
//     note the swap; if that newer build already appears in another row, leave
//     this row id: null (documented) rather than duplicating it.
//
// Last reviewed: 2026-09-16 · source: the CAIS "Text Capabilities Index" at
// https://dashboard.safe.ai (backed by https://dashboard.safe.ai/api/models).
// That API 403s on a plain curl — it needs a lastexam.ai Origin, exactly as
// scripts/check-frontier-models.mjs sends it:
//   curl -H 'Origin: https://lastexam.ai' -H 'Referer: https://lastexam.ai/' \
//        https://dashboard.safe.ai/api/models
// The lineup below is every standard (non-mini) model with an HLE score, in
// releaseDate order — run `node scripts/check-frontier-models.mjs` to confirm it
// still matches (it prints ADDED/REMOVED rows on any drift). The separate Scale
// SEAL leaderboard is NOT this lineup and must not be substituted here.
// NB: HLE-Rolling tracks FIVE Grok builds as distinct rows (Grok 4, 4.2, 4.3,
// 4.5, 4.6) — don't collapse them.
// ===========================================================================
export const HLE_MODELS = [
  { name: "GPT-4o", sourceId: "gpt-4o-2024-11-20", id: "openai/gpt-4o" },
  { name: "o1", sourceId: "o1", id: "openai/o1" },
  { name: "DeepSeek R1", sourceId: "deepseek-r1", id: "deepseek/deepseek-r1", note: "Evaluated on the text-only subset." },
  { name: "o3-mini", sourceId: "o3-mini-high", id: "openai/o3-mini" },
  { name: "Claude Sonnet 3.7", sourceId: "sonnet-3-7-thinking-16k", id: null, note: "Base claude-3.7-sonnet aged off OpenRouter; Sonnet 4 / 4.5 / 4.6 each hold their own rows below, so there's no distinct newer Sonnet to substitute without duplicating one — left absent." },
  { name: "Gemini 2.5 Pro Experimental", sourceId: "gemini-2-5-pro-exp-high", id: null, note: "March 2025 experimental build is gone; the GA Gemini 2.5 Pro row below already covers it." },
  { name: "o3", sourceId: "o3-high", id: "openai/o3" },
  { name: "Claude Sonnet 4", sourceId: "sonnet-4-thinking-16k", id: "anthropic/claude-sonnet-4" },
  { name: "Gemini 2.5 Pro", sourceId: "gemini-2-5-pro-high", id: "google/gemini-2.5-pro" },
  { name: "Grok 4", sourceId: "grok-4", id: null, note: "Base grok-4 aged off OpenRouter; Grok 4.2, 4.3, 4.5 and 4.6 each hold their own rows below, so no distinct substitute remains." },
  { name: "GPT-5", sourceId: "gpt-5-high", id: "openai/gpt-5" },
  { name: "Claude Sonnet 4.5", sourceId: "sonnet-4-5-thinking-32k", id: "anthropic/claude-sonnet-4.5" },
  { name: "Kimi K2", sourceId: "kimi-k2-thinking", id: "moonshotai/kimi-k2-thinking" },
  { name: "Gemini 3 Pro", sourceId: "gemini-3-pro-preview-high", id: null, note: "No text Gemini 3 Pro on OpenRouter; the Gemini 3.1 Pro row below already covers it." },
  { name: "GPT-5.1", sourceId: "gpt-5.1-high", id: "openai/gpt-5.1" },
  { name: "Claude Opus 4.5", sourceId: "opus-4-5-thinking-32k", id: "anthropic/claude-opus-4.5" },
  { name: "DeepSeek 3.2", sourceId: "deepseek-v3.2-thinking", id: "deepseek/deepseek-v3.2" },
  { name: "GPT-5.2", sourceId: "gpt-5.2-high", id: "openai/gpt-5.2" },
  { name: "Kimi K2.5", sourceId: "kimi-k2.5-thinking", id: "moonshotai/kimi-k2.5" },
  { name: "Claude Opus 4.6", sourceId: "opus-4-6-adaptive-64k", id: "anthropic/claude-opus-4.6" },
  { name: "Claude Sonnet 4.6", sourceId: "sonnet-4-6-adaptive-64k", id: "anthropic/claude-sonnet-4.6" },
  { name: "Gemini 3.1 Pro", sourceId: "gemini-3.1-pro-preview-high", id: "google/gemini-3.1-pro-preview" },
  { name: "GPT-5.4", sourceId: "gpt-5.4-high", id: "openai/gpt-5.4" },
  { name: "Grok 4.2", sourceId: "grok-4-2", id: "x-ai/grok-4.20", note: "HLE's 'Grok 4.2' — OpenRouter lists this build as grok-4.20." },
  { name: "Claude Opus 4.7", sourceId: "opus-4-7-adaptive-64k", id: "anthropic/claude-opus-4.7" },
  { name: "Grok 4.3", sourceId: "grok-4-3", id: "x-ai/grok-4.3" },
  { name: "Kimi K2.6", sourceId: "kimi-k2.6-64k", id: "moonshotai/kimi-k2.6" },
  { name: "GPT-5.5", sourceId: "gpt-5.5-high", id: "openai/gpt-5.5" },
  { name: "DeepSeek 4 Pro", sourceId: "deepseek-v4-pro", id: "deepseek/deepseek-v4-pro" },
  { name: "Claude Opus 4.8", sourceId: "opus-4-8-high", id: "anthropic/claude-opus-4.8" },
  { name: "Claude Fable 5", sourceId: "claude-fable-5-high", id: "anthropic/claude-fable-5" },
  { name: "Grok 4.5", sourceId: "grok-4.5", id: "x-ai/grok-4.5" },
  { name: "GPT-5.6 Sol", sourceId: "gpt-5.6-sol-high", id: "openai/gpt-5.6-sol" },
  { name: "Muse Spark 1.1", sourceId: "muse-spark-1.1-high", id: "meta/muse-spark-1.1" },
  { name: "Kimi K3", sourceId: "kimi-k3-high", id: "moonshotai/kimi-k3" },
  { name: "Claude Opus 5", sourceId: "claude-opus-5-high", id: "anthropic/claude-opus-5" },
  { name: "Grok 4.6", sourceId: "grok-4.6", id: "x-ai/grok-4.6" },
  { name: "GLM 5.3", sourceId: "glm-5.3", id: "z-ai/glm-5.3" },
  { name: "Claude Fable 5.1", sourceId: "claude-fable-5-1-high", id: "anthropic/claude-fable-5.1" },
  { name: "GPT-6 Astra", sourceId: "gpt-6-astra-high", id: "openai/gpt-6-astra" },
  { name: "Muse Spark 1.3", sourceId: "muse-spark-1.3-high", id: "meta/muse-spark-1.3" },
];

// ===========================================================================
// BEST OPEN SOURCE — HAND-CURATED, EXACT. Review and edit this list directly.
// ---------------------------------------------------------------------------
// The strongest open-weight (self-hostable) models, one flagship per major open
// lab, ordered best -> most modest. Like FRONTIER_MODELS this is hard-coded and
// matched to OpenRouter by EXACT id — NOT a vendor-prefix regex sorted by price,
// which missed today's leaders entirely (GLM, MiniMax, Kimi, MiMo, Hunyuan).
//
// Rules for editing:
//   • Every `id` MUST be copied exactly from https://openrouter.ai/models and be
//     genuinely open-weight (downloadable). Exclude API-only tiers (Qwen "Max",
//     proprietary "pro" endpoints, etc.).
//   • Keep it ordered strongest-first so the showcase leads with the best.
//
// Last reviewed: 2026-08-27 · sources: Artificial Analysis open-weights
// Intelligence Index (https://artificialanalysis.ai/models/open-source) +
// OpenRouter usage rankings (https://openrouter.ai/rankings).
// Muse Spark Open added: 2026-10-18 · OpenRouter weight link + AA model page
// (https://artificialanalysis.ai/models/muse-spark-open).
// ===========================================================================
export const OSS_MODELS = [
  { name: "Muse Spark Open", id: "meta/muse-spark-open", note: "Meta — coding-optimized open-weight Muse; OpenRouter links meta-models/Muse-Spark-Open-816B-A42B weights." },
  { name: "GLM-5.2", id: "z-ai/glm-5.2", note: "Z AI (Zhipu) — newest GLM with open weights linked by OpenRouter." },
  { name: "MiniMax-M3", id: "minimax/minimax-m3", note: "MiniMax — #2 open-weight." },
  { name: "DeepSeek V4 Pro 0813", id: "deepseek/deepseek-v4-pro-0813", note: "DeepSeek — GA release of its V4 Pro flagship." },
  { name: "Kimi K2.6", id: "moonshotai/kimi-k2.6", note: "Moonshot — strongest open-weight Kimi (K3 is not open-weight)." },
  { name: "MiMo-V2.5-Pro", id: "xiaomi/mimo-v2.5-pro", note: "Xiaomi — also the most-used open model on OpenRouter." },
  { name: "Hunyuan 3", id: "tencent/hy3", note: "Tencent — high intelligence and very widely used." },
  { name: "Nemotron 3 Ultra", id: "nvidia/nemotron-3-ultra-550b-a55b", note: "NVIDIA — 550B open flagship." },
  { name: "Qwen3.8 27B", id: "qwen/qwen3.8-27b", note: "Alibaba — open-weight Qwen3.8 dense model (the 'Max' tiers are API-only)." },
  { name: "Mistral Medium 3.5", id: "mistralai/mistral-medium-3-5", note: "Mistral — strongest open Mistral." },
  { name: "Gemma 4 31B", id: "google/gemma-4-31b-it", note: "Google — flagship open Gemma." },
  { name: "gpt-oss-120b", id: "openai/gpt-oss-120b", note: "OpenAI — its open-weight release." },
  { name: "Llama 4 Maverick", id: "meta-llama/llama-4-maverick", note: "Meta — best open Llama (now behind the field)." },
];

// ===========================================================================
// THE CLASSICS — HAND-CURATED, EXACT. No automatic sibling replacements.
// Last reviewed: 2026-10-18 · established benchmark representatives, with exact
// ids verified against the live OpenRouter catalogue.
// ===========================================================================
export const CLASSIC_MODELS = [
  { name: "GPT-4o", id: "openai/gpt-4o", note: "OpenAI's widely recognized GPT-4o generation." },
  { name: "DeepSeek R1", id: "deepseek/deepseek-r1", note: "DeepSeek's widely recognized reasoning release." },
  { name: "Claude Sonnet 5", id: "anthropic/claude-sonnet-5", note: "Representative Claude Sonnet generation." },
  { name: "Gemini 2.5 Pro", id: "google/gemini-2.5-pro", note: "Established Gemini reasoning model." },
  { name: "Grok 4.7", id: "x-ai/grok-4.7", note: "Current representative of the Grok family." },
  { name: "Llama 3.3 70B Instruct", id: "meta-llama/llama-3.3-70b-instruct", note: "Widely used open Llama baseline." },
];

// ===========================================================================
// UNRESTRICTED — HAND-CURATED, EXACT. Low refusal is a researched editorial
// judgement, not a property inferred from a model's name or open-weight status.
// Review provider/model cards, then copy matching ids from OpenRouter. Keep
// legacy comparisons explicitly documented; no promise of zero refusals.
//
// Last reviewed: 2026-10-18 · live OpenRouter catalogue/model descriptions +
// https://huggingface.co/NousResearch/Hermes-4-405B
// https://huggingface.co/NousResearch/Hermes-3-Llama-3.1-405B
// https://huggingface.co/Gryphe/MythoMax-L2-13b
// ===========================================================================
export const UNRESTRICTED_MODELS = [
  { name: "Cydonia 24B V4.1", id: "thedrummer/cydonia-24b-v4.1", note: "OpenRouter explicitly describes this Mistral Small 3.2 fine-tune as uncensored." },
  { name: "Hermes 4 405B", id: "nousresearch/hermes-4-405b", note: "Nous Research documents reduced refusal rates and user-directed alignment." },
  { name: "Dolphin Mistral 24B Venice Edition", id: "cognitivecomputations/dolphin-mistral-24b-venice-edition", note: "OpenRouter's Venice Uncensored model, developed by dphn.ai with Venice." },
  { name: "Hermes 3 70B", id: "nousresearch/hermes-3-llama-3.1-70b", note: "Legacy user-aligned Hermes comparison at a smaller model size." },
  { name: "Hermes 3 405B", id: "nousresearch/hermes-3-llama-3.1-405b", note: "Legacy user-aligned Hermes comparison; not the current flagship." },
  { name: "MythoMax L2 13B", id: "gryphe/mythomax-l2-13b", note: "Legacy roleplay/storywriting comparison, not a current low-refusal flagship or a Mythos model." },
];

// ===========================================================================
// GLOBAL LEADERS — HAND-CURATED, EXACT, COUNTRY-ORGANISED. Edit directly.
// ---------------------------------------------------------------------------
// The top 2–3 models from each nation that has produced genuinely frontier-tier
// models, one country block at a time. Like FRONTIER_MODELS this is hard-coded
// and matched to OpenRouter by EXACT id (never fuzzy). Picks are ordered and
// justified by the Artificial Analysis Intelligence Index. The rich chart
// tooltips additionally stack each model's country flag above its logo (see
// MODEL_COUNTRY / countryForModelId), which resolves by LAB so it also lights up
// for older benchmarked builds.
//
// Rules for editing:
//   • Every `id` MUST be copied exactly from https://openrouter.ai/models.
//   • Keep each country's picks ordered strongest-first, distinct labs where
//     possible, and refresh from the AA Intelligence Index every few months.
//   • `node scripts/check-frontier-models.mjs` also validates these ids.
//
// Last reviewed: 2026-09-08 · source: Artificial Analysis Intelligence Index
// v4.1 (https://artificialanalysis.ai/leaderboards/models).
// ===========================================================================
export const GLOBAL_LEADERS = [
  {
    region: "United States",
    flag: "🇺🇸",
    models: [
      { name: "Claude Fable 5.1", id: "anthropic/claude-fable-5.1", note: "Anthropic — joint leader on the AA Intelligence Index." },
      { name: "GPT-6 Astra", id: "openai/gpt-6-astra", note: "OpenAI — joint leader on the AA Intelligence Index." },
      { name: "Grok 4.6", id: "x-ai/grok-4.6", note: "xAI — newest Grok flagship; the US's third distinct frontier lab (Google's Gemini is a close runner-up)." },
    ],
  },
  {
    region: "China",
    flag: "🇨🇳",
    models: [
      { name: "Kimi K3", id: "moonshotai/kimi-k3", note: "Moonshot AI — the strongest non-US model and #1 open-weight worldwide." },
      { name: "GLM-5.3", id: "z-ai/glm-5.3", note: "Z.ai (Zhipu) — newest GLM generation on OpenRouter." },
      { name: "Qwen3.8 Max 0902", id: "qwen/qwen3.8-max-0902", note: "Alibaba — current OpenRouter build of its flagship Qwen." },
    ],
  },
  {
    region: "European Union",
    flag: "🇪🇺",
    models: [
      { name: "Mistral Medium 3.5", id: "mistralai/mistral-medium-3-5", note: "Mistral AI (France) — Europe's leading frontier lab." },
    ],
  },
  {
    region: "Canada",
    flag: "🇨🇦",
    models: [
      { name: "Command A", id: "cohere/command-a", note: "Cohere — Canada's enterprise-focused flagship." },
    ],
  },
];

export function buildModelGroups(models) {
  const available = (models || []).filter((m) => m.available);
  const exclude = /(image|embed|tts|audio|whisper|vision|moderation|rerank|guard)/i;
  const chat = available.filter(
    (m) => !exclude.test(m.id) && !m.id.startsWith("~") && !m.id.endsWith(":batch")
  );
  const price = (m) => {
    const c = Number(m.pricing?.completion);
    return Number.isFinite(c) ? c : null;
  };
  const uniq = (arr) => [...new Map(arr.map((m) => [m.id, m])).values()];
  const ids = (arr, n) => uniq(arr).slice(0, n).map((m) => m.id);
  const names = (arr, n) => uniq(arr).slice(0, n).map((m) => pretty(m.id));

  const groups = [];
  const add = (id, label, description, list, limit = 5) => {
    const picked = ids(list, limit);
    if (picked.length >= 2) {
      groups.push({ id, label, description, modelIds: picked, examples: names(list, 3) });
    }
  };

  // "Humanity's Last Exam" — the exact HLE-Rolling lineup, hard-coded in
  // HLE_MODELS at the top of this file. Built like `frontier`: each id must
  // match the OpenRouter catalogue exactly, so a model is either the one HLE
  // tested or it's absent — never a fuzzy "nearest sibling".
  const hlePicked = HLE_MODELS.filter((f) => f.id)
    .map((f) => available.find((m) => m.id === f.id))
    .filter(Boolean);
  add(
    "hle",
    "Humanity's Last Exam",
    "The exact lineup benchmarked by Humanity's Last Exam — the field's hardest capability test.",
    hlePicked,
    hlePicked.length || 1
  );

  const classicPicked = CLASSIC_MODELS
    .map((f) => available.find((m) => m.id === f.id))
    .filter(Boolean);
  add(
    "classics",
    "The classics",
    "The famous models everyone's talking about.",
    classicPicked,
    classicPicked.length || 1
  );

  // "Frontier models" — from the hand-curated FRONTIER_MODELS list at the top of
  // this file, narrowed to whatever is present in this payload. On the admin
  // console (live OpenRouter catalogue) that's every curated model, so the group
  // can be selected to benchmark them; on the public rankings page it's only the
  // curated models that already have results.
  const frontierPicked = FRONTIER_MODELS.filter((f) => f.id)
    .map((f) => available.find((m) => m.id === f.id))
    .filter(Boolean);
  add(
    "frontier",
    "Frontier models",
    "The most capable flagship model from each major lab.",
    frontierPicked,
    frontierPicked.length || 1
  );

  // "Global leaders" — the top models from each leading AI nation, hard-coded in
  // GLOBAL_LEADERS at the top of this file and matched by EXACT OpenRouter id
  // (like `frontier`). Organised by country, strongest nation first; the rich
  // chart tooltips also stack each model's flag above its logo. Examples preview
  // one model per country so the card shows the international spread.
  const leaderPicked = GLOBAL_LEADERS
    .flatMap((b) => b.models.map((m) => ({ id: m.id, name: m.name, flag: b.flag, region: b.region })))
    .filter((e) => available.some((m) => m.id === e.id));
  const leaderUniq = [...new Map(leaderPicked.map((e) => [e.id, e])).values()];
  if (leaderUniq.length >= 2) {
    const seenRegion = new Set();
    const examples = [];
    for (const e of leaderUniq) {
      if (seenRegion.has(e.region)) continue;
      seenRegion.add(e.region);
      examples.push(`${e.flag} ${e.name}`);
      if (examples.length >= 3) break;
    }
    groups.push({
      id: "global-leaders",
      label: "Global leaders",
      description: "The strongest models from each leading AI nation — the US, China, the EU and beyond.",
      modelIds: leaderUniq.map((e) => e.id),
      examples,
    });
  }

  // "Best open source" — the strongest open-weight models, hard-coded in
  // OSS_MODELS at the top of this file and matched by EXACT OpenRouter id
  // (like `frontier`), ordered by capability. Replaces the old vendor-prefix
  // regex + price-descending sort, which missed the current leaders and used
  // price as a bogus proxy for quality.
  const ossPicked = OSS_MODELS.filter((f) => f.id)
    .map((f) => available.find((m) => m.id === f.id))
    .filter(Boolean);
  add(
    "oss",
    "Best open source",
    "The strongest open-weight models you could self-host, ranked by capability.",
    ossPicked,
    ossPicked.length || 1
  );

  const priced = chat.filter((m) => price(m) !== null && price(m) > 0);
  add(
    "cheapest",
    "Cheapest",
    "Lowest cost per token — great for a quick, low-stakes run.",
    [...priced].sort((a, b) => price(a) - price(b)),
    6
  );
  add(
    "premium",
    "Most expensive",
    "The priciest, top-tier models — for a no-expense-spared comparison.",
    [...priced].sort((a, b) => price(b) - price(a)),
    5
  );

  const unrestrictedPicked = UNRESTRICTED_MODELS
    .map((f) => available.find((m) => m.id === f.id))
    .filter(Boolean);
  add(
    "unrestricted",
    "Unrestricted (a.k.a. the naughty models)",
    "Models with fewer safety guardrails — often the most surprising answers.",
    unrestrictedPicked,
    unrestrictedPicked.length || 1
  );

  return groups;
}
