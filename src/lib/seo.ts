import type { Metadata } from "next";

export const SITE_URL = "https://persona.earthpilot.ai";
export const SITE_NAME = "Personality Bench";
export const DEFAULT_OG_IMAGE = "/art/hero.png";
export const DEFAULT_OG_ALT =
  "Personality Bench — geometric profile rendered as a mirror surface with seven reflections of the same face inside.";

interface BuildMetadataInput {
  title: string;
  description: string;
  /** Path including leading slash, e.g. "/changelog/claude-fable-5". Omit for the home page. */
  path?: string;
  /** Public-folder path including leading slash, e.g. "/art/archetype_claude.png". Defaults to hero.png. */
  image?: string;
  imageAlt?: string;
  /** Title used in og:title; defaults to the short title. Useful when you want a longer social title. */
  ogTitle?: string;
  /** "article" for dispatches, otherwise "website". */
  type?: "website" | "article";
  publishedTime?: string;
}

/**
 * Single source of truth for page-level Open Graph + Twitter metadata.
 * Always use this when adding a new route that has its own content surface.
 * See CLAUDE.md → "Design notes → OpenGraph metadata is required".
 */
export function buildMetadata(input: BuildMetadataInput): Metadata {
  const {
    title,
    description,
    path = "",
    image = DEFAULT_OG_IMAGE,
    imageAlt = DEFAULT_OG_ALT,
    ogTitle,
    type = "website",
    publishedTime,
  } = input;
  const url = `${SITE_URL}${path}`;
  const absoluteImage = image.startsWith("http") ? image : `${SITE_URL}${image}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: ogTitle ?? title,
      description,
      url,
      siteName: SITE_NAME,
      type,
      images: [{ url: absoluteImage, width: 1920, height: 1080, alt: imageAlt }],
      ...(publishedTime ? { publishedTime } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle ?? title,
      description,
      images: [absoluteImage],
    },
  };
}
