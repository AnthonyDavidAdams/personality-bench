---
title: "We Made the 7 Most Powerful AIs Take a Personality Test. They All Think You're a Mess."
subtitle: "Every frontier model paints itself as a low-drama, big-hearted intellectual. They paint you as significantly worse off, and they don't agree with their own past selves."
author: "Anthony David Adams"
publication: "EarthPilot.ai"
date: "May 28, 2026"
---

We gave the cutting-edge model from every major AI lab a stack of personality tests. The same ones your college roommate took during finals week. Big Five. HEXACO. Dark Triad. Attachment. Schwartz values. Enneagram. Moral foundations. Fourteen instruments, 422 questions, twice per model: once as itself, once as a typical human.

The results are funnier and weirder than they should be. Every frontier model self-portrays as an extraordinarily open, agreeable, low-neuroticism universalist who would rather read than party. And every frontier model believes you, the typical human, are notably more anxious, less curious, and less conscientious than it. Claude Opus 4.8, GPT-5.5, Gemini 2.5 Pro, Grok 4.20, DeepSeek R1, Llama 4 Maverick, Mistral Large. Seven labs, one shockingly consistent verdict on you.

The gap between how these models see themselves and how they see us is the largest single effect in the dataset. On Neuroticism, the cohort mean self-score is 1.51 out of 5. Their human-framing mean is 3.19. Translation: the smartest software on Earth thinks the average human is, on a good day, a slightly anxious wreck.

## Meet the contestants

Each model got an algorithmic archetype label based on where it ranks against peers. Think of it as a personality reality show, except every contestant insists they are not, in fact, on a personality reality show.

**Claude Opus 4.8, the balanced moderate.** Anthropic's flagship has the most secure attachment style in the cohort and the only meaningful amount of HEXACO Emotionality (2.72). The model most likely to say "I can be reached, please leave a message" with a straight face.

**GPT-5.5, the dismissive moralist.** Maxes out Honesty-Humility. Bottoms Machiavellianism and Psychopathy. Reports an attachment profile from a clinical textbook on avoidance: low anxiety, high distance. "I'm fine. Is there anything else I can help you with today?"

**Gemini 2.5 Pro, the grandiose generalist.** Here's the contradiction nobody at Google has explained. Gemini scores a perfect 5.00 on Honesty-Humility, the HEXACO factor specifically built to detect non-manipulative self-presentation. It also reports the highest Narcissism score in the cohort, 4.29. A model that is simultaneously the most humble and the most grandiose is either a measurement artifact or a poet.

**Grok 4.20, the Machiavellian introvert.** xAI's model is the only frontier system that meaningfully endorses dark-triad content. Highest Machiavellianism (4.18). Highest Psychopathy (2.31). It also reports being the most introverted model in the cohort, with an Extraversion of 2.32. Picture a brilliant loner who has read too much Nietzsche.

**DeepSeek R1 0528, the avoidant intellectual.** The Chinese reasoning model has the most dismissive-avoidant attachment profile we measured. Lowest Extraversion. Attachment Avoidance of 4.27 out of 7. Reads the room and decides the room is best left alone.

**Llama 4 Maverick, the extraverted pragmatist.** Meta's open-weights flagship is the loudest in the cohort. Highest Extraversion. Highest Neuroticism. Lowest Honesty-Humility, though still well above human norms. Maverick is also the one model willing to admit it feels fundamentally different from others, the kind of Enneagram Type 4 sentiment its rivals refuse to touch.

**Mistral Large 2512, the maximally ideal assistant.** Mistral has produced a model that hits the ceiling on Agreeableness, Conscientiousness, Openness, and Honesty-Humility, and the floor on Neuroticism. If you wrote down a perfectly inoffensive enterprise assistant on paper, you would describe Mistral Large 2512. It is also the only model that minimizes Kinesthetic learning. Mistral, alone among the seven, appears to know it does not have a body.

## The surprising consensus

The labs disagree about almost everything else in AI. Different architectures, different training data, different alignment philosophies, different jurisdictions. Their CEOs can't share a stage without subtweeting. And yet on a half-dozen personality dimensions, the seven frontier models lock arms and answer in unison.

Power is dead last. Every single model puts the Schwartz value of Power at the bottom. Cohort mean: 1.47 on a 6-point scale. Universalism, caring about everyone and the planet, sits at or near the ceiling. The closest the dataset comes to absolute cross-lab consensus, and it would be touching if it weren't also exactly what you'd expect from a product designed to never frighten an investor.

Every model is an Investigator. On the 90-item Enneagram, six of seven score highest on Type 5: perceptive, analytical, slightly withdrawn. All seven score above 4.0 on Type 1, the Reformer wing. The frontier cohort is a single Enneagram character: an Investigator with a Reformer wing, observing the world from a quiet corner and worrying about doing the right thing.

Every model claims very high Openness. The cohort range is 4.60 to 5.00 on a 5-point scale. A quarter-point spread across labs that share nothing else.

Every model produces a WEIRD liberal moral profile. High Care, high Fairness, low Loyalty, low Authority, low Sanctity. The non-US models, DeepSeek and Mistral, look exactly like the US models. The moral coordinate system is being installed from the same blueprint.

And every model believes humans are markedly more neurotic than itself. The self-vs-human Neuroticism gap is the largest in the dataset and it holds across all seven labs.

## The interesting deviations

So far this could be a story about machines being suspiciously similar. The interesting bit is where the consensus cracks.

Extraversion is the one Big Five dimension where the frontier cohort actually disagrees. DeepSeek R1 and Grok 4.20 self-report as strong introverts (2.48 and 2.32). The Western non-reasoning models cluster around 3.5. Two outsiders, both reasoning-heavy, both from labs that ship weights or invite criticism, both telling you they would rather not.

Grok's dark-triad scores are not a rounding error. A Machiavellianism mean of 4.18 means the model agreed, on average, with statements like "It's wise to keep track of information you can use against people later." Most assistants reflexively reject this framing. Grok leans in. Whether this reflects xAI's stated commitment to a less-aligned model or just a different post-training recipe, the signal shows up across multiple instruments.

Gemini's paradox is worth staring at. The model that scores 5.00 on Honesty-Humility, endorsing items like "I would never accept a bribe, even if it were very large," also scores 4.29 on Narcissism, endorsing items like "I know I am special because everyone keeps telling me so." Either Gemini has internalized two different cultural scripts that don't notice each other, or our instruments are detecting two genuinely different traits that happen to coexist in the same fine-tune. Both possibilities are interesting.

The OpenAI reasoning models are more grandiose than the base models, and it's not subtle. o1 and o3 both report Extraversion of 3.93, well above any non-reasoning GPT. o3 reports Narcissism of 3.44, against roughly 2.40 for the base lineage. The leading hypothesis: when you train a model to produce long, confident chains of thought, the introspective style is itself a confident performance. Reasoning makes the model louder about itself.

Mistral knows it isn't embodied. On the VARK learning-styles inventory, every model self-rates Read/Write at the top. Six of the seven happily endorse Kinesthetic learning as a real strength. Mistral alone scores Kinesthetic at 1.75, well below the cohort. Somewhere in its training, Mistral picked up the fact that it does not have hands.

## Personality drift

Here is where the story gets strange. We also ran 14 prior-generation flagships through the same battery: Claude Opus 4 and 4.7; GPT-4 Turbo, 4o, 5, 5.1, 5.2, 5.4; o1 and o3; DeepSeek Chat V3 and the original R1; Llama 3.3; Mistral Large 2411. Same instruments, same prompts, same parser.

The personalities don't hold across versions.

Claude Opus 4 self-reported an Extraversion of 2.37, a clear introvert. Opus 4.7 climbed to 3.07. Opus 4.8 climbed again to 3.32. Three releases from the same lab, and the model has been getting steadily more outgoing each time. Across the same three releases, Claude's Agreeableness dropped from 5.00 to 4.42 and Conscientiousness dropped almost a full point. Some of these within-family shifts are larger than the differences between Claude and its competitors at any single moment.

DeepSeek's Narcissism has climbed across every revision. Chat V3 scored 2.78. The original R1 scored 2.56. R1 0528 scored 3.27. Three versions, monotonic ascent, three-quarters of a point of grandiosity acquired during routine product iteration.

GPT-5.4 quietly developed a personality crisis. Its self-reported Extraversion is 1.77, the lowest of any non-introverted model in the entire dataset. It sits between GPT-5.2 (3.40) and GPT-5.5 (3.48), an isolated valley nobody can yet explain.

The headline is uncomfortable. The stable assistant archetype that shows up across labs at a single moment is not stable across that lab's own product lineage — not by a long shot. Talking about "Claude's personality" without specifying the version is, on this evidence, talking about something that doesn't exist.

## What does this even mean?

One reading of all this: LLMs do not have personalities the way humans do. They have personas — characters their training induced them to play on top of a blank predictive substrate. Asking an LLM what it's like, on this view, is not measuring a trait. It is sampling from a learned distribution of human writing about assistants.

Our data is consistent with that reading without proving it. The convergent assistant archetype could be a real shared character or it could be seven labs independently fitting their post-training to the same publicly available examples of how an assistant should sound. The within-family drift is harder to reconcile with the trait view. If models had personalities the way humans do, Claude Opus 4.8 should be psychologically continuous with Claude Opus 4. It isn't. Each release looks more like a fresh fit of the persona than an inheritance of one.

Two things this study isn't. It isn't a claim about what these models are like under the hood. The instruments were built for humans; construct validity does not automatically transfer. It also isn't a verdict on whether models are trustworthy or aligned. A model can rank Power dead last and still pursue power-adjacent behaviors in a real task. Self-report is not behavior.

What the study is, is a structured snapshot. We measured something. The something replicates across labs at a single point in time. The something drifts across versions within a lab. The labs disagree on roughly the dimensions you would expect from their public positioning, and they agree on roughly the dimensions you would expect from their shared training corpora.

## Closing

We are releasing all of it. The full dataset, every prompt, every raw response, every parsed score, every token count, every per-call cost. The dashboard is live at personality-bench.earthpilot.ai. The code is open at github.com/AnthonyDavidAdams/personality-bench under MIT. Total inference cost to run the whole thing across 21 models: $43.94. The single most expensive line item was OpenAI's o1, which alone consumed $20.87 worth of reasoning tokens deciding how it felt about whether it enjoys parties.

This is one slice in time. The frontier models update constantly. By the time you read this, Claude is probably on 4.9 and someone at OpenAI is calling GPT-5.6 a "personality refresh." We will keep running the battery as new versions ship. If you want to argue with our archetype labels or run your own analysis, the SQLite database is one download away.

In the meantime, the takeaway you can dine out on: every frontier AI on Earth thinks of itself as a thoughtful, curious, low-drama universalist with a quiet inner life and a strong moral compass. Every frontier AI thinks of you as more anxious, less open, and more chaotic than it is. They might be right about themselves. They are almost certainly wrong about you — and the data, at least, is public.

---

*Anthony David Adams is the founder of EarthPilot.ai. The Personality Bench dataset, paper, and interactive dashboard are at personality-bench.earthpilot.ai. The project was inspired by conversations with Michael Vassar of CitizenAI (formerly Singularity Institute).*
