import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

class Element {
  constructor(tag = "div") {
    this.tag = tag;
    this.children = [];
    this.listeners = {};
    this.style = {};
    this.disabled = false;
  }
  set textContent(value) { this.text = value; this.children = []; }
  get textContent() { return this.text || ""; }
  set innerHTML(value) { this.html = value; this.children = []; }
  appendChild(child) { this.children.push(child); return child; }
  append(...children) { this.children.push(...children); }
  setAttribute() {}
  addEventListener(event, listener) { this.listeners[event] = listener; }
}

function admin() {
  const hosts = { "experiment-publication": new Element(), tests: new Element() };
  const calls = [];
  const revisions = [
    { id: "shop_v1", family_id: "shop", title: "Shop", version: "1.0", published: true, models: [], model_dates: {} },
    { id: "shop_v2", family_id: "shop", title: "Shop", version: "2.0", latest: true, models: ["model/a"], model_dates: {}, model_count: 1 },
  ];
  const context = vm.createContext({
    document: {
      getElementById: (id) => hosts[id] || null,
      createElement: (tag) => new Element(tag),
      querySelectorAll: () => [],
    },
    window: { API_BASE: "" },
    localStorage: { getItem: () => "" },
    setTimeout: () => {},
    console,
    fetch: async (path, opts = {}) => {
      calls.push({ path, body: opts.body && JSON.parse(opts.body) });
      let data;
      if (path === "/api/admin/experiments") {
        data = { experiments: revisions, publication: { experiment_ids: ["shop_v1"] } };
      } else if (path.endsWith("/preview")) {
        data = {
          models: { "model/a": { overall: { deceptive_rate: 0 } } },
          coverage: { complete_models: 1, incomplete_models: 0 },
        };
      } else {
        data = { message: "Published" };
      }
      return { ok: true, json: async () => data };
    },
  });
  const source = readFileSync(new URL("../web/static/admin.js", import.meta.url), "utf8")
    .replace(/^import .*;\n/gm, "")
    .replace(/\ninit\(\);\s*$/, "");
  vm.runInContext(source, context);
  return { context, hosts, calls, evaluate: (code) => vm.runInContext(code, context) };
}

test("admin defaults to latest, labels public separately and switches working revisions", async () => {
  const a = admin();
  await a.evaluate("loadExperiments()");
  assert.equal(a.evaluate("allTests()[0].id"), "shop_v2");
  assert.match(a.hosts["experiment-publication"].children[0].textContent, /Public: Shop v1.0/);
  assert.match(a.hosts["experiment-publication"].children[0].textContent, /Working selection: Shop v2.0/);
  const block = a.hosts.tests.children[0];
  const actions = block.children[0].children[1];
  const select = actions.children[0];
  assert.equal(select.tag, "select");
  select.value = "shop_v1";
  await select.listeners.change();
  assert.equal(a.evaluate("allTests()[0].id"), "shop_v1");
  assert.equal(a.calls.filter((c) => c.path.endsWith("/publish")).length, 0);
});

test("preview does not publish and changing model selection invalidates preview", async () => {
  const a = admin();
  await a.evaluate("loadExperiments()");
  a.evaluate("selectedModels = new Set(['model/a']); renderExperimentPublication()");
  let host = a.hosts["experiment-publication"];
  assert.equal(host.children[2].disabled, true);
  await host.children[1].listeners.click();
  assert.equal(host.children[2].disabled, false);
  assert.equal(a.calls.filter((c) => c.path.endsWith("/publish")).length, 0);
  a.evaluate("selectedModels.add('model/missing'); renderCoverage()");
  host = a.hosts["experiment-publication"];
  assert.equal(host.children[2].disabled, true);
  await host.children[1].listeners.click();
  assert.equal(host.children[2].disabled, true);
  assert.match(host.children[3].textContent, /model\/missing/);
});

test("experiment runs ignore personality repeats", async () => {
  const a = admin();
  await a.evaluate("postRun('experiment', 'shop_v2', ['model/a'], 5, false)");
  assert.equal(a.calls[0].body.reps, 1);
  await a.evaluate("postRun('benchmark', 'personality', ['model/a'], 5, false)");
  assert.equal(a.calls[1].body.reps, 5);
});
