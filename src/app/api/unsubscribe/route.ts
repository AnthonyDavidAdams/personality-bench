import { NextResponse } from "next/server";
import { rawSqlite } from "@/lib/db";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) return new NextResponse("Missing token", { status: 400 });

  const db = rawSqlite();
  const row = db.prepare(`UPDATE email_subscribers SET status='unsubscribed', unsubscribed_at=unixepoch() WHERE unsubscribe_token=? RETURNING email`).get(token) as { email?: string } | undefined;
  if (!row?.email) return new NextResponse("Invalid token", { status: 404 });

  return new NextResponse(
    `<html><body style="font-family: Georgia, serif; max-width: 600px; margin: 4em auto; padding: 0 2em;">
      <h1>Unsubscribed</h1>
      <p>${row.email} will no longer receive updates from Personality Bench.</p>
      <p><a href="/">Back to personality-bench</a></p>
    </body></html>`,
    { status: 200, headers: { "Content-Type": "text/html" } },
  );
}
