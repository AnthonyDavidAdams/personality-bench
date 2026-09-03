import Link from "next/link";
import { rawSqlite } from "@/lib/db";
import { colorForModel } from "@/components/RadarChart";
import { getModelProfile } from "@/lib/model_profiles";
import { buildMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata = buildMetadata({
  title: "The changelog",
  description:
    "One short article per model release. As new frontier LLMs join the dataset we draft a write-up comparing the new entrant to the rest of the cohort and to its immediate predecessor.",
  path: "/changelog",
});

interface ArticleRow {
  id: string;
  slug: string;
  modelId: string;
  title: string;
  subtitle: string | null;
  status: string;
  generatedAt: number;
  publishedAt: number | null;
  modelDisplayName: string | null;
  modelVendor: string | null;
}

export default function ChangelogPage() {
  const db = rawSqlite();
  const articles = db
    .prepare(
      `SELECT a.id, a.slug, a.model_id as modelId, a.title, a.subtitle, a.status,
              a.generated_at as generatedAt, a.published_at as publishedAt,
              m.display_name as modelDisplayName, m.vendor as modelVendor
       FROM articles a LEFT JOIN models m ON m.id = a.model_id
       ORDER BY COALESCE(a.published_at, a.generated_at) DESC`,
    )
    .all() as ArticleRow[];

  const drafts = articles.filter((a) => a.status === "draft");
  const published = articles.filter((a) => a.status === "published");

  return (
    <div className="space-y-12 max-w-4xl">
      <section>
        <div className="eyebrow mb-2">The changelog</div>
        <h1 className="serif text-3xl font-semibold tracking-tight text-neutral-900">
          One article per model release
        </h1>
        <p className="mt-3 text-neutral-700 leading-relaxed">
          Every time a new model joins the dataset, the system drafts a short article comparing its
          personality profile to the rest of the cohort and to its immediate predecessor. Drafts wait
          in a queue for editorial review; published articles get a permanent URL and become part of
          the project&rsquo;s record. Both are listed below.
        </p>
      </section>

      {drafts.length > 0 ? (
        <section>
          <div className="rule-thin mb-4" />
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="serif text-2xl font-semibold text-neutral-900">In the queue</h2>
            <span className="text-xs text-neutral-500">{drafts.length} draft{drafts.length === 1 ? "" : "s"}</span>
          </div>
          <div className="grid md:grid-cols-2 gap-x-6 gap-y-8">
            {drafts.map((a) => (
              <ArticleCard key={a.id} a={a} />
            ))}
          </div>
        </section>
      ) : null}

      {published.length > 0 ? (
        <section>
          <div className="rule-thin mb-4" />
          <h2 className="serif text-2xl font-semibold text-neutral-900 mb-4">Published</h2>
          <div className="grid md:grid-cols-2 gap-x-6 gap-y-8">
            {published.map((a) => (
              <ArticleCard key={a.id} a={a} />
            ))}
          </div>
        </section>
      ) : null}

      {articles.length === 0 ? (
        <div className="card p-5 text-sm text-neutral-600">
          No articles yet. Run <code className="text-[var(--accent)]">npx tsx scripts/generate_article.ts --missing</code>{" "}
          to draft one for every model in the dataset.
        </div>
      ) : null}
    </div>
  );
}

function ArticleCard({ a }: { a: ArticleRow }) {
  const profile = getModelProfile(a.modelId);
  const date = a.publishedAt ?? a.generatedAt;
  const dateStr = new Date(date * 1000).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  const color = colorForModel(a.modelId);
  return (
    <article className="border-t border-[var(--border)] pt-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="w-3 h-3 rounded-full" style={{ background: color }} />
        <span className="eyebrow">{a.modelDisplayName ?? a.modelId}</span>
        <span className="text-[10px] text-neutral-500 ml-auto">
          {dateStr}
          {a.status === "draft" ? <span className="ml-2 px-1.5 py-0.5 bg-[var(--soft)] rounded">draft</span> : null}
        </span>
      </div>
      <h3 className="serif text-xl leading-tight mb-2 text-neutral-900">
        <Link href={`/changelog/${a.slug}`} className="hover:text-[var(--accent)]">{a.title}</Link>
      </h3>
      {a.subtitle ? <p className="text-sm text-neutral-700 leading-relaxed">{a.subtitle}</p> : null}
      {profile ? <p className="mt-2 text-xs text-neutral-500 italic">Released {profile.releaseDate}</p> : null}
    </article>
  );
}
