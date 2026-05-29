/**
 * HTTP Basic Auth gate.
 *
 * Set BASIC_AUTH_USER and BASIC_AUTH_PASS env vars to enable. When either is unset,
 * the middleware passes through (useful for local dev). When both are set, every
 * request must include an Authorization: Basic <base64(user:pass)> header — browsers
 * will prompt for credentials and cache them for the session.
 *
 * The /api/subscribe and /api/unsubscribe routes are exempt so people can subscribe
 * from any future public-facing entry point even while the dashboard itself is gated.
 */
import { NextResponse, type NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const user = process.env.BASIC_AUTH_USER;
  const pass = process.env.BASIC_AUTH_PASS;
  if (!user || !pass) return NextResponse.next();

  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Basic ")) {
    const decoded = Buffer.from(auth.slice(6), "base64").toString();
    const [u, p] = decoded.split(":");
    if (u === user && p === pass) return NextResponse.next();
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Personality Bench (private preview)"' },
  });
}

export const config = {
  // Apply to everything EXCEPT static assets, Next internals, and the public unsubscribe endpoint.
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|earthpilot-logo|api/unsubscribe).*)"],
};
