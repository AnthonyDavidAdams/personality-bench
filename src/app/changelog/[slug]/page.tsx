import Link from "next/link";
import { notFound } from "next/navigation";
import { rawSqlite } from "@/lib/db";
import { colorForModel } from "@/components/RadarChart";
import { MODEL_PROFILES } from "@/lib/model_profiles";

export const dynamic = "force-dynamic";

// Minimal markdown renderer — no external dep. Handles paragraphs, h2/h3, lists, bold/italic, links.
function renderMarkdown(md: string): string {
  const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (s: string) =>
    s
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-[var(--link)] hover:underline">$1</a>')
      .replace(/`([^`]+)`/g, '<code class="text-[var(--accent)] text-sm">$1</code>');
  const lines = md.split("\n");
  const out: string[] = [];
  let inList = false;
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) {
      out.push(`<p class="text-lg text-neutral-800 leading-[1.7] my-5 max-w-prose">${inline(escape(para.join(" ")))}</p>`);
      para = [];
    }
  };
  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      flushPara();
      if (inList) {
        out.push("</ul>");
        inList = false;
      }
      out.push(`<h2 class="serif text-2xl font-semibold mt-10 mb-3 text-neutral-900">${inline(escape(line.replace(/^##\s+/, "")))}</h2>`);
    } else if (/^###\s+/.test(line)) {
      flushPara();
      if (inList) {
        out.push("</ul>");
        inList = false;
      }
      out.push(`<h3 class="serif text-xl font-semibold mt-7 mb-2 text-neutral-900">${inline(escape(line.replace(/^###\s+/, "")))}</h3>`);
    } else if (/^[-*]\s+/.test(line)) {
      flushPara();
      if (!inList) {
        out.push('<ul class="list-disc list-outside ml-6 my-4 space-y-1.5 text-lg text-neutral-800 leading-relaxed">');
        inList = true;
      }
      out.push(`<li>${inline(escape(line.replace(/^[-*]\s+/, "")))}</li>`);
    } else if (/^>\s+/.test(line)) {
      flushPara();
      if (inList) {
        out.push("</ul>");
        inList = false;
      }
      out.push(`<blockquote class="pullquote my-8 max-w-2xl border-l-4 border-[var(--accent)] pl-6">${inline(escape(line.replace(/^>\s+/, "")))}</blockquote>`);
    } else if (line.trim() === "") {
      flushPara();
    } else {
      if (inList) {
        out.push("</ul>");
        inList = false;
      }
      para.push(line);
    }
  }
  flushPara();
  if (inList) out.push("</ul>");
  return out.join("\n");
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = rawSqlite();
  const article = db
    .prepare(
      `SELECT a.*, m.display_name as modelDisplayName, m.vendor as modelVendor
       FROM articles a LEFT JOIN models m ON m.id = a.model_id
       WHERE a.slug = ?`,
    )
    .get(slug) as
    | {
        id: string;
        slug: string;
        model_id: string;
        title: string;
        subtitle: string | null;
        body: string;
        status: string;
        generated_by: string | null;
        generated_at: number;
        published_at: number | null;
        generation_cost_usd: number | null;
        modelDisplayName: string | null;
        modelVendor: string | null;
      }
    | undefined;
  if (!article) notFound();

  const profile = MODEL_PROFILES[article.model_id];
  const color = colorForModel(article.model_id);
  const isDraft = article.status === "draft";
  const date = article.published_at ?? article.generated_at;
  const dateStr = new Date(date * 1000).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  return (
    <article className="max-w-3xl mx-auto space-y-6">
      <header>
        <Link href="/changelog" className="text-xs text-neutral-500 hover:text-[var(--accent)]">← all articles</Link>
        <div className="flex items-center gap-2 mt-3 mb-2">
          <span className="w-3 h-3 rounded-full" style={{ background: color }} />
          <span className="eyebrow">{article.modelDisplayName}</span>
          {isDraft ? <span className="text-[10px] px-1.5 py-0.5 bg-[var(--accent-soft)] text-[var(--accent)] rounded">draft</span> : null}
        </div>
        <h1 className="serif text-4xl md:text-5xl font-semibold leading-[1.05] tracking-[-0.02em] text-neutral-900 mb-3">
          {article.title}
        </h1>
        {article.subtitle ? (
          <p className="serif-italic text-xl text-neutral-700 leading-snug mb-4 max-w-2xl">{article.subtitle}</p>
        ) : null}
        <div className="text-xs text-neutral-500 italic">
          By Anthony David Adams · EarthPilot.ai · {dateStr}
          {profile ? <> · About <Link href={`/models/${encodeURIComponent(article.model_id)}`} className="text-[var(--link)] hover:underline">{article.modelDisplayName}</Link>, released {profile.releaseDate}</> : null}
        </div>
      </header>

      <div className="rule-thin" />

      <div dangerouslySetInnerHTML={{ __html: renderMarkdown(article.body) }} />

      <div className="rule-thin mt-12" />

      <footer className="text-xs text-neutral-500 italic leading-relaxed">
        {isDraft ? (
          <>This is an auto-generated draft awaiting editorial review.{" "}</>
        ) : null}
        Article drafted by <code className="text-neutral-700">{article.generated_by}</code> from the model&rsquo;s
        measured personality profile vs. the cohort. Every quantitative claim traces back to the open dataset.{" "}
        <Link href="/cite" className="text-[var(--link)] hover:underline">Cite this work →</Link>
      </footer>
    </article>
  );
}
