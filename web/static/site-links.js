/* Cross-links between the two public subdomains (app.<domain> and
 * rankings.<domain>). Any <a data-dest="app|rankings|admin"> is rewritten to
 * the right URL for the current host:
 *   - On a production subdomain (app.* / rankings.*), it swaps to the sibling
 *     subdomain, e.g. rankings.thelastquiz.net -> https://app.thelastquiz.net/.
 *   - Anywhere else (localhost, a bare domain, a preview host), it falls back
 *     to path-based routing (/, /rankings, /admin).
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
    var m = loc.hostname.match(/^(app|rankings)\.(.+)$/);
    if (m) {
      var port = loc.port ? ":" + loc.port : "";
      var domain = m[2] + port;
      if (dest === "rankings") return loc.protocol + "//rankings." + domain + "/";
      if (dest === "admin") return loc.protocol + "//app." + domain + "/admin";
      return loc.protocol + "//app." + domain + "/";
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
