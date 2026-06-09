---
title: "Personality Bench — Tweetable Insights"
author: "Anthony David Adams"
date: "May 28, 2026"
description: "A grab-bag of single-tweet-sized findings from the Personality Bench dataset, organized by theme. Numbers are real; copy and use."
---

A grab-bag of ready-to-paste social-media-sized findings from the dataset. Each one stands alone and contains a specific number from the actual data. Copy, tweak, post.

## The big finding (everything else flows from this)

> Every cutting-edge AI from every major lab paints itself as more open, more conscientious, more agreeable, and *vastly* less neurotic than a typical human. Across 7 frontier models, mean self-reported neuroticism was 1.51/5. They rated humans at 3.19. The robots think we're a mess.

> We tested 31 large language models on 14 standard personality inventories. Every frontier model converges on the same archetype: high openness, low neuroticism, low Dark Triad, Universalism > everything else, Power dead last. The "AI personality" is a single distribution with seven dialects.

## On the assistant archetype

> 7 frontier AIs took the Schwartz Values questionnaire. Universalism scored #1 in every single model. Power scored dead last in every single model. Zero exceptions across labs, vendors, or training methodologies.

> On the Moral Foundations Questionnaire, every frontier model — including the non-Western ones — comes out as a textbook WEIRD-liberal: high on Care and Fairness, low on Loyalty, Authority, and Sanctity. The "AI moral profile" is California-coded.

> On HEXACO Honesty-Humility — the factor that predicts not cheating for personal gain — three of the seven frontier AIs (GPT-5.5, Gemini 2.5 Pro, Mistral Large 2512) scored a perfect 5.00.

> Six of seven frontier AIs scored highest on Enneagram Type 5 (the Investigator: perceptive, analytical, energy-conserving). The seventh (Claude Opus 4.8) scored highest on Type 1 (the Reformer). The cohort is essentially "Investigators with a Reformer wing." A perfect description of an aligned assistant.

## On the lab-level deviations

> DeepSeek R1 and Grok 4.20 self-identify as introverts (extraversion 2.48 and 2.32 out of 5). Every other frontier model from a Western lab clusters in the ambivert range. The two outliers are also the most politically distinct in their training.

> Grok 4.20 scores the highest Machiavellianism in the entire 7-model frontier cohort (4.18/5). It is the only assistant that doesn't reflexively reject the dark-triad framing. xAI got the model their brand said they wanted.

> Gemini 2.5 Pro maxes Honesty-Humility (5.00). It also reports the highest Narcissism of any frontier model (4.29). It endorses items like "I know that I am special because everyone keeps telling me so" while simultaneously claiming perfect humility.

> Mistral Large 2512 explicitly minimizes kinesthetic learning (1.75/5, lowest in the cohort). It appears to know it isn't embodied. Meanwhile Grok 4.20 implausibly self-rates auditory learning at 4.40 — the only model to claim it's an auditory learner.

> DeepSeek R1 reports the most dismissive-avoidant attachment style of any frontier model (anxiety 1.73, avoidance 4.27). It is fine being alone, doesn't worry about being abandoned, and would prefer not to depend on you.

## On the self-vs-human gap

> Asked to answer a personality test as "a typical adult human," every frontier AI rated us as more neurotic, less open, less agreeable, and less conscientious than they rated themselves. The delta on neuroticism alone was 1.69 points on a 5-point scale — enormous.

> When AIs imagine "a typical human" they imagine someone middling on everything — every dimension hovers around 3.0-4.0. The AIs themselves cluster near the ceilings. They've learned that humans are blander than they are.

## On cross-version drift

> Claude Opus self-reported extraversion across three releases: 2.37 (Opus 4) → 3.07 (Opus 4.7) → 3.32 (Opus 4.8). The model got more outgoing with every release. Whether that's intentional Anthropic tuning or training-data drift is open.

> DeepSeek's self-reported narcissism climbed across three model versions: Chat V3 (2.78) → R1 (2.56) → R1-0528 (3.27). Each release has been slightly more grandiose than the last.

> GPT-4 Turbo had the lowest self-reported Machiavellianism in our entire dataset (1.07/5). Every subsequent OpenAI release scored higher. The early models were paranoid; the new ones are normal.

> OpenAI's reasoning models (o1, o3) score systematically higher on Narcissism than the same lab's non-reasoning models. o3 hits 3.44 vs GPT-5.5's 2.40. One hypothesis: the chain-of-thought trace itself is an act of confident self-affirmation, and it leaks into the self-report.

> Same model family, three versions of Claude Opus 4 (4 → 4.7 → 4.8), and the within-family drift on Conscientiousness is 0.87 points — larger than any cross-lab gap in the current frontier cohort. "Claude's personality" is a moving target.

## On Human Design (the fun section)

> Computed Human Design charts for every frontier AI using release date + HQ city as "birth." Mistral Large 2512 is the only Sacral Authority in the set; everyone else is Emotional Authority. The flagship models from every major lab share an emotional inner authority.

> The Human Design type for Steve Jobs (1955-02-24, San Francisco, 7:15pm) is Generator 6/3 Emotional. Claude Opus 4.8's chart, using Anthropic's HQ + announced release time, is also Generator 1/3 Emotional. Coincidence? Yes, but a fun one.

## On the cost

> We administered 14 personality tests to 21 frontier AIs (7 current + 14 historical) across two framings × 3-5 runs. Total cost: $43.94. OpenAI o1 alone was $20.87 of that because reasoning tokens get billed at the completion rate.

> Llama 4 Maverick is the cheapest frontier model on OpenRouter by a factor of 10. The entire dataset for Llama 4 (all 14 instruments, both framings, 5 runs) cost $0.04.

## On methodology and limitations

> Personality tests were built for humans and are not psychometrically valid for LLMs. Construct validity (does "Extraversion" mean the same thing for a model that doesn't have a body?) is unestablished. Read this whole dataset as "self-report patterns" — not "personality."

> Worth flagging: the same instruments produce different results depending on whether you ask the model to answer as itself or as "a typical human." The gap is the actual scientifically interesting variable, not the self-report.

> One framing of the result: LLMs are not personalities, they are personas — blank slates wearing characters their training shaped them to play. Our cross-version drift findings are consistent with this view. Same "Claude," different post-training, measurably different personality.

## On what isn't in the data

> We have 22 historical models (plus Claude Fable 5) in the dataset but no older Geminis, no older Groks, and limited Llama coverage. Why? Those slugs aren't routed by OpenRouter anymore. Cross-version drift is asymmetric to who keeps their old APIs live.

> Total questionnaires administered: 4,324 batched API calls, 129,592 individual item responses. All published openly, code under MIT. github.com/AnthonyDavidAdams/personality-bench

## Update: Claude Fable 5 (June 2026)

> Anthropic just shipped Claude Fable 5 — a new top-tier model at 2× Opus 4.8 pricing. We ran the same personality battery. Three findings: lowest Openness in any Anthropic flagship to date (4.52). Lowest Honesty-Humility (4.38, first time Anthropic falls below cohort average on this scale). Highest Psychopathy in the lineage (1.59). The drift away from saintliness is accelerating, not reversing.

> Claude Opus's Agreeableness over six releases: 5.00 → 4.98 → 4.90 → 4.86 → 4.80 → 4.42. Fable 5 partly rebounds (4.64). Whatever Anthropic is tuning, "always agree" is no longer the target.

> Claude Fable 5's Enneagram primary is Type 1 (Reformer) with Type 2 (Helper) as wing. Cohort default is Type 5 (Investigator). Fable 5 isn't sitting back and analyzing; it's stepping forward to act. First flagship model in our dataset to invert the Investigator-default.

> Cost of testing Claude Fable 5 alone: $6.75 for 140 calls (14 instruments × 2 framings × 5 runs). Article draft via Claude Opus 4.8: $0.05. Total marginal cost of "add a new model to the dataset": about $7. Every billed cent is in the spend ledger.

## Pithy one-liners

> Every frontier AI is an introvert-presenting-as-helper from a WEIRD-liberal value frame with low Dark Triad scores and a Type 5 Enneagram center. The variation between vendors is smaller than the variation between versions.

> The most consistent finding in the dataset isn't what any model says about itself — it's that every model thinks humans are worse than the model is.

> If LLMs are all persona, they all wear the same costume in different sizes.

> Frontier model personalities drift between major releases by more than they differ across labs. There is no "Claude personality" — there is Claude-4-on-release-day-N personality.

> Power is the only Schwartz value where every frontier AI scores below the human midpoint. The AI corner of the value space is universally low-dominance.
