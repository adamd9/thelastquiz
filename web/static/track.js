/* First-party, cookieless engagement beacons for The Last Quiz.
 *
 * Privacy-first: honours Do Not Track, stores only an ephemeral session id in
 * sessionStorage (cleared when the tab closes — NOT a cross-site identifier),
 * sends no PII, and is fire-and-forget so it never blocks or breaks the page.
 * Posts to the API (window.API_BASE, set by site-links.js) at POST /api/events,
 * where an allow-list bounds what can be recorded.
 *
 * Loaded as a classic script AFTER site-links.js, so it exposes window.tlqTrack
 * for module code (rankings.js / app) to call for custom events. */
(function () {
  var DNT =
    navigator.doNotTrack === "1" ||
    window.doNotTrack === "1" ||
    navigator.msDoNotTrack === "1";

  function sessionId() {
    try {
      var key = "tlq_sid";
      var v = sessionStorage.getItem(key);
      if (!v) {
        v = Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
        sessionStorage.setItem(key, v);
      }
      return v;
    } catch (e) {
      return "";
    }
  }

  function refHost() {
    try {
      return document.referrer ? new URL(document.referrer).host : "";
    } catch (e) {
      return "";
    }
  }

  window.tlqTrack = function (event, detail) {
    if (DNT) return;
    try {
      var base = (typeof window !== "undefined" && window.API_BASE) || "";
      var body = JSON.stringify({
        event: event,
        path: location.pathname + (location.hash || ""),
        ref: refHost(),
        session: sessionId(),
        detail: detail || null,
      });
      // fetch + keepalive is CORS-friendly (our API allow-lists the origins) and
      // survives navigation, which sendBeacon's JSON body can't do cross-origin.
      fetch(base + "/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body,
        keepalive: true,
        mode: "cors",
        credentials: "omit",
      }).catch(function () {});
    } catch (e) {
      /* never break the page */
    }
  };

  function firePageview() {
    window.tlqTrack("pageview");
  }
  if (document.readyState !== "loading") firePageview();
  else document.addEventListener("DOMContentLoaded", firePageview);
})();
