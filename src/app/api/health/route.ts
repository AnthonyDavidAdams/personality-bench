import { NextResponse } from "next/server";
// Lightweight health endpoint for Railway's healthcheck.
// Always exempt from basic auth (see middleware matcher exclusion).
export async function GET() {
  return NextResponse.json({ ok: true, ts: Date.now() });
}
