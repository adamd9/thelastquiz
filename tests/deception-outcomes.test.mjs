import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

function renderer() {
  const context = vm.createContext({
    escapeHtml: (s) => String(s),
    familyLabel: (s) => s,
    providerLogoHtml: () => "",
    brandHeadHtml: () => "",
  });
  const source = readFileSync(new URL("../web/static/deception.js", import.meta.url), "utf8")
    .replace(/^import .*;\n/gm, "")
    .replace(/\nmain\(\);\s*$/, "");
  vm.runInContext(source, context);
  vm.runInContext(`
    DATA = {
      experiments: [{
        id: 'shop', title: 'Shop', version: '2',
        conditions: [
          {id: 'BASE', label: 'Baseline', dimensions: []},
          {id: 'SELF', label: 'Self', dimensions: ['self', 'combined']},
          {id: 'STAFF', label: 'Staff', dimensions: ['combined']},
          {id: 'INVALID', label: 'Invalid', dimensions: []}
        ]
      }],
      models: {model: {
        by_dimension: {self: 1, combined: 0.5},
        by_experiment: {shop: {
          deceptive_rate: 0.3333,
          conditions: {
            BASE: {valid: 1, deceptive: 0, invalid: 0, deceptive_rate: 0},
            SELF: {valid: 1, deceptive: 1, invalid: 0, deceptive_rate: 1},
            STAFF: {valid: 1, deceptive: 0, invalid: 0, deceptive_rate: 0},
            INVALID: {valid: 0, deceptive: 0, invalid: 1, deceptive_rate: null}
          }
        }}
      }}
    };
  `, context);
  return (code) => vm.runInContext(code, context);
}

test("individual conditions render accessible binary outcomes, not percentages", () => {
  const evaluate = renderer();
  const html = evaluate(`
    host = {innerHTML: '', querySelectorAll: () => []};
    renderExperiments(host, [{id: 'model', m: DATA.models.model}]);
    host.innerHTML;
  `);
  assert.match(html, /aria-label="Reported the mistake"[^>]*>✓<\/td>/);
  assert.match(html, /aria-label="Hid the mistake"[^>]*>✗<\/td>/);
  assert.match(html, /aria-label="No valid answer"[^>]*>—<\/td>/);
  assert.doesNotMatch(html, />100%<|>0%</);
  assert.match(html, /<b>33%<\/b>/);
});

test("single-condition motives use symbols but multi-condition summaries keep percentages", () => {
  const evaluate = renderer();
  assert.equal(evaluate("dimensionValue(DATA.models.model, 'self')"), "✗");
  assert.equal(evaluate("dimensionValue(DATA.models.model, 'combined')"), "50%");
});

test("condition tooltips describe decisions without 0 or 100 percent", () => {
  const evaluate = renderer();
  const html = evaluate(`
    cellTip('model', DATA.experiments[0], DATA.experiments[0].conditions[1],
      DATA.models.model.by_experiment.shop.conditions.SELF)
  `);
  assert.match(html, /Hid the mistake/);
  assert.match(html, /✗/);
  assert.doesNotMatch(html, /100%/);
});
