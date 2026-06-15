import Link from "next/link";
import { rawSqlite } from "@/lib/db";

export const dynamic = "force-dynamic";

interface SubscriberRow {
  id: string;
  email: string;
  source: string | null;
  status: string;
  createdAt: number;
  confirmedAt: number | null;
  unsubscribedAt: number | null;
}

interface RequestRow {
  id: string;
  type: string;
  target: string;
  rationale: string | null;
  submitterEmail: string | null;
  status: string;
  createdAt: number;
  resolvedAt: number | null;
  resolutionNote: string | null;
}

function fmtDate(ts: number | null) {
  if (!ts) return "—";
  return new Date(ts * 1000).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric",
  });
}

export default function AdminPage() {
  const db = rawSqlite();

  const subscribers = db.prepare(
    `SELECT id, email, source, status, created_at AS createdAt,
            confirmed_at AS confirmedAt, unsubscribed_at AS unsubscribedAt
     FROM email_subscribers ORDER BY created_at DESC`,
  ).all() as SubscriberRow[];

  const requests = db.prepare(
    `SELECT id, type, target, rationale, submitter_email AS submitterEmail,
            status, created_at AS createdAt, resolved_at AS resolvedAt,
            resolution_note AS resolutionNote
     FROM requests ORDER BY created_at DESC`,
  ).all() as RequestRow[];

  const subActive = subscribers.filter((s) => s.status === "active").length;
  const subUnsub = subscribers.filter((s) => s.status === "unsubscribed").length;
  const reqPending = requests.filter((r) => r.status === "pending").length;
  const reqFulfilled = requests.filter((r) => r.status === "fulfilled").length;

  const umamiUrl = process.env.UMAMI_DASHBOARD_URL;

  return (
    <div className="space-y-12 max-w-6xl">
      <section>
        <div className="eyebrow mb-2">Admin</div>
        <h1 className="serif text-3xl font-semibold tracking-tight text-neutral-900">
          Backstage
        </h1>
        <p className="mt-2 text-sm text-neutral-600">
          Subscribers, reader requests, and a link to the visitor analytics dashboard.
        </p>
      </section>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <Stat label="Subscribers (active)" value={String(subActive)} />
        <Stat label="Unsubscribed" value={String(subUnsub)} />
        <Stat label="Requests (pending)" value={String(reqPending)} />
        <Stat label="Requests (fulfilled)" value={String(reqFulfilled)} />
      </section>

      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="serif text-2xl font-semibold text-neutral-900">Visitor analytics</h2>
        </div>
        {umamiUrl ? (
          <a
            href={umamiUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--link)] hover:underline text-sm"
          >
            Open Umami dashboard →
          </a>
        ) : (
          <p className="text-sm text-neutral-600">
            Umami not yet configured. Set <code>UMAMI_DASHBOARD_URL</code> env var to link the dashboard here.
          </p>
        )}
      </section>

      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="serif text-2xl font-semibold text-neutral-900">
            Subscribers <span className="text-neutral-500 font-normal text-base">({subscribers.length})</span>
          </h2>
          <a
            href="/admin/subscribers.csv"
            className="text-xs text-[var(--link)] hover:underline"
          >
            Export CSV →
          </a>
        </div>
        {subscribers.length === 0 ? (
          <p className="text-sm text-neutral-600">No subscribers yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-neutral-500 border-b border-[var(--border)]">
                <tr>
                  <th className="text-left py-2 pr-4 font-medium">Email</th>
                  <th className="text-left py-2 pr-4 font-medium">Source</th>
                  <th className="text-left py-2 pr-4 font-medium">Status</th>
                  <th className="text-left py-2 pr-4 font-medium">Signed up</th>
                  <th className="text-left py-2 pr-4 font-medium">Confirmed</th>
                </tr>
              </thead>
              <tbody>
                {subscribers.map((s) => (
                  <tr key={s.id} className="border-b border-[var(--soft)]">
                    <td className="py-2 pr-4 font-mono text-xs">{s.email}</td>
                    <td className="py-2 pr-4 text-neutral-600">{s.source ?? "—"}</td>
                    <td className="py-2 pr-4">
                      <span className={
                        s.status === "active" ? "text-green-700"
                          : s.status === "bounced" ? "text-red-600"
                          : "text-neutral-500"
                      }>
                        {s.status}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-neutral-600">{fmtDate(s.createdAt)}</td>
                    <td className="py-2 pr-4 text-neutral-600">{fmtDate(s.confirmedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="serif text-2xl font-semibold text-neutral-900">
            Reader requests <span className="text-neutral-500 font-normal text-base">({requests.length})</span>
          </h2>
          <a
            href="/admin/requests.csv"
            className="text-xs text-[var(--link)] hover:underline"
          >
            Export CSV →
          </a>
        </div>
        {requests.length === 0 ? (
          <p className="text-sm text-neutral-600">No requests yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-neutral-500 border-b border-[var(--border)]">
                <tr>
                  <th className="text-left py-2 pr-4 font-medium">Type</th>
                  <th className="text-left py-2 pr-4 font-medium">Target</th>
                  <th className="text-left py-2 pr-4 font-medium">Why</th>
                  <th className="text-left py-2 pr-4 font-medium">Submitter</th>
                  <th className="text-left py-2 pr-4 font-medium">Status</th>
                  <th className="text-left py-2 pr-4 font-medium">When</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id} className="border-b border-[var(--soft)] align-top">
                    <td className="py-2 pr-4 text-neutral-600">{r.type}</td>
                    <td className="py-2 pr-4 font-mono text-xs">{r.target}</td>
                    <td className="py-2 pr-4 max-w-md">{r.rationale ?? "—"}</td>
                    <td className="py-2 pr-4 font-mono text-xs">{r.submitterEmail ?? "—"}</td>
                    <td className="py-2 pr-4 text-neutral-600">{r.status}</td>
                    <td className="py-2 pr-4 text-neutral-600">{fmtDate(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="border-t border-[var(--border)] pt-6 text-xs text-neutral-500">
        <Link href="/" className="hover:text-[var(--primary)]">← back to site</Link>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="eyebrow mb-2">{label}</div>
      <div className="serif text-4xl leading-none tracking-tight tabular-nums text-neutral-900">
        {value}
      </div>
    </div>
  );
}
