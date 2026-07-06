// Curated model groups — the single source of truth shared by the main app,
// the admin console AND the public rankings page. Kept dependency-free (no
// state.js import) so the public rankings page can load it without pulling in
// the whole app module graph.
//
// Each group is built from whatever models are available right now, so the set
// stays correct as the OpenRouter catalog changes. The rankings page passes the
// models that actually have results (as `{ id, available: true }`), which makes
// the price-based groups drop out automatically (no pricing) while the
// id-pattern groups (classics, frontier, oss, unrestricted, HLE) still work.

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

export function buildModelGroups(models) {
  const available = (models || []).filter((m) => m.available);
  const exclude = /(image|embed|tts|audio|whisper|vision|moderation|rerank|guard)/i;
  const chat = available.filter((m) => !exclude.test(m.id));
  const idl = (m) => m.id.toLowerCase();
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

  // Pick the first available model matching each needle, in priority order,
  // preferring the canonical base model over mini/search/preview variants.
  const variantPenalty = /(mini|nano|lite|search|preview|audio|realtime|vision|thinking|reasoning|:free|distill)/;
  const pickByNeedles = (needles) => {
    const out = [];
    const used = new Set();
    for (const needle of needles) {
      const candidates = chat.filter((m) => !used.has(m.id) && idl(m).includes(needle));
      if (!candidates.length) continue;
      candidates.sort((a, b) => {
        const scoreOf = (m) => {
          const tail = idl(m).split("/").pop();
          let s = tail.length;
          if (tail === needle) s -= 1000;
          else if (tail.startsWith(needle)) s -= 100;
          if (variantPenalty.test(tail) && !variantPenalty.test(needle)) s += 200;
          return s;
        };
        return scoreOf(a) - scoreOf(b);
      });
      out.push(candidates[0]);
      used.add(candidates[0].id);
    }
    return out;
  };

  // "Humanity's Last Exam" — align to the models the HLE benchmark (CAIS +
  // Scale AI) actually evaluates on its rolling leaderboard, so our personality
  // rankings sit on the same lineup as the field's hardest capability test.
  // Where HLE's exact version has aged out of the OpenRouter catalogue we take
  // the nearest available sibling (Grok 4 -> 4.x, Gemini 3 Pro -> 3.1 Pro);
  // Claude Sonnet 3.7 is dropped as it has no <=-generation match. The list of
  // needles is chronological, matching HLE-Rolling's own ordering.
  add(
    "hle",
    "Humanity's Last Exam",
    "The lineup benchmarked by Humanity's Last Exam — the field's hardest capability test.",
    pickByNeedles([
      "gpt-4o",
      "o1",
      "o3-mini",
      "o3",
      "gpt-5-mini",
      "gpt-5.2",
      "gpt-5.4",
      "gpt-5.5",
      "gpt-5",
      "claude-sonnet-4.5",
      "claude-sonnet-4",
      "claude-opus-4.5",
      "claude-opus-4.6",
      "claude-opus-4.8",
      "gemini-2.5-flash",
      "gemini-2.5-pro",
      "gemini-3.1-pro",
      "grok-4",
      "glm-5.1",
      "deepseek-r1",
      "kimi-k2",
    ]),
    24
  );

  // "The classics" — the famous, in-the-zeitgeist names people recognise.
  // One flagship per household-name brand (GPT, DeepSeek, Claude, Gemini, Grok,
  // Llama…), picked from whatever is currently available.
  add(
    "classics",
    "The classics",
    "The famous models everyone's talking about.",
    pickByNeedles([
      "gpt-4o",
      "deepseek",
      "claude-sonnet",
      "gemini-2.5-pro",
      "grok",
      "llama-3.3",
      "gemini-3-pro",
      "claude-opus",
      "gemini",
      "gpt-5",
      "llama-4",
      "llama-3.1-70b",
      "qwen3",
      "mistral-large",
    ]),
    6
  );

  const frontierRe =
    /(gpt-5|gpt-4\.1|gpt-4o(?!-mini)|(^|\/)o[134]\b|o3|o4|claude.*(opus|sonnet)|claude-3\.7|gemini-(2\.5|3)[.\- ]?pro|grok-[34]|deepseek-r1|deepseek.*(v3|chat-v3)|llama-3\.1-405|mistral-large|qwen.*max)/;
  add(
    "frontier",
    "Frontier models",
    "The most capable flagship model from each major lab.",
    chat.filter((m) => frontierRe.test(idl(m))),
    6
  );

  const ossRe =
    /^(meta-llama|mistralai|deepseek|qwen|google\/gemma|microsoft\/phi|nvidia|nousresearch|teknium|01-ai|databricks|allenai|cognitivecomputations)/;
  const ossProprietary = /(qwen.*max|mistral-(large|medium)|codestral)/; // API-only tiers
  const oss = chat
    .filter((m) => ossRe.test(idl(m)) && !ossProprietary.test(idl(m)))
    .sort((a, b) => (price(b) || 0) - (price(a) || 0));
  add("oss", "Best open source", "Top open-weight models you could self-host.", oss, 6);

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

  // Match refusal-light / RP-focused models by id only (descriptions often
  // mention these names in comparisons, which would cause false positives).
  const unrestrictedRe =
    /(uncensored|abliterat|dolphin|mythomax|venice|unfiltered|no[-_ ]?guard|lumimaid|rocinante|cydonia|hermes|nous-)/;
  add(
    "unrestricted",
    "Unrestricted (a.k.a. the naughty models)",
    "Models with fewer safety guardrails — often the most surprising answers.",
    chat.filter((m) => unrestrictedRe.test(idl(m))),
    6
  );

  return groups;
}
