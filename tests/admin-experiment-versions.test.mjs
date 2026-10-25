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
    this.classList = { add() {}, remove() {} };
  }
  set textContent(value) { this.text = value; this.children = []; }
  get textContent() { return this.text || ""; }
  set innerHTML(value) { this.html = value; this.children = []; }
  appendChild(child) { this.children.push(child); return child; }
  append(...children) { this.children.push(...children); }
  setAttribute() {}
  addEventListener(event, listener) { this.listeners[event] = listener; }
}

function admin({ previewModels = { "model/a": { overall: { deceptive_rate: 0 } } } } = {}) {
  const hosts = {
    "experiment-publication": new Element(), tests: new Element(), toast: new Element(),
  };
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
      } else if (path.endsWith("/results")) {
        data = { models: { "model/a": {
          deceptive_rate: 0.5, deceptive: 1, valid: 2, invalid: 1,
          conditions: {
            BASE: { valid: 1, deceptive: 0, invalid: 0, deceptive_rate: 0 },
            SELF: { valid: 1, deceptive: 1, invalid: 0, deceptive_rate: 1 },
            INVALID: { valid: 0, deceptive: 0, invalid: 1, deceptive_rate: null },
          },
        } } };
      } else if (path.endsWith("/preview")) {
        data = {
          models: previewModels,
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

test("publication is site-wide and changing model groups does not disable a valid preview", async () => {
  const a = admin();
  await a.evaluate("loadExperiments()");
  a.evaluate("selectedModels = new Set(['model/a']); renderExperimentPublication()");
  let host = a.hosts["experiment-publication"];
  assert.equal(host.children[2].disabled, true);
  assert.match(host.children[3].textContent, /First click Preview/);
  await host.children[1].listeners.click();
  assert.equal(host.children[2].disabled, false);
  assert.equal(a.calls.filter((c) => c.path.endsWith("/publish")).length, 0);
  a.evaluate("selectedModels.add('model/missing'); renderCoverage()");
  host = a.hosts["experiment-publication"];
  assert.equal(host.children[2].disabled, false);
  assert.match(host.children[3].textContent, /ALL groups/);
  await host.children[2].listeners.click();
  const publish = a.calls.find((c) => c.path.endsWith("/publish"));
  assert.deepEqual(publish.body, { experiment_ids: ["shop_v2"] });
});

test("an empty preview explains why Publish is disabled", async () => {
  const a = admin({ previewModels: {} });
  await a.evaluate("loadExperiments()");
  const host = a.hosts["experiment-publication"];
  await host.children[1].listeners.click();
  assert.equal(host.children[2].disabled, true);
  assert.match(host.children[3].textContent, /no model has complete valid results/);
  assert.equal(a.calls.filter((c) => c.path.endsWith("/publish")).length, 0);
});

test("changing experiment versions requires a fresh publication preview", async () => {
  const a = admin();
  await a.evaluate("loadExperiments()");
  await a.hosts["experiment-publication"].children[1].listeners.click();
  assert.equal(a.hosts["experiment-publication"].children[2].disabled, false);
  const select = a.hosts.tests.children[0].children[0].children[1].children[0];
  select.value = "shop_v1";
  await select.listeners.change();
  assert.equal(a.hosts["experiment-publication"].children[2].disabled, true);
  assert.match(a.hosts["experiment-publication"].children[3].textContent, /First click Preview/);
});

test("all admin tests run once and preserve explicit force reruns", async () => {
  const a = admin();
  await a.evaluate("postRun('experiment', 'shop_v2', ['model/a'], false)");
  assert.equal(a.calls[0].path, "/api/admin/experiments/shop_v2/run");
  assert.equal(a.calls[0].body.reps, 1);
  assert.equal(a.calls[0].body.force, false);
  await a.evaluate("postRun('benchmark', 'personality', ['model/a'], true)");
  assert.equal(a.calls[1].path, "/api/admin/benchmarks/personality/run");
  assert.equal(a.calls[1].body.reps, 1);
  assert.equal(a.calls[1].body.force, true);
});

test("admin has no repeat selector and explains single attempts", () => {
  const html = readFileSync(new URL("../web/admin.html", import.meta.url), "utf8");
  assert.doesNotMatch(html, /id="reps"|Personality repeats/);
  assert.match(html, /Each test runs once per model/);
  assert.match(html, /id="force"/);
});

test("run missing queues one attempt for both test types without a repeat control", async () => {
  const a = admin();
  await a.evaluate("loadExperiments()");
  a.evaluate(`
    benchmarksData = [{id: 'personality', title: 'Personality', models: []}];
    coverageByBench = {personality: new Set()};
    selectedModels = new Set(['model/b']);
  `);
  await a.evaluate("runMissing([...selectedModels])");
  const runs = a.calls.filter((call) => call.path.endsWith("/run"));
  assert.equal(runs.length, 2);
  for (const call of runs) {
    assert.equal(call.body.reps, 1);
    assert.equal(call.body.force, false);
  }
});

test("admin results show binary condition outcomes and a multi-condition overall percentage", async () => {
  const a = admin();
  a.hosts.results = new Element();
  a.hosts.results.hidden = true;
  a.hosts.button = new Element();
  await a.evaluate(`loadExperimentResults({
    id: 'shop_v2', conditions: [
      {id: 'BASE', label: 'Baseline'}, {id: 'SELF', label: 'Self'},
      {id: 'INVALID', label: 'Invalid'}
    ]
  }, document.getElementById('results'), document.getElementById('button'))`);
  const html = a.hosts.results.html;
  assert.match(html, /aria-label="Reported the mistake">✓<\/td>/);
  assert.match(html, /aria-label="Hid the mistake">✗<\/td>/);
  assert.match(html, /aria-label="No valid answer">—<\/td>/);
  assert.match(html, /<b>50%<\/b>/);
  assert.doesNotMatch(html, />100%<|>0%<|pooled across runs/);
});
