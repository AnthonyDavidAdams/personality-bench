import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

/**
 * PNG / JPG downloads of the pre-rendered bodygraph SVGs in public/bodygraph/.
 *   /api/bodygraph/anthropic/claude-fable-5.2.png
 *   /api/bodygraph/anthropic/claude-fable-5.2.jpg
 * 2000px wide on white. Add ?inline=1 to view instead of download.
 */
const TYPES = { png: "image/png", jpg: "image/jpeg" } as const;
const ROOT = path.join(process.cwd(), "public", "bodygraph");

export async function GET(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const parts = (await ctx.params).path;
  const m = parts.join("/").match(/^([a-z0-9._-]+\/[a-z0-9._:-]+)\.(png|jpg)$/i);
  if (!m) return new Response("Not found", { status: 404 });
  const [, id, ext] = m as unknown as [string, string, keyof typeof TYPES];

  const file = path.join(ROOT, `${id}.svg`);
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file)) return new Response("Not found", { status: 404 });

  const img = sharp(fs.readFileSync(file), { density: 192 }).resize({ width: 2000 }).flatten({ background: "#ffffff" });
  const body = ext === "png" ? await img.png().toBuffer() : await img.jpeg({ quality: 92 }).toBuffer();

  const name = `bodygraph-${id.replace("/", "-")}.${ext}`;
  const inline = new URL(req.url).searchParams.get("inline") === "1";
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": TYPES[ext],
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${name}"`,
      "Cache-Control": "public, max-age=86400",
    },
  });
}
