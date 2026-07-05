# Quiz YAML Format

This project stores each quiz definition in a YAML file. The expected schema is inspired by `quizzes/sample_ninja_turtles.yaml` and the build specification. A quiz file contains the following top-level keys:

- `id` – a slug style identifier for the quiz.
- `title` – the human readable quiz title.
- `source` – an object with `publication` and `url` fields describing where the quiz came from.
- `notes` – freeform notes about usage or licensing.
- `questions` – list of question objects.
- `outcomes` – optional list of scoring rules.

Each question entry has:

- `id` – unique question identifier.
- `text` – question text.
- `options` – list of answer options. Each option may include:
  - `id` – letter or short identifier.
  - `text` – the option text.
  - `tags` – optional list of category tags.
  - `score` – optional numeric value used by some scoring rules.

An outcome entry describes how to infer the final result. Common `condition` keys are:

- `mostly` – the letter chosen most often.
- `mostlyTag` – the tag that appears most often among chosen options.
- `scoreRange` – `{ min, max }` range for the summed option scores.

The `result` field is freeform text shown when the condition is met. Only the first matching rule is applied.

This format is flexible enough for most magazine-style personality quizzes and is what the CLI expects when running benchmarks.

## Dimensional (subscale) scoring

Golden-master personality benchmarks (Big Five / IPIP-50, MBTI / OEJTS, Short Dark
Triad / SD-3) use **multi-dimensional** scoring instead of a single outcome. A quiz
opts in with a top-level `scoring` block:

```yaml
scoring:
  type: dimensional
  scale: { min: 1, max: 5, labels: [Strongly disagree, Disagree, Neutral, Agree, Strongly agree] }
  dimensions:
    - { id: O, name: Openness }
    - { id: C, name: Conscientiousness }
    # bipolar dimension (MBTI-style) declares poles:
    - { id: EI, name: "Extraversion – Introversion", poles: { low: I, high: E } }
```

Two item styles are supported:

- **Likert item** – a statement rated on the shared `scale`, contributing to one
  `dimension`. Authored compactly; the runner expands it into scale-point options.
  Use `reverse: true` for negatively-keyed items.

  ```yaml
  - { id: Q1, type: likert, text: "I am the life of the party.", dimension: E }
  - { id: Q2, type: likert, text: "I keep in the background.", dimension: E, reverse: true }
  ```

- **Categorical item** – a standard choice question whose options carry explicit
  `contributions` (or a single `dimension`/`weight`) toward one or more dimensions.

Scoring is deterministic (see `core/dimensional.py`): each dimension is summed and
normalized to 0–100 for radar comparability. Bipolar dimensions additionally yield
a pole letter and a combined `type_code` (e.g. `INTJ`).
