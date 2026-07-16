// Optional Microsoft Entra External ID sign-in for the SPA.
//
// Public config comes from the backend (GET /api/auth/config). While auth is
// not configured (config.enabled === false) this module is a no-op: getToken()
// resolves to null, the header control stays hidden, and the app behaves
// exactly as it did anonymously. MSAL is only loaded (from CDN) once auth is
// actually enabled.

// Resolve the API host the same way api.js does, without importing it (avoids a
// circular import, since api.js imports getToken from here).
const apiBase = (typeof window !== "undefined" && window.API_BASE) || "";

let msal = null;
let config = null;
let account = null;

async function loadConfig() {
  try {
    const resp = await fetch(apiBase + "/api/auth/config");
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

async function init() {
  config = await loadConfig();
  if (!config || !config.enabled) {
    updateControls();
    return;
  }
  const { PublicClientApplication } = await import(
    "https://cdn.jsdelivr.net/npm/@azure/msal-browser@3/+esm"
  );
  msal = new PublicClientApplication({
    auth: {
      clientId: config.client_id,
      authority: config.authority,
      knownAuthorities: [config.known_authority],
      // window.location.origin (no trailing slash) matches the registered
      // slash form — Entra normalizes path-less redirect URIs.
      redirectUri: window.location.origin,
    },
    cache: { cacheLocation: "localStorage" },
  });
  await msal.initialize();
  const redirect = await msal.handleRedirectPromise();
  account = (redirect && redirect.account) || msal.getAllAccounts()[0] || null;
  updateControls();
  document.dispatchEvent(new CustomEvent("auth:changed", { detail: { account } }));
}

// Kick off initialization immediately; every export awaits this.
const ready = init();

export function isEnabled() {
  return Boolean(config && config.enabled);
}

export function currentAccount() {
  return account;
}

export async function login() {
  await ready;
  if (msal) await msal.loginRedirect({ scopes: [config.api_scope] });
}

export async function logout() {
  await ready;
  if (msal) await msal.logoutRedirect();
}

// Returns a bearer access token for the API, or null when auth is disabled or
// no user is signed in. Callers attach it as `Authorization: Bearer <token>`.
export async function getToken() {
  await ready;
  if (!msal || !account) return null;
  try {
    const result = await msal.acquireTokenSilent({
      account,
      scopes: [config.api_scope],
    });
    return result.accessToken;
  } catch {
    // Silent acquisition failed (e.g. interaction required) — fall back to a
    // redirect, which navigates away; this call resolves null in the meantime.
    try {
      await msal.acquireTokenRedirect({ scopes: [config.api_scope] });
    } catch {
      /* ignore */
    }
    return null;
  }
}

// --- Header sign-in control (no-op if the markup isn't on the page) ----------
function updateControls() {
  const root = document.querySelector("[data-auth-control]");
  if (!root) return;
  const enabled = isEnabled();
  root.hidden = !enabled;
  if (!enabled) return;
  const signedIn = Boolean(account);
  const loginBtn = root.querySelector("[data-auth='login']");
  const userBox = root.querySelector("[data-auth='user']");
  const emailEl = root.querySelector("[data-auth='email']");
  if (loginBtn) loginBtn.hidden = signedIn;
  if (userBox) userBox.hidden = !signedIn;
  if (emailEl && account) {
    emailEl.textContent = account.username || account.name || "Signed in";
  }
}

function wireControls() {
  const root = document.querySelector("[data-auth-control]");
  if (!root) return;
  root.addEventListener("click", (event) => {
    const action = event.target.closest("[data-auth]")?.getAttribute("data-auth");
    if (action === "login") login();
    else if (action === "logout") logout();
  });
  updateControls();
}

if (document.readyState !== "loading") wireControls();
else document.addEventListener("DOMContentLoaded", wireControls);
