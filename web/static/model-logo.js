/* Provider logos for models, keyed off the OpenRouter model id (the author
 * prefix before "/", e.g. "anthropic/claude-sonnet-5" -> "anthropic").
 *
 * Logos are vendored SVGs from lobe-icons (https://github.com/lobehub/lobe-icons,
 * MIT licensed) served locally from /static/logos/ — no runtime external calls.
 * Anything without a vendored logo returns null so callers can fall back to the
 * existing colour dot.
 */

// OpenRouter author prefix -> vendored logo slug. Most providers match 1:1; the
// entries here are where OpenRouter's naming differs from the logo, or where the
// model-brand mark (Claude/Gemini/Grok) reads better than the company mark.
const PROVIDER_LOGOS = {
  openai: "openai",
  anthropic: "claude",
  google: "gemini",
  "google-vertex": "gemini",
  "x-ai": "grok",
  "meta-llama": "meta",
  meta: "meta",
  deepseek: "deepseek",
  mistralai: "mistral",
  mistral: "mistral",
  qwen: "qwen",
  moonshotai: "kimi",
  "z-ai": "zhipu",
  zhipu: "zhipu",
  thudm: "chatglm",
  cohere: "cohere",
  microsoft: "microsoft",
  nvidia: "nvidia",
  perplexity: "perplexity",
};

// Slugs actually present under /static/logos/, so we never request a missing file.
const VENDORED = new Set([
  "openai", "anthropic", "claude", "gemini", "google", "grok", "meta",
  "deepseek", "mistral", "qwen", "kimi", "moonshot", "zhipu", "chatglm",
  "cohere", "microsoft", "nvidia", "perplexity", "openrouter",
]);

export function providerPrefix(modelId) {
  return String(modelId || "").split("/")[0].toLowerCase();
}

/* The vendored logo slug for a model id, or null if we don't have one. */
export function providerLogoSlug(modelId) {
  const prefix = providerPrefix(modelId);
  const mapped = PROVIDER_LOGOS[prefix] || prefix; // fall back to the prefix itself
  return VENDORED.has(mapped) ? mapped : null;
}

/* URL to the vendored logo SVG, or null. */
export function providerLogoUrl(modelId) {
  const slug = providerLogoSlug(modelId);
  return slug ? `/static/logos/${slug}.svg` : null;
}

/* An <img> element for the provider logo, or null if none. */
export function providerLogoImg(modelId, size = 16) {
  const url = providerLogoUrl(modelId);
  if (!url) return null;
  const img = document.createElement("img");
  img.className = "provider-logo";
  img.src = url;
  img.width = size;
  img.height = size;
  img.alt = providerPrefix(modelId);
  img.loading = "lazy";
  return img;
}

/* Inline <img> HTML for use in template literals, or "" if no logo. */
export function providerLogoHtml(modelId, size = 16) {
  const url = providerLogoUrl(modelId);
  if (!url) return "";
  const p = providerPrefix(modelId);
  return `<img class="provider-logo" src="${url}" width="${size}" height="${size}" alt="${p}" loading="lazy" />`;
}
