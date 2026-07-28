/* The Last Quiz — public site feature flags.
 *
 * Single source of truth for OPTIONAL promotional surfaces on the public
 * rankings site (home, rankings, guides and the article pages). Loaded
 * synchronously in <head> BEFORE first paint so gated elements never flash in
 * and then disappear.
 *
 * By default the public site is a pure rankings site: every "create your own
 * quiz" call-to-action, hero and idea card is hidden. Flip a flag below and
 * redeploy to bring that surface back.
 *
 *   createQuiz — the "make your own quiz" CTAs, heroes and idea cards that link
 *                to the app. Off = the site is just the rankings.
 *
 * How gating works:
 *   - Mark any element belonging to a flagged surface with a data attribute
 *     (createQuiz -> data-create). When the flag is off, the injected stylesheet
 *     below hides it site-wide (works for elements added dynamically too).
 *   - Scripts that build markup at runtime can also read
 *     window.FEATURES.<flag> to skip rendering the surface entirely.
 */
(function () {
  "use strict";

  var FEATURES = {
    // Set to true to re-enable the "create your own quiz" CTAs, heroes and
    // idea cards across the public site.
    createQuiz: false,
  };

  window.FEATURES = FEATURES;

  // Collect the selectors for every surface whose flag is off, then hide them
  // with a single injected stylesheet. This runs during <head> parsing, so the
  // rule is in place before the body is painted (no flash-of-CTA).
  var hide = [];
  if (!FEATURES.createQuiz) hide.push("[data-create]");

  if (hide.length) {
    var style = document.createElement("style");
    style.setAttribute("data-feature-flags", "");
    style.textContent = hide.join(",") + "{display:none !important}";
    (document.head || document.documentElement).appendChild(style);
  }
})();
