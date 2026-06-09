import "./globals.css";
import Link from "next/link";
import Image from "next/image";
import { Fraunces, Inter } from "next/font/google";
import type { Metadata } from "next";
import { SITE_URL, SITE_NAME, DEFAULT_OG_IMAGE, DEFAULT_OG_ALT } from "@/lib/seo";

const display = Fraunces({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-display",
  display: "swap",
  axes: ["SOFT", "WONK", "opsz"],
});
const body = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
});

const DEFAULT_DESCRIPTION =
  "Frontier language models, run through Big 5, HEXACO, Dark Triad, Schwartz Values, learning styles, and other personality instruments. Open methodology, open data, open cost. By Anthony David Adams.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Personality Bench — an EarthPilot research lab dataset",
    template: "%s · Personality Bench",
  },
  description: DEFAULT_DESCRIPTION,
  applicationName: SITE_NAME,
  authors: [{ name: "Anthony David Adams", url: "https://github.com/AnthonyDavidAdams" }],
  creator: "Anthony David Adams",
  publisher: "EarthPilot.ai Research Lab",
  alternates: { canonical: SITE_URL },
  openGraph: {
    title: "Personality Bench — an EarthPilot research lab dataset",
    description: DEFAULT_DESCRIPTION,
    url: SITE_URL,
    siteName: SITE_NAME,
    type: "website",
    images: [{ url: DEFAULT_OG_IMAGE, width: 1920, height: 1080, alt: DEFAULT_OG_ALT }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Personality Bench — an EarthPilot research lab dataset",
    description: DEFAULT_DESCRIPTION,
    images: [DEFAULT_OG_IMAGE],
    creator: "@anthonyadams",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body className="min-h-screen">
        <header className="border-b border-[var(--border)] bg-white">
          <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3 group">
              <Image
                src="/earthpilot-logo.png"
                alt="EarthPilot"
                width={32}
                height={32}
                className="rounded-full"
                priority
              />
              <span
                className="serif font-semibold tracking-tight text-xl group-hover:text-[var(--accent)]"
                style={{ fontVariationSettings: '"opsz" 144, "SOFT" 0' }}
              >
                Personality<span className="text-[var(--accent)] mx-0.5">·</span>Bench
              </span>
            </Link>
            <nav className="flex gap-5 text-sm text-neutral-700 font-medium">
              <Link href="/models" className="hover:text-[var(--accent)]">Models</Link>
              <Link href="/instruments" className="hover:text-[var(--accent)]">Instruments</Link>
              <Link href="/compare" className="hover:text-[var(--accent)]">Compare</Link>
              <Link href="/drift" className="hover:text-[var(--accent)]">Drift</Link>
              <Link href="/timeline" className="hover:text-[var(--accent)]">Timeline</Link>
              <Link href="/raw" className="hover:text-[var(--accent)]">Raw</Link>
              <Link href="/paper" className="hover:text-[var(--accent)]">Paper</Link>
              <Link href="/changelog" className="hover:text-[var(--accent)]">Changelog</Link>
              <Link href="/cite" className="hover:text-[var(--accent)]">Cite</Link>
            </nav>
          </div>
        </header>
        <main className="max-w-6xl mx-auto px-6 py-10">{children}</main>
        <footer className="border-t border-[var(--border)] mt-20 bg-[var(--paper)]">
          <div className="max-w-6xl mx-auto px-6 py-8">
            <div className="flex items-start gap-4">
              <Image
                src="/earthpilot-logo.png"
                alt="EarthPilot lab flag"
                width={48}
                height={48}
                className="rounded-full flex-shrink-0"
              />
              <div className="text-sm text-neutral-700 leading-relaxed">
                <div>
                  A research project by{" "}
                  <a
                    href="https://github.com/AnthonyDavidAdams"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--link)] hover:underline"
                  >
                    Anthony David Adams
                  </a>{" "}
                  ·{" "}
                  <a
                    href="https://github.com/AnthonyDavidAdams"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--link)] hover:underline"
                  >
                    GitHub
                  </a>{" "}
                  ·{" "}
                  <a
                    href="https://linkedin.com/in/anthonydavidadams"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--link)] hover:underline"
                  >
                    LinkedIn
                  </a>
                </div>
                <div className="mt-1">
                  Published by{" "}
                  <a
                    href="https://earthpilot.ai"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--link)] hover:underline font-medium"
                  >
                    EarthPilot.ai
                  </a>{" "}
                  — Mission Support for Spaceship Earth.
                </div>
                <div className="mt-1 text-neutral-500">
                  Provided as a public utility. Open methodology, open data, open cost.
                  {" "}<Link href="/cite" className="text-[var(--link)] hover:underline">Cite this work →</Link>
                </div>
              </div>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
