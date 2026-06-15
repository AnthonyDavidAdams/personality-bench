import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * HTTP Basic Auth gate for /admin only. Everything else stays public.
 *
 * Set ADMIN_PASS env var on Railway. Username is "admin".
 * If ADMIN_PASS is unset, /admin returns 503 to avoid accidentally exposing it.
 */
export function middleware(req: NextRequest) {
  const pass = process.env.ADMIN_PASS;
  if (!pass) {
    return new NextResponse("Admin not configured (set ADMIN_PASS env var).", { status: 503 });
  }

  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Basic ")) {
    return new NextResponse("Authentication required.", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="Personality Bench Admin"' },
    });
  }
  const decoded = Buffer.from(auth.slice(6), "base64").toString();
  const [user, ...passParts] = decoded.split(":");
  const provided = passParts.join(":");
  if (user !== "admin" || provided !== pass) {
    return new NextResponse("Invalid credentials.", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="Personality Bench Admin"' },
    });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/admin"],
};
