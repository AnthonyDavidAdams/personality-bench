import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ file: string }> },
) {
  const { file } = await params;
  // Whitelist: only files ending in .pdf inside /paper, no traversal
  if (!file.endsWith(".pdf") || file.includes("/") || file.includes("..")) {
    return new NextResponse("Not found", { status: 404 });
  }
  const p = path.join(process.cwd(), "paper", file);
  if (!fs.existsSync(p)) return new NextResponse("Not found", { status: 404 });
  const buf = fs.readFileSync(p);
  // Use Uint8Array (not Node Buffer) for cross-runtime body compatibility.
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${file}"`,
      "Cache-Control": "no-store",
    },
  });
}
