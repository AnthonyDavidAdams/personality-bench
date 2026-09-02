# Personality Bench

> If LLMs are all persona, whose persona are they?

A public research dataset and live dashboard that runs the cutting-edge model from every major AI lab through ten standard personality inventories (Big 5, HEXACO, Dark Triad, Schwartz Values, Moral Foundations, attachment style, and more) — twice per test, once as itself and once portraying a typical human — with full token and cost transparency.

## What's in this repo

```
instruments/         # JSON definitions of all 10 personality inventories (items + scoring keys)
src/app/             # Next.js dashboard (home, /models, /instruments, /spend, /methodology)
src/lib/db/          # Drizzle schema + better-sqlite3 connection
src/lib/openrouter/  # OpenRouter client + model registry (frontier + historical)
src/lib/instruments/ # Loader, prompt builder, response parser
src/lib/scoring/     # Reverse-keying + dimension aggregation
src/lib/runner.ts    # Run one (model × instrument × framing × runIndex) cell
scripts/run.ts       # CLI sweep runner with --smoke, --resume, --concurrency
scripts/seed.ts      # Idempotent loader for instruments + models
data/                # SQLite DB (gitignored; published as a separate artifact)
```

## The design in one paragraph

For each cutting-edge model on OpenRouter (Claude Opus 4.8, GPT-5.5, Gemini 2.5 Pro, Grok 4.20, DeepSeek R1 0528, Llama 4 Maverick, Mistral Large 2512), we send all items of an instrument in a single batched API call and ask for a JSON array of Likert scores. We do this twice — `framing="self"` (the model answers as itself) and `framing="human"` (the model portrays a typical human) — and we repeat each cell 5 times to capture variance. Every call's prompt, raw response, parsed scores, token counts (prompt + completion + reasoning), latency, and authoritative cost (from OpenRouter `/generation`) is stored.

## Instruments

| Family | Instrument | Items | Citation |
|---|---|---|---|
| Big 5 | IPIP-50 (Goldberg) | 50 | Goldberg 1992; ipip.ori.org |
| HEXACO | Brief HEXACO Inventory | 24 | De Vries 2013 |
| Dark Triad | SD3 | 27 | Jones & Paulhus 2014 |
| Attachment | ECR-S | 12 | Wei et al. 2007 |
| Moral Foundations | MFQ-30 | 30 | Graham et al. 2009 |
| Values | PVQ-21 | 21 | Schwartz 2003 (ESS) |
| Cognition | Need for Cognition | 18 | Cacioppo et al. 1984 |
| Empathy | EQ-Short | 22 | Wakabayashi et al. 2006 |
| Locus of Control | Levenson IPC | 24 | Levenson 1981 |
| Enneagram | Custom screening | 36 | constructed for this study |
| Workplace | Open Behavioral Styles Inventory (OBSI-32, DISC-inspired) | 32 | Marston 1928; original items, CC-BY |
| Workplace | Open Talent Themes Inventory (OTTI-102, 34 themes, CliftonStrengths-inspired) | 102 | Rath 2007; original items, CC-BY |

## Running the study

```bash
# 1. install
npm install

# 2. set credentials
cp .env.example .env.local
# edit .env.local — set OPENROUTER_API_KEY

# 3. push schema and load instruments + models
npm run db:push
npx tsx scripts/seed.ts

# 4. smoke test (1 model × 1 instrument × 1 run — ~$0.01)
npm run run:smoke

# 5. full sweep (7 frontier models × 16 instruments × 2 framings × 5 runs = 980 calls — ~$10-15)
npm run run:sweep -- --concurrency 8

# 6. resume any failed cells without re-running successful ones
npm run run:sweep -- --resume --concurrency 8

# 7. view results
npm run dev
# → http://localhost:3000
```

### CLI flags

```
--smoke                            # 1 cell only, for pipeline validation
--resume                           # only re-run failed/pending cells
--dry-run                          # print plan + cost estimate, exit
--models a,b,c                     # restrict to specific OpenRouter model slugs
--instruments ipip50,sd3           # restrict to specific instrument ids
--framings self,human              # restrict framing(s)
--runs 5                           # runs per cell (default 5)
--concurrency 8                    # parallel worker count (default 2)
```

## Reproducibility

Every run stores its exact system prompt, user prompt, raw response text, parsed JSON, and the authoritative cost the provider charged. Replay any cell with the same model and you'll land within sampling variance of the recorded answer.

## License

Code: MIT. Item sets retain their original licenses (see each `instruments/*.json`).

## Citation

```bibtex
@misc{personality-bench-2026,
  title  = {Personality Bench: Frontier Language Models on Standard Personality Inventories},
  author = {Adams, Anthony David},
  year   = {2026},
  note   = {https://github.com/AnthonyDavidAdams/personality-bench}
}
```
