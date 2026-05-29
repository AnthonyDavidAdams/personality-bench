import { NextResponse } from "next/server";
import { rawSqlite } from "@/lib/db";
import { nanoid } from "nanoid";
import crypto from "node:crypto";

const VALID_TYPES = new Set(["model", "instrument", "other"]);

function hashIp(ip: string | null): string | null {
  if (!ip) return null;
  return crypto.createHash("sha256").update(ip + "personality-bench-salt").digest("hex").slice(0, 16);
}

export async function POST(req: Request) {
  const contentType = req.headers.get("content-type") ?? "";
  let type = "", target = "", rationale = "", submitterEmail = "";
  if (contentType.includes("application/json")) {
    const json = await req.json().catch(() => ({}));
    type = (json.type ?? "").toString();
    target = (json.target ?? "").toString();
    rationale = (json.rationale ?? "").toString();
    submitterEmail = (json.email ?? "").toString();
  } else {
    const form = await req.formData().catch(() => null);
    type = (form?.get("type") ?? "").toString();
    target = (form?.get("target") ?? "").toString();
    rationale = (form?.get("rationale") ?? "").toString();
    submitterEmail = (form?.get("email") ?? "").toString();
  }
  target = target.trim().slice(0, 500);
  rationale = rationale.trim().slice(0, 2000);
  submitterEmail = submitterEmail.trim().toLowerCase().slice(0, 254);

  if (!VALID_TYPES.has(type)) {
    return NextResponse.json({ ok: false, error: "Choose model, instrument, or other." }, { status: 400 });
  }
  if (!target) {
    return NextResponse.json({ ok: false, error: "Tell us what you'd like added." }, { status: 400 });
  }
  if (submitterEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(submitterEmail)) {
    return NextResponse.json({ ok: false, error: "Email doesn't look valid." }, { status: 400 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? null;
  const db = rawSqlite();

  // Light abuse prevention: max 5 requests per ipHash per day.
  const ipHash = hashIp(ip);
  if (ipHash) {
    const row = db
      .prepare(`SELECT COUNT(*) as n FROM requests WHERE ip_hash=? AND created_at > unixepoch('now', '-1 day')`)
      .get(ipHash) as { n: number };
    if (row.n >= 5) {
      return NextResponse.json({ ok: false, error: "Rate limit — try again tomorrow." }, { status: 429 });
    }
  }

  db.prepare(
    `INSERT INTO requests (id, type, target, rationale, submitter_email, ip_hash)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(nanoid(14), type, target, rationale || null, submitterEmail || null, ipHash);

  return NextResponse.json({ ok: true, message: "Got it — request logged. Thanks for the suggestion." });
}
