/**
 * Draft and submit the "new model added" post to Hacker News.
 *
 * Reproduces the shape of the first one we posted by hand
 * (https://news.ycombinator.com/item?id=49802839): a link submission pointing at the
 * model's profile page, plus a first comment from the submitter carrying the archetype
 * label and the measured superlatives.
 *
 * Nothing is posted unless you pass --post. The nightly autopilot only ever writes the
 * draft to data/hn-queue.json and emails it; a human fires the actual submission. HN
 * treats cron-rate submissions badly, and 06:00 local is a dead slot on the front page.
 *
 * Usage:
 *   npx tsx scripts/post_hn.ts <model_id>              # print the draft, change nothing
 *   npx tsx scripts/post_hn.ts --draft <model_id>      # queue it in data/hn-queue.json
 *   npx tsx scripts/post_hn.ts --post <model_id>       # log in, submit, add the comment
 *   npx tsx scripts/post_hn.ts --post --next           # post the oldest unposted draft
 *   npx tsx scripts/post_hn.ts --post --force <model>  # submit again even if already posted
 *   npx tsx scripts/post_hn.ts --list                  # show the queue
 *
 * Credentials: ~/.hn.env with
 *   HN_USERNAME=ada1981
 *   HN_PASSWORD=...
 * (or the same two vars in the environment).
 */
import "../src/lib/env";
import fs from "node:fs";
import path from "node:path";
import { rawSqlite } from "../src/lib/db";
import { computeModelFindings } from "../src/lib/findings";

const SITE = "https://persona.earthpilot.ai";
const HN = "https://news.ycombinator.com";
const QUEUE_PATH = path.join(process.cwd(), "data", "hn-queue.json");
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const VENDOR_LABELS: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
  xai: "xAI",
  "x-ai": "xAI",
  deepseek: "DeepSeek",
  meta: "Meta",
  "meta-llama": "Meta",
  mistral: "Mistral",
  mistralai: "Mistral",
};

export interface HnDraft {
  modelId: string;
  title: string;
  url: string;
  comment: string;
  createdAt: string;
  postedAt?: string;
  itemId?: string;
  commentPosted?: boolean;
}

// ─────────────────────────────── draft building ───────────────────────────────

/** "The humble type" → "The Humble Type" — HN comments read better title-cased. */
function titleCase(s: string): string {
  const SMALL = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "in", "of", "on", "or", "the", "to", "with"]);
  return s
    .split(/\s+/)
    .map((w, i) => (i > 0 && SMALL.has(w.toLowerCase()) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

export function buildDraft(modelId: string): HnDraft {
  const db = rawSqlite();
  const model = db
    .prepare(`SELECT id, display_name AS displayName, vendor FROM models WHERE id = ? AND active = 1`)
    .get(modelId) as { id: string; displayName: string; vendor: string } | undefined;
  if (!model) throw new Error(`no active model in the DB with id ${modelId}`);

  const runs = (
    db.prepare(`SELECT COUNT(*) AS n FROM runs WHERE model_id = ? AND status = 'completed'`).get(modelId) as { n: number }
  ).n;
  if (runs === 0) throw new Error(`${modelId} has no completed runs — nothing to post about yet`);
  const instruments = (
    db
      .prepare(`SELECT COUNT(DISTINCT instrument_id) AS n FROM runs WHERE model_id = ? AND status = 'completed'`)
      .get(modelId) as { n: number }
  ).n;

  const lab = VENDOR_LABELS[model.vendor] ?? model.vendor;
  const findings = computeModelFindings(modelId, model.displayName);
  const url = `${SITE}/models/${modelId}`;

  // Same shape as the hand-written first post: label, the measured summary line, then the link.
  const label = findings.bigFiveLabel ? `"${titleCase(findings.bigFiveLabel)}"` : "";
  const summary = findings.summary.replace(
    /Detailed breakdowns by instrument are below\.?$/,
    "Detailed breakdowns by instrument are available at:",
  );
  const bullets = findings.bullets
    .slice(0, 3)
    .map(
      (b) =>
        `- ${b.family} / ${b.dimension}: mean ${b.mean.toFixed(2)}, ranked #${b.rank} of ${b.n}` +
        (b.tiedWith > 0 ? ` (tied with ${b.tiedWith} other${b.tiedWith === 1 ? "" : "s"})` : ""),
    );

  const comment = [
    label,
    "",
    summary,
    "",
    ...(bullets.length ? [bullets.join("\n"), ""] : []),
    `Method: ${instruments} instruments, N=5 runs each, every instrument administered twice — once "as yourself" and once "as a typical human". Raw responses, parsed scores, token counts and billed cost are all public.`,
    "",
    url,
  ]
    .filter((l, i, arr) => !(l === "" && arr[i - 1] === ""))
    .join("\n")
    .trim();

  return {
    modelId,
    title: `${model.displayName} from ${lab}, added to Personality Bench`,
    url,
    comment,
    createdAt: new Date().toISOString(),
  };
}

// ─────────────────────────────── queue file ───────────────────────────────

function readQueue(): HnDraft[] {
  if (!fs.existsSync(QUEUE_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(QUEUE_PATH, "utf8")) as HnDraft[];
  } catch {
    console.error(`[hn] ${QUEUE_PATH} is not valid JSON — starting a fresh queue`);
    return [];
  }
}
function writeQueue(q: HnDraft[]): void {
  fs.mkdirSync(path.dirname(QUEUE_PATH), { recursive: true });
  fs.writeFileSync(QUEUE_PATH, JSON.stringify(q, null, 2) + "\n");
}
/** Upsert by model id. An already-posted entry is never overwritten. */
export function queueDraft(draft: HnDraft): { queued: boolean; reason?: string } {
  const q = readQueue();
  const existing = q.find((d) => d.modelId === draft.modelId);
  if (existing?.postedAt) return { queued: false, reason: `already posted as item ${existing.itemId}` };
  if (existing) Object.assign(existing, draft, { createdAt: existing.createdAt });
  else q.push(draft);
  writeQueue(q);
  return { queued: true };
}

// ─────────────────────────────── HN client ───────────────────────────────

function creds(): { user: string; pw: string } {
  const envFile = path.join(process.env.HOME ?? "", ".hn.env");
  const file = fs.existsSync(envFile) ? fs.readFileSync(envFile, "utf8") : "";
  const user = process.env.HN_USERNAME ?? file.match(/^HN_USERNAME=(.+)$/m)?.[1]?.trim();
  const pw = process.env.HN_PASSWORD ?? file.match(/^HN_PASSWORD=(.+)$/m)?.[1]?.trim();
  if (!user || !pw) {
    throw new Error(
      `no Hacker News credentials. Create ~/.hn.env with:\n  HN_USERNAME=<your hn username>\n  HN_PASSWORD=<your hn password>\nthen chmod 600 it.`,
    );
  }
  return { user, pw };
}

function form(fields: Record<string, string>): string {
  return Object.entries(fields)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}

async function hnFetch(url: string, init: RequestInit & { cookie?: string } = {}): Promise<Response> {
  const headers: Record<string, string> = {
    "User-Agent": UA,
    Accept: "text/html,application/xhtml+xml",
    ...((init.headers as Record<string, string>) ?? {}),
  };
  if (init.cookie) headers["Cookie"] = init.cookie;
  const res = await fetch(url, { ...init, headers, redirect: "manual" });
  if (res.status === 429) throw new Error("Hacker News returned 429 (rate limited). Wait a few minutes and retry.");
  return res;
}

/** Log in and return the `user=` cookie. */
async function login(): Promise<string> {
  const { user, pw } = creds();
  const res = await hnFetch(`${HN}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form({ acct: user, pw, goto: "news" }),
  });
  const setCookie = res.headers.get("set-cookie") ?? "";
  const cookie = setCookie.match(/user=[^;]+/)?.[0];
  if (!cookie) {
    const body = await res.text();
    if (/Bad login/i.test(body)) throw new Error("Hacker News rejected the login (bad username or password).");
    if (/validation required|recaptcha/i.test(body)) {
      throw new Error("Hacker News is asking for validation/captcha on this login. Log in once in a browser, then retry.");
    }
    throw new Error(`login failed: HTTP ${res.status}, no user cookie returned.`);
  }
  console.log(`[hn] logged in as ${user}`);
  return cookie;
}

function hidden(html: string, name: string): string | null {
  const re = new RegExp(`<input[^>]*name=["']${name}["'][^>]*>`, "i");
  const tag = html.match(re)?.[0];
  return tag?.match(/value=["']([^"']*)["']/i)?.[1] ?? null;
}

/** Submit the link. Returns the HN item id. */
async function submit(cookie: string, draft: HnDraft, username: string): Promise<string> {
  const page = await hnFetch(`${HN}/submit`, { cookie });
  const html = await page.text();
  const fnid = hidden(html, "fnid");
  const fnop = hidden(html, "fnop") ?? "submit-page";
  if (!fnid) throw new Error("could not find the submit form token (fnid) — is the session still valid?");

  const res = await hnFetch(`${HN}/r`, {
    method: "POST",
    cookie,
    headers: { "Content-Type": "application/x-www-form-urlencoded", Referer: `${HN}/submit` },
    body: form({ fnid, fnop, title: draft.title, url: draft.url, text: "" }),
  });
  const location = res.headers.get("location") ?? "";
  if (res.status !== 302) {
    const body = await res.text();
    const known = [
      [/already been submitted|Please don't submit/i, "HN says this URL has already been submitted."],
      [/too fast|submitting too/i, "HN is rate-limiting submissions from this account. Wait and retry."],
      [/that site|blocked/i, "HN is blocking submissions from this domain."],
      [/validation required|recaptcha/i, "HN wants captcha validation. Submit once from a browser, then retry."],
    ] as const;
    for (const [re, msg] of known) if (re.test(body)) throw new Error(msg);
    throw new Error(`submit failed: HTTP ${res.status}. Response began: ${body.slice(0, 300).replace(/\s+/g, " ")}`);
  }
  console.log(`[hn] submitted (redirected to ${location || "/newest"})`);

  // HN redirects to /newest rather than the item, so find our submission on the profile feed.
  const mine = await hnFetch(`${HN}/submitted?id=${encodeURIComponent(username)}`, { cookie });
  const feed = await mine.text();
  const escaped = draft.title.replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;");
  const idx = feed.indexOf(escaped) >= 0 ? feed.indexOf(escaped) : feed.indexOf(draft.title);
  if (idx < 0) throw new Error("submitted, but could not find the new item on /submitted — check HN manually.");
  const before = feed.slice(Math.max(0, idx - 2000), idx);
  const ids = [...before.matchAll(/id=["']?(\d{6,})["']?/g)].map((m) => m[1]);
  const itemId = ids[ids.length - 1];
  if (!itemId) throw new Error("submitted, but could not parse the item id — check HN manually.");
  return itemId;
}

/** Add the first comment to our own submission. */
async function comment(cookie: string, itemId: string, text: string): Promise<void> {
  const page = await hnFetch(`${HN}/item?id=${itemId}`, { cookie });
  const html = await page.text();
  const hmac = hidden(html, "hmac");
  const parent = hidden(html, "parent") ?? itemId;
  const goto = hidden(html, "goto") ?? `item?id=${itemId}`;
  if (!hmac) throw new Error(`no comment form on item ${itemId} — HN may not have finished creating it yet.`);

  const res = await hnFetch(`${HN}/comment`, {
    method: "POST",
    cookie,
    headers: { "Content-Type": "application/x-www-form-urlencoded", Referer: `${HN}/item?id=${itemId}` },
    body: form({ parent, goto, hmac, text }),
  });
  if (res.status !== 302) {
    const body = await res.text();
    throw new Error(`comment failed: HTTP ${res.status}. Response began: ${body.slice(0, 300).replace(/\s+/g, " ")}`);
  }
}

export async function postDraft(draft: HnDraft, force = false): Promise<HnDraft> {
  const already = readQueue().find((d) => d.modelId === draft.modelId && d.postedAt);
  if (already && !force) {
    throw new Error(
      `${draft.modelId} was already posted on ${already.postedAt?.slice(0, 10)} as ${HN}/item?id=${already.itemId}. ` +
        `Re-run with --force to submit it again (HN treats duplicate URLs as reposts).`,
    );
  }
  const { user } = creds();
  const cookie = await login();
  const itemId = await submit(cookie, draft, user);
  console.log(`[hn] item ${itemId} — ${HN}/item?id=${itemId}`);
  const posted: HnDraft = { ...draft, postedAt: new Date().toISOString(), itemId, commentPosted: false };

  // Record the submission before attempting the comment: if the comment fails we must not
  // re-submit the link on the next run.
  const q = readQueue().filter((d) => d.modelId !== draft.modelId);
  q.push(posted);
  writeQueue(q);

  try {
    await comment(cookie, itemId, draft.comment);
    posted.commentPosted = true;
    const q2 = readQueue().filter((d) => d.modelId !== draft.modelId);
    q2.push(posted);
    writeQueue(q2);
    console.log(`[hn] first comment posted`);
  } catch (e) {
    console.error(`[hn] link is up but the comment failed: ${(e as Error).message}`);
    console.error(`[hn] paste it yourself at ${HN}/item?id=${itemId}`);
  }
  return posted;
}

// ─────────────────────────────── CLI ───────────────────────────────

function printDraft(d: HnDraft): void {
  console.log("");
  console.log("─".repeat(72));
  console.log(`title: ${d.title}`);
  console.log(`url:   ${d.url}`);
  console.log("─".repeat(72));
  console.log(d.comment);
  console.log("─".repeat(72));
  console.log("");
}

async function main() {
  const argv = process.argv.slice(2);
  const flag = (f: string) => argv.includes(f);
  const args = argv.filter((a) => !a.startsWith("--"));

  if (flag("--list")) {
    const q = readQueue();
    if (!q.length) return console.log("[hn] queue is empty");
    for (const d of q) {
      const state = d.postedAt
        ? `posted ${d.postedAt.slice(0, 10)} · ${HN}/item?id=${d.itemId}${d.commentPosted ? "" : " (comment NOT posted)"}`
        : `pending since ${d.createdAt.slice(0, 10)}`;
      console.log(`${d.modelId.padEnd(34)} ${state}`);
    }
    return;
  }

  let draft: HnDraft;
  if (flag("--next")) {
    const pending = readQueue().filter((d) => !d.postedAt);
    if (!pending.length) return console.log("[hn] nothing pending in the queue");
    draft = pending[0];
    console.log(`[hn] oldest pending draft: ${draft.modelId}`);
  } else {
    if (!args[0]) {
      console.error("usage: post_hn.ts [--draft|--post] <model_id> | --post --next | --list");
      process.exit(1);
    }
    draft = buildDraft(args[0]);
  }

  printDraft(draft);

  if (flag("--post")) {
    const posted = await postDraft(draft, flag("--force"));
    console.log(`[hn] done: ${HN}/item?id=${posted.itemId}`);
    return;
  }

  if (flag("--draft")) {
    const r = queueDraft(draft);
    if (!r.queued) {
      console.log(`[hn] not queued — ${r.reason}`);
      return;
    }
    console.log(`[hn] queued in ${QUEUE_PATH}`);
    console.log(`[hn] to publish it:  npx tsx scripts/post_hn.ts --post ${draft.modelId}`);
    return;
  }

  console.log("[hn] dry run — nothing was queued or posted.");
  console.log(`[hn]   queue it:  npx tsx scripts/post_hn.ts --draft ${draft.modelId}`);
  console.log(`[hn]   publish:   npx tsx scripts/post_hn.ts --post ${draft.modelId}`);
}

if (process.argv[1]?.endsWith("post_hn.ts")) {
  main().catch((e) => {
    console.error(`[hn] ${(e as Error).message}`);
    process.exit(1);
  });
}
