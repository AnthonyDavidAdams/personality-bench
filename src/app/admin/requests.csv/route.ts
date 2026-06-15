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
    `SELECT type, target, rationale, submitter_email, status,
            created_at, resolved_at, resolution_note
     FROM requests ORDER BY created_at DESC`,
  ).all() as any[];

  const header = ["type", "target", "rationale", "submitter_email", "status",
                  "submitted_at", "resolved_at", "resolution_note"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push([
      csvEscape(r.type),
      csvEscape(r.target),
      csvEscape(r.rationale),
      csvEscape(r.submitter_email),
      csvEscape(r.status),
      csvEscape(r.created_at ? new Date(r.created_at * 1000).toISOString() : ""),
      csvEscape(r.resolved_at ? new Date(r.resolved_at * 1000).toISOString() : ""),
      csvEscape(r.resolution_note),
    ].join(","));
  }

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(lines.join("\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="requests-${stamp}.csv"`,
    },
  });
}
