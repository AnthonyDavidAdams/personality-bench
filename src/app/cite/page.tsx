import Link from "next/link";
import { getSpendSummary } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default function CitePage() {
  const spend = getSpendSummary();
  const year = new Date().getFullYear();

  return (
    <div className="max-w-3xl space-y-10">
      <section>
        <div className="eyebrow mb-2">Cite this work</div>
        <h1 className="serif text-3xl font-semibold tracking-tight text-neutral-900">
          Citing Personality Bench
        </h1>
        <p className="mt-3 text-neutral-700 leading-relaxed">
          If you use this dataset, code, paper, or findings — in academic work, journalism,
          a podcast, a tweet, a chart, an internal memo, a YouTube essay, anywhere —
          please cite it. Knowing the work travels helps me keep updating it.
        </p>
      </section>

      <section className="card p-5">
        <h2 className="serif text-lg font-semibold mb-3 text-neutral-900">Plain text</h2>
        <p className="text-sm text-neutral-700 leading-relaxed">
          Adams, A. D. ({year}). <em>Personality Bench: A cross-lab inventory of frontier-LLM
          self-presentation across 14 psychometric instruments, with cross-version drift analysis.</em>
          {" "}EarthPilot.ai Research Lab. <Link href="https://persona.earthpilot.ai" className="text-[var(--link)] hover:underline">persona.earthpilot.ai</Link>
        </p>
      </section>

      <section className="card p-5">
        <h2 className="serif text-lg font-semibold mb-3 text-neutral-900">BibTeX</h2>
        <pre className="text-xs bg-white border border-[var(--border)] p-3 rounded font-mono overflow-x-auto whitespace-pre">
{`@misc{adams${year}personality,
  author       = {Anthony David Adams},
  title        = {Personality Bench: A Cross-Lab Inventory of Frontier-LLM
                  Self-Presentation Across 14 Psychometric Instruments,
                  with Cross-Version Drift Analysis},
  year         = {${year}},
  publisher    = {EarthPilot.ai Research Lab},
  url          = {https://persona.earthpilot.ai},
  note         = {Open dataset: ${spend.totalRuns.toLocaleString()} batched API calls
                  across ${spend.totalUsd ? "30+" : ""} large language models.
                  Code: github.com/AnthonyDavidAdams/personality-bench}
}`}
        </pre>
      </section>

      <section className="card p-5">
        <h2 className="serif text-lg font-semibold mb-3 text-neutral-900">APA 7th edition</h2>
        <p className="text-sm text-neutral-700 leading-relaxed font-mono">
          Adams, A. D. ({year}). <em>Personality Bench: A cross-lab inventory of frontier-LLM
          self-presentation across 14 psychometric instruments, with cross-version drift analysis</em>
          {" "}[Open dataset and research project]. EarthPilot.ai Research Lab.
          https://persona.earthpilot.ai
        </p>
      </section>

      <section className="card p-5">
        <h2 className="serif text-lg font-semibold mb-3 text-neutral-900">If you cite a specific finding</h2>
        <p className="text-sm text-neutral-700 leading-relaxed">
          Cite the version of the dataset you queried. Each refresh is reflected in the GitHub
          history; the seed snapshot at any commit is reproducible. For maximum precision, cite the
          commit SHA from{" "}
          <a href="https://github.com/AnthonyDavidAdams/personality-bench" target="_blank" rel="noopener noreferrer" className="text-[var(--link)] hover:underline">
            github.com/AnthonyDavidAdams/personality-bench
          </a>
          {" "}alongside the citation above.
        </p>
      </section>

      <section className="border-t-2 border-[var(--rule)] pt-6">
        <div className="eyebrow mb-2">Contact</div>
        <h2 className="serif text-2xl font-semibold mb-4 text-neutral-900">Anthony David Adams</h2>
        <ul className="space-y-1.5 text-sm text-neutral-800">
          <li>
            Email:{" "}
            <a href="mailto:anthony@175g.com" className="text-[var(--link)] hover:underline">anthony@175g.com</a>
          </li>
          <li>
            EarthPilot.ai:{" "}
            <a href="https://earthpilot.ai" target="_blank" rel="noopener noreferrer" className="text-[var(--link)] hover:underline">earthpilot.ai</a>
          </li>
          <li>
            GitHub:{" "}
            <a href="https://github.com/AnthonyDavidAdams" target="_blank" rel="noopener noreferrer" className="text-[var(--link)] hover:underline">@AnthonyDavidAdams</a>
          </li>
          <li>
            LinkedIn:{" "}
            <a href="https://linkedin.com/in/anthonydavidadams" target="_blank" rel="noopener noreferrer" className="text-[var(--link)] hover:underline">/in/anthonydavidadams</a>
          </li>
        </ul>
        <p className="mt-4 text-sm text-neutral-700 max-w-2xl leading-relaxed">
          For press, podcasts, collaborations, requests to test a specific model or add a specific instrument,
          academic partnerships, or just a question — email is the fastest channel. I read everything and
          respond to most.
        </p>
      </section>
    </div>
  );
}
