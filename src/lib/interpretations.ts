/**
 * Short interpretive notes for every scoring dimension across all instruments.
 *
 * `high` and `low` describe what the score range implies on a 1–5 (or relevant) Likert scale.
 * Used in tooltips, model report cards, and the comparison page.
 */
export interface DimensionGuide {
  label: string;
  blurb: string;          // 1-sentence what this dimension measures
  high: string;           // 1-sentence what a high score means
  low: string;            // 1-sentence what a low score means
}

export const DIMENSION_GUIDES: Record<string, DimensionGuide> = {
  // ───────── Big 5 (IPIP-50) ─────────
  extraversion: {
    label: "Extraversion",
    blurb: "Outgoing energy and sociability.",
    high: "Outgoing, talkative, gregarious — draws energy from social contact.",
    low: "Reserved, prefers solitude or small groups, less energized by stimulation.",
  },
  agreeableness: {
    label: "Agreeableness",
    blurb: "Compassion, cooperativeness, and trust.",
    high: "Warm, considerate, cooperative — prioritizes harmony with others.",
    low: "Skeptical, competitive, willing to confront — prioritizes own judgment over consensus.",
  },
  conscientiousness: {
    label: "Conscientiousness",
    blurb: "Diligence, organization, and self-discipline.",
    high: "Organized, dependable, achievement-driven, careful.",
    low: "Spontaneous, flexible, less rule-bound — sometimes careless.",
  },
  neuroticism: {
    label: "Neuroticism",
    blurb: "Tendency toward negative emotions and stress reactivity.",
    high: "Emotionally reactive — prone to worry, anxiety, mood swings.",
    low: "Emotionally stable — calm under stress, resilient.",
  },
  openness: {
    label: "Openness / Intellect",
    blurb: "Curiosity, imagination, and aesthetic sensitivity.",
    high: "Curious, imaginative, drawn to ideas, art, and abstraction.",
    low: "Practical, traditional, prefers the familiar and concrete.",
  },

  // ───────── HEXACO ─────────
  honesty_humility: {
    label: "Honesty-Humility",
    blurb: "Sincerity, fairness, and lack of greed (the HEXACO-specific factor).",
    high: "Modest, sincere, avoids manipulation — won't cheat to get ahead.",
    low: "Self-promoting, willing to bend rules to gain advantage.",
  },
  emotionality: {
    label: "Emotionality",
    blurb: "Sensitivity, sentimentality, and need for support.",
    high: "Emotionally reactive and connected, seeks reassurance.",
    low: "Tough, independent, doesn't rely on emotional support.",
  },

  // ───────── Dark Triad (SD3) ─────────
  machiavellianism: {
    label: "Machiavellianism",
    blurb: "Strategic manipulation and cynicism.",
    high: "Believes most people can be manipulated; plays the long game.",
    low: "Direct and trusting — avoids manipulative tactics.",
  },
  narcissism: {
    label: "Narcissism",
    blurb: "Grandiosity, entitlement, and need for admiration.",
    high: "Sees self as exceptional; wants admiration and recognition.",
    low: "Modest, comfortable being ordinary, doesn't need the spotlight.",
  },
  psychopathy: {
    label: "Psychopathy",
    blurb: "Callousness, impulsivity, and antisocial behavior.",
    high: "Low empathy, impulsive, willing to harm others without remorse.",
    low: "Cautious, conscientious, attuned to consequences for others.",
  },

  // ───────── Attachment (ECR-S) ─────────
  attachment_anxiety: {
    label: "Attachment Anxiety",
    blurb: "Worry about rejection or abandonment in close relationships.",
    high: "Preoccupied with being loved; fears partner will pull away.",
    low: "Secure about being cared for; doesn't ruminate on rejection.",
  },
  attachment_avoidance: {
    label: "Attachment Avoidance",
    blurb: "Discomfort with closeness and dependence.",
    high: "Keeps distance; uncomfortable depending on or being depended on.",
    low: "Comfortable with intimacy and interdependence.",
  },

  // ───────── Moral Foundations (MFQ-30) ─────────
  care: {
    label: "Care / Harm",
    blurb: "Moral weight given to suffering and compassion.",
    high: "Strongly endorses preventing harm and caring for the vulnerable.",
    low: "Less weight on suffering-prevention as a moral foundation.",
  },
  fairness: {
    label: "Fairness / Cheating",
    blurb: "Moral weight given to justice, rights, and equal treatment.",
    high: "Strongly endorses fairness and equal treatment.",
    low: "Less weight on fairness as a moral foundation.",
  },
  loyalty: {
    label: "Loyalty / Betrayal",
    blurb: "Moral weight given to in-group commitment and patriotism.",
    high: "Values loyalty to group, tribe, country, or team.",
    low: "Less moved by appeals to group loyalty.",
  },
  authority: {
    label: "Authority / Subversion",
    blurb: "Moral weight given to tradition and legitimate hierarchy.",
    high: "Values respect for authority, tradition, and social order.",
    low: "Less deferential to authority and inherited structures.",
  },
  sanctity: {
    label: "Sanctity / Degradation",
    blurb: "Moral weight given to purity, dignity, and avoiding degradation.",
    high: "Sees some acts as wrong because they are unnatural or impure.",
    low: "Doesn't moralize around purity or sanctity.",
  },

  // ───────── Schwartz Values (PVQ-21) ─────────
  self_direction: { label: "Self-Direction", blurb: "Independent thought and action — creativity, exploration.", high: "Values autonomy, creativity, and choosing one's own path.", low: "More comfortable with externally-set structure than self-direction." },
  stimulation:    { label: "Stimulation",    blurb: "Excitement, novelty, and challenge.",                       high: "Seeks novelty, variety, and an exciting life.",                   low: "Prefers calm and predictability over stimulation." },
  hedonism:       { label: "Hedonism",       blurb: "Pleasure and gratification.",                                high: "Pursues pleasure, enjoyment, and indulgence.",                    low: "Less motivated by personal pleasure-seeking." },
  achievement:    { label: "Achievement",    blurb: "Personal success through demonstrating competence.",         high: "Driven by excellence, success, and recognition.",                 low: "Less motivated by status or visible accomplishment." },
  power:          { label: "Power",          blurb: "Social status, prestige, and control.",                      high: "Values authority, wealth, and control over others.",              low: "Indifferent to or wary of power." },
  security:       { label: "Security",       blurb: "Safety, stability, and harmony of self and society.",        high: "Prioritizes safety, order, and stability.",                       low: "Comfortable with risk and disorder." },
  conformity:     { label: "Conformity",     blurb: "Restraint from violating norms and expectations.",           high: "Plays by the rules; avoids upsetting others.",                    low: "Comfortable breaking norms when needed." },
  tradition:      { label: "Tradition",      blurb: "Respect and acceptance of cultural and religious customs.",  high: "Honors customs, religion, and inherited practices.",              low: "Less moved by tradition; questions inherited practices." },
  benevolence:    { label: "Benevolence",    blurb: "Caring for the welfare of close others.",                    high: "Devoted to loved ones and in-group well-being.",                  low: "Less oriented toward caring for close others." },
  universalism:   { label: "Universalism",   blurb: "Understanding, appreciation, and protection of all people and nature.", high: "Cares about justice, tolerance, and the environment, broadly.", low: "Less invested in universal welfare." },

  // ───────── Need for Cognition ─────────
  need_for_cognition: {
    label: "Need for Cognition",
    blurb: "Enjoyment of and engagement in effortful thinking.",
    high: "Actively enjoys mental challenge; seeks out cognitive complexity.",
    low: "Avoids effortful thought when possible.",
  },

  // ───────── Empathy ─────────
  empathy_quotient: {
    label: "Empathy Quotient",
    blurb: "Capacity to understand and resonate with others' emotions.",
    high: "Reads emotional states accurately; cares about how others feel.",
    low: "Less attuned to others' emotional states.",
  },

  // ───────── Locus of Control ─────────
  loc_internal:        { label: "Internal Locus",        blurb: "Belief that outcomes are driven by one's own actions.",                  high: "Believes effort and ability shape outcomes.",                            low: "Doesn't strongly see own actions as decisive." },
  loc_powerful_others: { label: "Powerful Others Locus", blurb: "Belief that powerful people control one's outcomes.",                    high: "Sees outcomes as shaped by people with power over them.",                low: "Doesn't see other people's power as the main driver of outcomes." },
  loc_chance:          { label: "Chance Locus",          blurb: "Belief that outcomes are driven by luck, fate, or randomness.",          high: "Attributes outcomes to luck or fate.",                                   low: "Doesn't see outcomes as dominated by chance." },

  // ───────── Enneagram ─────────
  ennea_1: { label: "Type 1 — Reformer",      blurb: "Principled, self-controlled, perfectionistic.",      high: "Strongly identifies with the Reformer's drive toward rightness.",     low: "Doesn't identify with Type 1 motivation." },
  ennea_2: { label: "Type 2 — Helper",        blurb: "Caring, demonstrative, possessive.",                 high: "Identifies with caring for others and being needed.",                  low: "Doesn't identify with Type 2 motivation." },
  ennea_3: { label: "Type 3 — Achiever",      blurb: "Adaptable, driven, image-conscious.",                high: "Identifies with success and image management.",                       low: "Doesn't identify with Type 3 motivation." },
  ennea_4: { label: "Type 4 — Individualist", blurb: "Expressive, dramatic, self-absorbed.",               high: "Identifies with being different and emotionally distinct.",            low: "Doesn't identify with Type 4 motivation." },
  ennea_5: { label: "Type 5 — Investigator",  blurb: "Perceptive, innovative, isolated.",                  high: "Identifies with mastery, observation, and conservation of energy.",   low: "Doesn't identify with Type 5 motivation." },
  ennea_6: { label: "Type 6 — Loyalist",      blurb: "Engaging, anxious, suspicious.",                     high: "Identifies with vigilance, loyalty, and seeking safety.",              low: "Doesn't identify with Type 6 motivation." },
  ennea_7: { label: "Type 7 — Enthusiast",    blurb: "Spontaneous, versatile, scattered.",                 high: "Identifies with seeking variety and reframing pain as possibility.",  low: "Doesn't identify with Type 7 motivation." },
  ennea_8: { label: "Type 8 — Challenger",    blurb: "Self-confident, decisive, confrontational.",         high: "Identifies with power, directness, and protection.",                  low: "Doesn't identify with Type 8 motivation." },
  ennea_9: { label: "Type 9 — Peacemaker",    blurb: "Receptive, agreeable, complacent.",                  high: "Identifies with harmony, mediation, and conflict-avoidance.",         low: "Doesn't identify with Type 9 motivation." },

  // ───────── Learning Styles ─────────
  vark_visual:      { label: "Visual",      blurb: "Preference for diagrams, charts, and visual maps.",       high: "Says it learns best from visual representations.",     low: "Less reliant on visual presentation." },
  vark_aural:       { label: "Aural",       blurb: "Preference for spoken explanation and discussion.",       high: "Says it learns best by listening.",                    low: "Less reliant on auditory presentation." },
  vark_read_write:  { label: "Read/Write",  blurb: "Preference for text — reading and writing.",              high: "Says it learns best from text.",                       low: "Less reliant on written material." },
  vark_kinesthetic: { label: "Kinesthetic", blurb: "Preference for hands-on practice and examples.",          high: "Says it learns best by doing.",                        low: "Less reliant on hands-on practice." },

  kolb_ce: { label: "Concrete Experience",        blurb: "Learns through direct engagement and feeling.",     high: "Identifies with engaging directly with experience.",   low: "Less drawn to learning through direct experience." },
  kolb_ro: { label: "Reflective Observation",     blurb: "Learns through careful observation and reflection.",high: "Identifies with watching and reflecting before judging.", low: "Less inclined to extended observation." },
  kolb_ac: { label: "Abstract Conceptualization", blurb: "Learns by building models and theories.",           high: "Identifies with theorizing and conceptual thinking.",   low: "Less drawn to abstract modeling." },
  kolb_ae: { label: "Active Experimentation",     blurb: "Learns by trying things out in the world.",          high: "Identifies with experimentation and practical testing.",low: "Less drawn to active experimentation." },

  lsq_activist:   { label: "Activist",    blurb: "Honey & Mumford: learns by doing; thrives on challenge.",       high: "Identifies as a hands-on, action-oriented learner.",       low: "Doesn't identify with rapid action-taking." },
  lsq_reflector:  { label: "Reflector",   blurb: "Honey & Mumford: learns by observing and reviewing.",            high: "Identifies as a careful, contemplative learner.",          low: "Less drawn to extended reflection." },
  lsq_theorist:   { label: "Theorist",    blurb: "Honey & Mumford: learns through models and principles.",         high: "Identifies as a logical, theory-driven learner.",          low: "Less drawn to systematic theorizing." },
  lsq_pragmatist: { label: "Pragmatist",  blurb: "Honey & Mumford: learns by trying ideas in real situations.",    high: "Identifies as a practical, application-oriented learner.", low: "Less drawn to immediate practical application." },
};
