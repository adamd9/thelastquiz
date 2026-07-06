/* Cross-links between the public rankings site and the app. Any
 * <a data-dest="app|rankings|admin"> is rewritten for the current host:
 *   - In production the bare apex ((the)?lastquiz.net) serves the rankings and
 *     app.<apex> serves the app + admin, so links resolve to the right host
 *     (e.g. on the apex, "Run your own quiz" -> https://app.thelastquiz.net/).
 *   - Anywhere else (localhost, a *.pages.dev preview), it falls back to
 *     path-based routing (/, /rankings, /admin).
 * Host-derived, so no per-environment config is needed. */
(function () {
  var loc = window.location;
  // The SPA is hosted on Cloudflare Pages, but the API lives on Azure
  // (thelastquiz.drop37.com). Point absolute API calls there in production;
  // stay same-origin locally and on the backend host itself.
  window.API_BASE = /(^|\.)(the)?lastquiz\.net$/i.test(loc.hostname)
    ? "https://thelastquiz.drop37.com"
    : "";

  function destUrl(dest) {
    var loc = window.location;
    // Production hosts: the bare apex ((the)?lastquiz.net) serves the public
    // rankings; app.<apex> serves the app + admin. A rankings.<apex> host (if
    // present) is treated the same. Everything else uses path-based routing.
    var prod = loc.hostname.match(/^(?:(?:app|rankings)\.)?((?:the)?lastquiz\.net)$/i);
    if (prod) {
      var rankings = loc.protocol + "//" + prod[1] + "/";
      var app = loc.protocol + "//app." + prod[1] + "/";
      if (dest === "rankings") return rankings;
      if (dest === "admin") return app + "admin";
      return app;
    }
    if (dest === "rankings") return "/rankings";
    if (dest === "admin") return "/admin";
    return "/";
  }

  function apply() {
    var links = document.querySelectorAll("a[data-dest]");
    for (var i = 0; i < links.length; i++) {
      links[i].setAttribute("href", destUrl(links[i].getAttribute("data-dest")));
    }
  }

  // Exposed so scripts building links dynamically can resolve destinations too.
  window.__destUrl = destUrl;

  if (document.readyState !== "loading") apply();
  else document.addEventListener("DOMContentLoaded", apply);
})();
