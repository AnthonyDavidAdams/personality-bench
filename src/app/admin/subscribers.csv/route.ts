import { rawSqlite } from "@/lib/db";

export const dynamic = "force-dynamic";

function csvEscape(v: string | number | null | undefined): string {
  if (v == null) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET() {
  const db = rawSqlite();
  const rows = db.prepare(
    `SELECT email, source, status, created_at, confirmed_at, unsubscribed_at
     FROM email_subscribers ORDER BY created_at DESC`,
  ).all() as any[];

  const header = ["email", "source", "status", "signed_up_at", "confirmed_at", "unsubscribed_at"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push([
      csvEscape(r.email),
      csvEscape(r.source),
      csvEscape(r.status),
      csvEscape(r.created_at ? new Date(r.created_at * 1000).toISOString() : ""),
      csvEscape(r.confirmed_at ? new Date(r.confirmed_at * 1000).toISOString() : ""),
      csvEscape(r.unsubscribed_at ? new Date(r.unsubscribed_at * 1000).toISOString() : ""),
    ].join(","));
  }

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(lines.join("\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="subscribers-${stamp}.csv"`,
    },
  });
}
