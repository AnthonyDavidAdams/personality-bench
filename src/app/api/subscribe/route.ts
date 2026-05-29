import { NextResponse } from "next/server";
import { rawSqlite } from "@/lib/db";
import { nanoid } from "nanoid";

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 254;
}

export async function POST(req: Request) {
  // Prefer the Content-Type header: JSON apps send application/json; HTML forms send multipart/form-data.
  const contentType = req.headers.get("content-type") ?? "";
  let email = "", source = "home_page";
  if (contentType.includes("application/json")) {
    const json = await req.json().catch(() => ({}));
    email = (json.email ?? "").toString();
    source = (json.source ?? "home_page").toString();
  } else {
    const form = await req.formData().catch(() => null);
    email = (form?.get("email") ?? "").toString();
    source = (form?.get("source") ?? "home_page").toString();
  }
  email = email.trim().toLowerCase();

  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ ok: false, error: "Please enter a valid email." }, { status: 400 });
  }

  const db = rawSqlite();
  // Upsert: idempotent if already subscribed
  try {
    db.prepare(
      `INSERT INTO email_subscribers (id, email, source, unsubscribe_token)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(email) DO UPDATE SET
         status='active',
         unsubscribed_at=NULL,
         source=COALESCE(email_subscribers.source, excluded.source)`,
    ).run(nanoid(14), email, source, nanoid(32));
  } catch (e) {
    return NextResponse.json({ ok: false, error: "Could not subscribe — please try again." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message: "Subscribed. Welcome — we'll email when new models or instruments land." });
}
