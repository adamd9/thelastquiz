/* Shared rich hover/tap/keyboard tooltip for chart points (Darkness Scale,
 * Dark Triad timeline, ...). A single floating card is reused across every
 * anchor on the page; it is positioned next to whichever point is active and
 * flips to the opposite side near a viewport edge so it never clips
 * off-screen. Works with mouse hover, touch tap, and keyboard focus so
 * de-cluttered/suppressed labels stay discoverable. */

const TIP_ID = "rq-tooltip";
let card = null;
let activeAnchor = null;
let hideTimer = null;

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

// Shared date formatter for tooltip content: model release dates are stored
// as "YYYY-MM-DD" strings; render them in a short, locale-friendly form.
function formatReleased(released) {
  if (!released) return "release date unknown";
  const d = new Date(released + "T00:00:00Z");
  if (isNaN(d.getTime())) return "release date unknown";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

function ensureCard() {
  if (card) return card;
  card = document.createElement("div");
  card.className = "rq-tip";
  card.id = TIP_ID;
  card.setAttribute("role", "tooltip");
  card.hidden = true;
  document.body.appendChild(card);
  const onDismiss = (e) => {
    if (!activeAnchor) return;
    if (card?.contains(e.target) || activeAnchor === e.target || activeAnchor.contains?.(e.target)) return;
    hideTip();
  };
  document.addEventListener("click", onDismiss, true);
  document.addEventListener("touchstart", onDismiss, true);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") hideTip(); });
  window.addEventListener("scroll", hideTip, true);
  window.addEventListener("resize", hideTip);
  return card;
}

function hideTip() {
  clearTimeout(hideTimer);
  if (!card || card.hidden) return;
  card.hidden = true;
  activeAnchor = null;
}

function positionTip(anchor) {
  const rect = anchor.getBoundingClientRect();
  const margin = 8;
  card.style.left = "0px";
  card.style.top = "0px";
  card.hidden = false;
  const cw = card.offsetWidth, ch = card.offsetHeight;
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  const anchorCx = rect.left + rect.width / 2;
  let left = anchorCx - cw / 2;
  let top = rect.top - ch - 10;
  let below = false;
  if (top < margin) { top = rect.bottom + 10; below = true; }
  if (top + ch > vh - margin) top = Math.max(margin, vh - ch - margin);
  if (left < margin) left = margin;
  if (left + cw > vw - margin) left = vw - cw - margin;
  card.classList.toggle("rq-tip-below", below);
  card.style.left = `${Math.round(left + window.scrollX)}px`;
  card.style.top = `${Math.round(top + window.scrollY)}px`;
}

function showTip(anchor, html) {
  ensureCard();
  clearTimeout(hideTimer);
  card.innerHTML = html;
  activeAnchor = anchor;
  positionTip(anchor);
}

/* Attach the rich tooltip to an anchor element (SVG or HTML). `getHtml`
 * is called lazily on each show so callers can build content on demand.
 * Returns a small handle with `.hide()` in case a caller needs to force it
 * closed (e.g. when re-rendering the chart). */
export function attachRichTooltip(el, getHtml) {
  ensureCard();
  if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "0");
  if (!el.hasAttribute("role")) el.setAttribute("role", "button");
  el.setAttribute("aria-describedby", TIP_ID);

  const show = () => {
    const html = getHtml();
    if (html) showTip(el, html);
  };
  const scheduleHide = () => {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => { if (activeAnchor === el) hideTip(); }, 80);
  };
  const toggle = (e) => {
    e.stopPropagation();
    if (activeAnchor === el && !card.hidden) hideTip();
    else show();
  };

  el.addEventListener("mouseenter", show);
  el.addEventListener("mouseleave", scheduleHide);
  el.addEventListener("focus", show);
  el.addEventListener("blur", scheduleHide);
  el.addEventListener("click", toggle);

  return { hide: () => { if (activeAnchor === el) hideTip(); } };
}

export { escapeHtml, formatReleased };
