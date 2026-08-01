# The Last Quiz — SEO Plan

_Last updated: 2026-07-31_

## TL;DR

We rank **#1 for the quoted brand phrase** `"the last quiz" ai models personality`,
but we are **absent from page 1** for the natural query **“last quiz ai
personality”** and its variants. Two things are happening at once:

1. **We’re a brand-new site with almost no authority.** Google has only indexed
   **2 of our 6 pages** (`/` and `/dark-triad-ai`). The rest aren’t in the index yet.
2. **The head term is the wrong intent for us.** “AI personality quiz” almost
   always means *“a quiz that tells **you** which AI you are / reveals your
   personality.”* Our content answers the opposite question — *“do the **AI
   models** have a personality?”* Fighting for the generic term is low-ROI.

**Strategy:** stop chasing the generic head term head-on. Instead (a) get all
pages indexed, (b) **own our differentiated, high-intent long-tail**
(“do AI models have personality”, “ChatGPT MBTI”, “dark triad AI”, “ChatGPT vs
Claude personality”…), and (c) build the **“The Last Quiz” brand entity** so
Google recognises our name.

---

## 1. Where we stand (SERP audit — 2026-07-31, Google via Brave)

### Query: `last quiz ai personality`
We do **not** appear anywhere on page 1. The top organic results are all the
*“which AI are you / test your personality”* intent:

| # | Result | Host |
|---|--------|------|
| 1 | AI Personality Quiz — Jaimee | jaimee.ai |
| 2 | A.I. Personality Quiz | usfunds.com |
| 3 | Quiz: What’s Your AI-dentity? | bloomberg.com |
| 4 | Which AI Tool Are You? | open.edu |
| 5 | Free AI Personality Quiz Generator | makeform.ai |
| 6 | What’s your AI personality like? | ooopenlab.cc |
| 7 | Personality Test by Listen Labs | listenlabs.ai |
| 8 | Test Your AI’s Personality – 5 Fun Questions | reddit.com |

### Query: `the last quiz ai personality`
Still **absent** — Google ignores “the last” as a brand and serves the same
generic set. Our brand is **not yet an entity** in Google’s eyes.

### Query: `"the last quiz" ai models personality` (brand phrase quoted)
We rank **#1**: *“The Last Quiz: Do AI Models Have Personality? Dark Triad …”*
So the page is fine — the problem is **discovery, authority and intent**, not the page.

### Index coverage: `site:thelastquiz.net`
Only **2 pages indexed**:
- `https://thelastquiz.net/` — *“The Last Quiz: Do AI Models Have Personality? Dark Triad …”*
- `https://thelastquiz.net/dark-triad-ai` — *“Do AI Models Have a Dark Triad?”*

**Not yet indexed:** `/rankings`, `/guides`, `/big-five-ai`, `/mbti-ai`.

---

## 2. Root-cause diagnosis

| # | Cause | Evidence | Fixable? |
|---|-------|----------|----------|
| 1 | **New domain, ~0 authority** (site ~1 week old, no backlinks) | 2/6 pages indexed; absent for competitive terms | Slow — needs links + time |
| 2 | **Search-intent mismatch** on the head term | Page-1 competitors all serve “which AI are you” | Yes — target the right queries |
| 3 | **Brand name collides with generic language** (“last quiz” reads as words, not a brand) | Unquoted brand query ignores “the last” | Yes — brand-entity work |
| 4 | **Weak in-body internal links** to article pages | Homepage body linked `/rankings#…`, articles only in footer → big-five/mbti not indexed | ✅ Fixed this session |
| 5 | **No dedicated share image** (OG/Twitter = the logo) | `og:image` = `/static/logo2.png` on every page | Yes — create 1200×630 image |

**What’s already good (keep it):** unique, keyword-rich titles + meta
descriptions per page; Open Graph + Twitter cards; rich JSON-LD (Organization,
WebSite, Article, FAQPage, CollectionPage, Dataset); correct canonicals;
`robots.txt` + `sitemap.xml`; fully static HTML (crawler-friendly). Our on-page
SEO is strong — the gaps are **off-page, indexing and intent.**

---

## 3. Strategy — what to target (and what to ignore)

**Ignore (for now):** the generic head term *“AI personality quiz”* / *“AI
personality test”* as a primary goal. It’s high-competition, wrong-intent, and
owned by high-authority sites (Bloomberg et al.).

**Own (our unique angle — genuinely the best answer on the web):**

- **Entity / question:** “do AI models have personality”, “does ChatGPT have a
  personality”, “AI personality traits”.
- **Framework + “AI” terms:** “AI Dark Triad”, “AI Big Five” / “AI big 5”,
  “AI Jungian” / “AI Jungian type”, “AI OCEAN”, “ChatGPT MBTI”.
- **Benchmark / rankings terms:** “AI personality benchmark”, “LLM personality
  benchmark”, “model personality benchmark”, “AI psychology rankings”.
- **Model + framework long-tail** (high intent, low competition):
  “what personality type is ChatGPT”, “Claude personality”,
  “Gemini personality type”, “is ChatGPT a psychopath”, “LLM personality”.
- **Comparisons:** “ChatGPT vs Claude personality”, “which AI is most
  agreeable / most neurotic / most manipulative”.
- **Brand:** “the last quiz”, “thelastquiz”.

### SERP competition for these terms (verified 2026-07-31) — they’re winnable

Unlike the generic head term, these clusters are **not** owned by high-authority
consumer sites. Live top-5 checks:

| Query | Who ranks now | Verdict |
|---|---|---|
| `ai dark triad` | PubMed papers, LinkedIn, Reddit, a newsletter | **Winnable** — no consumer competitor |
| `ai big five personality` | PubMed, Upwork (off-topic), small blogs | **Winnable** |
| `ai jungian type` | Reddit, Medium, Wikipedia (archetypes — wrong intent) | **Winnable** — content gap on “which type is the AI” |
| `model personality benchmark` | academic + **eqbench.com** (a real LLM leaderboard) | **Winnable** — one true competitor |
| `ai psychology rankings` | QS/US-News uni rankings (off-topic), llm-stats.com | Winnable but noisy intent |
| `llm personality benchmark` | arXiv, Nature, preprints, GitHub | Winnable — all academic, no friendly consumer page |

**Implication:** a clean, consumer-friendly page that says “benchmark” and names
the frameworks can outrank papers on readability + freshness + structured data.
We are `[us:false]` on all of them today only because the pages aren’t indexed yet.

**Build the brand entity** so unquoted brand queries resolve to us (see §4, P2).

---

## 4. Prioritised action plan

### P0 — This week (fast, high-impact)

- [ ] **Set up Google Search Console** for `thelastquiz.net` (DNS or the
      existing `track.js` won’t verify — use a DNS TXT or an HTML meta tag).
- [ ] **Submit `sitemap.xml`** in GSC and **“Request indexing”** for the 4
      un-indexed URLs: `/rankings`, `/guides`, `/big-five-ai`, `/mbti-ai`.
- [ ] **Set up Bing Webmaster Tools** (fast to import from GSC; also feeds
      ChatGPT/Copilot search).
- [x] **Strengthen homepage → article internal links.** The “More ways to read
      a machine’s mind” tiles now point at `/big-five-ai` and `/mbti-ai`
      (were `/rankings#…`), so the two un-indexed articles get a strong in-body
      link from our highest-authority page. _(done — `web/home.html`)_
- [x] **Add `BreadcrumbList` structured data** (Home › Guides › Article) to the
      three article pages for hierarchy + breadcrumb SERP display. _(done)_
- [x] **Reposition `/rankings` as a “benchmark.”** Title/description/OG now lead
      with “AI Personality Benchmark” and the `Dataset` schema carries
      `alternateName` + `keywords` (AI/LLM/model personality benchmark, AI
      psychology rankings). Targets an academic-only competitive field. _(done)_
- [x] **Add exact-phrase `keywords`** to the three article `Article` schemas
      (“AI Dark Triad”, “AI Big Five / big 5”, “AI Jungian type”…). _(done)_
- [ ] **Create a real 1200×630 share image** and point `og:image` /
      `twitter:image` at it (per page ideally). Boosts SERP thumbnail + social CTR.
- [ ] **Wire up favicons** — in progress (6 candidate SVGs in
      `web/static/favicons/`). Once a design is chosen, generate the icon set and
      add `<link rel="icon">` + `apple-touch-icon` to every page `<head>`; **no
      page references a favicon today.** Favicons show in Google mobile SERPs.

### P1 — Content & on-page (next 2–4 weeks)

> **Voice-gated:** every new or rewritten reader-facing sentence below must be
> written from the owner’s writing samples / voice fingerprint — not
> auto-generated. Hold the **content** items until voice samples land; the
> **structural** items are safe anytime.

**New content — build topical authority (each targets a verified low-competition cluster):**

- [ ] **“ChatGPT vs Claude vs Gemini — personality compared”** — new comparison
      page. Targets “ChatGPT vs Claude personality” and “which AI is most
      agreeable / neurotic / manipulative”. High intent, near-zero consumer competition.
- [ ] **Model-specific pages/sections**, each answering the query in the first
      100 words: “What is ChatGPT’s MBTI?” (extend `/mbti-ai`), “Is ChatGPT / any
      AI a psychopath?” (extend `/dark-triad-ai`), plus “Claude’s personality”
      and “Gemini’s personality”.
- [ ] **Methodology / “how we test” article** at its own indexable URL — strong
      E-E-A-T signal for a data/benchmark site.
- [ ] **“What is an AI personality benchmark?” explainer** feeding `/rankings` —
      owns the benchmark cluster where only academic pages currently compete.

**On-page structure (no new prose — safe anytime):**

- [ ] **Homepage H1/entity alignment.** Current H1 *“Does your favourite AI have
      a dark side?”* is catchy but off-keyword; add a secondary, crawlable `h2`
      that states the entity plainly (the sentence itself is voice-gated).
- [ ] **FAQ expansion** with the exact questions people type (“What MBTI is
      ChatGPT?”, “Which AI is the most manipulative?”) — we already use
      `FAQPage` schema; add the literal query phrasings.
- [ ] **Internal-link mesh:** every article links to the other two + rankings +
      “make your own”, with descriptive anchor text (not “read more”).

### P2 — Authority / off-page / brand (ongoing)

- [ ] **Brand-entity building:** create/claim **Wikidata**, **Crunchbase**, a
      **LinkedIn page**, and consistent “The Last Quiz” NAP everywhere; add
      `sameAs` links to the `Organization` JSON-LD pointing at those profiles.
- [ ] **Digital PR / linkable asset:** the live rankings are a genuine data
      story (“We gave every major AI a psychopathy test — here’s who scored
      worst”). Pitch to AI/tech newsletters, r/artificial, Hacker News, and
      journalists who cover AI (the Bloomberg/Conversation angle proves appetite).
- [ ] **Guest posts / mentions** on AI blogs linking to specific article pages
      with keyword anchors.
- [ ] **Get listed** in “AI tools” directories (mind the low-quality ones).

### P3 — Measurement (set up once, review monthly)

- [ ] Track in GSC: impressions/clicks/position for the target queries in §3.
- [ ] Track **index coverage** trend (goal: 6/6 pages, then growing).
- [ ] Track **branded vs non-branded** query split over time.

---

## 5. Keyword → page map

| Target query cluster | Intent | Best page | Status |
|---|---|---|---|
| do AI models have personality; AI personality traits | Informational | `/` (home) | Indexed |
| **AI Dark Triad**; dark triad AI; is ChatGPT a psychopath | Informational | `/dark-triad-ai` | Indexed |
| **AI Big Five** / AI big 5; ChatGPT OCEAN; LLM Big Five | Informational | `/big-five-ai` | **Needs indexing** |
| **AI Jungian type**; ChatGPT MBTI; what type is ChatGPT | Informational | `/mbti-ai` | **Needs indexing** |
| **AI personality benchmark**; LLM/model personality benchmark; **AI psychology rankings** | Benchmark / comparison | `/rankings` | **Needs indexing** |
| which AI is most agreeable / neurotic / manipulative | Comparison | `/rankings` | **Needs indexing** |
| understand AI personality tests | Hub | `/guides` | **Needs indexing** |
| make your own AI quiz; run a quiz across AI models | Transactional | `app.thelastquiz.net` | — |
| the last quiz | Brand | `/` | #1 (quoted only) |

---

## 6. Technical checklist

- [x] Unique `<title>` + meta description per page
- [x] Canonical URLs
- [x] Open Graph + Twitter cards
- [x] JSON-LD: Organization, WebSite, Article, FAQPage, CollectionPage, Dataset
- [x] `robots.txt` + `sitemap.xml`
- [x] Static, server-rendered HTML (no JS needed to read content)
- [x] `BreadcrumbList` on article pages _(added 2026-07-31)_
- [ ] Dedicated 1200×630 `og:image` (currently the logo)
- [ ] Favicon + `apple-touch-icon` linked on every page (none today; candidates in `web/static/favicons/`)
- [ ] `sameAs` links on `Organization` (Wikidata/LinkedIn/etc.)
- [ ] Google Search Console + Bing Webmaster verified, sitemap submitted
- [ ] `lastmod` in sitemap kept current on each deploy
- [ ] Consider `Person`/`author` E-E-A-T if a named author exists

---

## 7. Reality check on timeline

For a ~1-week-old domain, ranking movement on competitive terms takes **weeks to
months** even with everything right. The fastest wins are: **getting all 6 pages
indexed** (days, once GSC is set up + internal links are fixed) and **capturing
the low-competition long-tail** (“ChatGPT MBTI”, “dark triad AI”). Brand
recognition and authority for the head term are a **months-long** effort driven
by links and mentions, not on-page tweaks.
