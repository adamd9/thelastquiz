import assert from "node:assert/strict";
import test from "node:test";
import {
  buildModelGroups,
  CLASSIC_MODELS,
  FRONTIER_MODELS,
  GLOBAL_LEADERS,
  HLE_MODELS,
  OSS_MODELS,
  UNRESTRICTED_MODELS,
} from "../web/static/model-groups.js";

const editorialGroups = [
  ["classics", CLASSIC_MODELS],
  ["frontier", FRONTIER_MODELS],
  ["hle", HLE_MODELS],
  ["oss", OSS_MODELS],
  ["unrestricted", UNRESTRICTED_MODELS],
  ["global-leaders", GLOBAL_LEADERS.flatMap((block) => block.models)],
];
const idsOf = (models) => [...new Set(models.map((m) => m.id).filter(Boolean))];
const allIds = idsOf(editorialGroups.flatMap(([, models]) => models));
const availableModel = (id) => ({ id, available: true });

test("editorial groups use exact curated IDs and order, regardless of catalogue order", () => {
  const models = [...allIds].reverse().map(availableModel);
  models.push(...models.slice(0, 3));
  const groups = buildModelGroups(models);
  for (const [id, curated] of editorialGroups) {
    assert.deepEqual(groups.find((g) => g.id === id).modelIds, idsOf(curated), id);
  }
});

test("names, descriptions, aliases and new sibling IDs never add editorial members", () => {
  const impostors = [
    "unreviewed/uncensored-dolphin-hermes-abliterated",
    "nousresearch/hermes-99",
    "openai/gpt-4o-mini",
    "deepseek/deepseek-future",
    "anthropic/claude-sonnet-future",
    "google/gemini-future",
    "x-ai/grok-future",
    "meta-llama/llama-future",
    ...allIds.flatMap((id) => [`${id}:free`, `${id}:batch`, `~${id}`, `${id}-new`]),
  ].map((id) => ({
    ...availableModel(id),
    name: "Uncensored flagship",
    description: "Dolphin, Hermes, Venice, MythoMax, frontier and classic models.",
  }));
  const groups = buildModelGroups(impostors);
  for (const [id] of editorialGroups) {
    assert.equal(groups.find((g) => g.id === id), undefined, id);
  }
});

test("unavailable or missing curated models are omitted without substitution", () => {
  const models = allIds.map((id, i) => ({ id, available: i % 2 === 0 }));
  models.splice(0, 1);
  const present = new Set(models.filter((m) => m.available).map((m) => m.id));
  const groups = buildModelGroups(models);
  for (const [id, curated] of editorialGroups) {
    const expected = idsOf(curated).filter((modelId) => present.has(modelId));
    const group = groups.find((g) => g.id === id);
    if (expected.length < 2) assert.equal(group, undefined, id);
    else assert.deepEqual(group.modelIds, expected, id);
  }
});

test("the researched unrestricted lineup is explicit and retains legacy comparisons", () => {
  assert.deepEqual(idsOf(UNRESTRICTED_MODELS), [
    "thedrummer/cydonia-24b-v4.1",
    "nousresearch/hermes-4-405b",
    "cognitivecomputations/dolphin-mistral-24b-venice-edition",
    "nousresearch/hermes-3-llama-3.1-70b",
    "nousresearch/hermes-3-llama-3.1-405b",
    "gryphe/mythomax-l2-13b",
  ]);
  for (const [, models] of editorialGroups) {
    assert.equal(idsOf(models).length, models.filter((m) => m.id).length);
    assert(models.every((m) => m.id === null || m.id.includes("/")));
  }
  assert([...CLASSIC_MODELS, ...UNRESTRICTED_MODELS].every((m) => m.note));
});

test("rankings without prices retain editorial groups; price groups remain objective", () => {
  const models = allIds.map(availableModel);
  const groups = buildModelGroups(models);
  assert.equal(groups.find((g) => g.id === "cheapest"), undefined);
  assert.equal(groups.find((g) => g.id === "premium"), undefined);
  const priced = buildModelGroups([
    { ...availableModel("test/expensive"), pricing: { completion: "0.00001" } },
    { ...availableModel("test/cheap"), pricing: { completion: "0.000001" } },
  ]);
  assert.deepEqual(priced.find((g) => g.id === "cheapest").modelIds, [
    "test/cheap", "test/expensive",
  ]);
  assert.deepEqual(priced.find((g) => g.id === "premium").modelIds, [
    "test/expensive", "test/cheap",
  ]);
});

test("empty catalogues and single-member groups are not displayed", () => {
  assert.deepEqual(buildModelGroups([]), []);
  assert.deepEqual(buildModelGroups(), []);
  assert.deepEqual(buildModelGroups([availableModel(UNRESTRICTED_MODELS[0].id)]), []);
});
