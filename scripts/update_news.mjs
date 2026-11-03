import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { discoverArticles, fetchHtml, parseArticleHtml } from "./ltn_article.mjs";
import { understandArticle, VERSION } from "./news_understanding.mjs";
import { buildNewsSnapshot, validateNewsSnapshot } from "./news_records.mjs";
import { assistUnresolved } from "./news_assistance.mjs";
import { tokenizeArticle } from "./news_tokenizer.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const digest = (s) => crypto.createHash("sha256").update(s).digest("hex");
const help = `Usage: npm run news:update -- [options]
  --from YYYY-MM-DD --to YYYY-MM-DD   Publication date window (Asia/Taipei).
  --input FILE                       Replay normalized {articles:[...]} or captured HTML.
  --base FILE                        Existing incidents; default public/data/incidents.json.
  --state FILE                       Previous state; default .news-state/state.json.
  --rejections FILE                  Persistently excluded source URLs (JSON array).
  --output DIR                       Snapshot directory; default .news-output/latest.
  --dry-run                          Explicitly request the default non-publishing operation.
  --help                            Show help.
No command in this program commits, changes public data, or deploys. A ready manifest is
written only after the complete snapshot validates. Use news:publish separately.
Without dates, replay covers its input dates; live collection checks seven completed
Taipei days and catches up from the previous successful date (at most seven days/run).
`;

function argsOf(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (["--help", "-h"].includes(key)) { args.help = true; continue; }
    if (key === "--dry-run") { args.dryRun = true; continue; }
    if (!["--from", "--to", "--input", "--base", "--state", "--output", "--rejections"].includes(key) || !argv[i + 1] || argv[i + 1].startsWith("--")) throw new Error(`Invalid option: ${key}`);
    args[key.slice(2)] = argv[++i];
  }
  if (Boolean(args.from) !== Boolean(args.to)) throw new Error("Use both --from and --to.");
  return args;
}

function date(value) {
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(value) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) throw new Error(`Invalid date: ${value}`);
  return value;
}
function shift(value, days) { return new Date(Date.parse(`${date(value)}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10); }
async function readJson(file, optional = false) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); }
  catch (error) { if (optional && error.code === "ENOENT") return null; throw error; }
}
async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const content = JSON.stringify(value, null, 2) + "\n";
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, content); await fs.rename(tmp, file);
  return digest(content);
}

function inputsOf(value) {
  const entries = Array.isArray(value) ? value : value.articles;
  if (!entries || typeof entries !== "object") throw new Error("Replay input must contain articles.");
  if (Array.isArray(entries)) return entries.map((item) => item.body ? item : (() => { throw new Error("Replay articles require full body."); })());
  return Object.entries(entries).map(([url, entry]) => {
    if (typeof entry === "string") return parseArticleHtml(entry, { url });
    if (entry.status && entry.status !== 200) throw new Error(`Captured source failed: ${url}`);
    return parseArticleHtml(entry.body, { url });
  });
}

async function main() {
  const args = argsOf(process.argv.slice(2));
  if (args.help) { console.log(help); return; }
  const output = path.resolve(args.output || path.join(root, ".news-output/latest"));
  const publicRoot = path.join(root, "public");
  if (output === root || output === publicRoot || output.startsWith(publicRoot + path.sep)) throw new Error("Snapshot output cannot overwrite the repository or public directory.");
  const checkedAt = new Date().toISOString();
  const report = { version: 1, status: "failed", checkedAt, interpretationVersion: VERSION, articles: [] };
  await fs.mkdir(output, { recursive: true });
  await fs.rm(path.join(output, "manifest.json"), { force: true });
  try {
    const baseBytes = await fs.readFile(path.resolve(args.base || path.join(root, "public/data/incidents.json")));
    const baseIncidents = JSON.parse(baseBytes);
    if (!Array.isArray(baseIncidents) || !baseIncidents.length) throw new Error("Historical base must be a non-empty incidents array.");
    let stateBytes = null;
    try { stateBytes = await fs.readFile(path.resolve(args.state || path.join(root, ".news-state/state.json"))); }
    catch (error) { if (error.code !== "ENOENT" || args.state) throw error; }
    const previousState = stateBytes ? JSON.parse(stateBytes) : null;
    const inputs = { baseSha256: digest(baseBytes), stateSha256: stateBytes ? digest(stateBytes) : null };
    const apiDate = checkedAt.slice(0, 10);
    const apiBudget = { date: apiDate, runRequests: 0, requests: previousState?.api?.date === apiDate ? previousState.api.requests || 0 : 0,
      cache: { ...(previousState?.api?.cache || {}) } };
    const existingRejections = previousState?.rejectedUrls || [];
    const additionalRejections = args.rejections ? await readJson(path.resolve(args.rejections)) : [];
    if ([existingRejections, additionalRejections].some((list) => !Array.isArray(list) || list.some((v) => typeof v !== "string"))) throw new Error("Rejections must be an array of URLs.");
    const rejectedUrls = [...new Set([...existingRejections, ...additionalRejections])];
    // A zero-result day must still fail closed if the required parser is broken.
    await tokenizeArticle({ title: "", body: "" });
    let articles, from, to;
    if (args.input) {
      articles = inputsOf(await readJson(path.resolve(args.input)));
      if (!articles.length) throw new Error("Replay input is empty.");
      const dates = articles.map((a) => date(a.publishedAt)).sort();
      from = args.from || dates[0]; to = args.to || dates.at(-1);
    } else {
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(checkedAt));
      to = args.to || shift(today, -1); from = args.from || shift(to, -6);
      const last = previousState?.throughDate;
      if (!args.from && last && last < from) { from = shift(last, 1); to = [to, shift(from, 6)].sort()[0]; }
      date(from); date(to);
      if (from > to) throw new Error("--from must not be after --to.");
      if (last && from > shift(last, 1)) throw new Error(`Date window skips uncollected dates after ${last}; start no later than ${shift(last, 1)}.`);
      articles = [];
      const listings = await discoverArticles({ from, to });
      report.discovered = listings.length;
      for (const listing of listings) {
        if (rejectedUrls.includes(listing.url)) continue;
        console.log(`Fetch ${listing.url}`);
        const article = parseArticleHtml(await fetchHtml(listing.url), listing);
        articles.push(article); await delay(300);
      }
    }
    date(from); date(to);
    if (from > to) throw new Error("--from must not be after --to.");
    Object.assign(report, { from, to, mode: args.input ? "replay" : "live" });
    const analyses = [];
    const seen = new Map();
    for (const article of articles) {
      if (article.publishedAt < from || article.publishedAt > to || rejectedUrls.includes(article.url)) continue;
      const bodyHash = digest(article.body);
      if (seen.has(article.url)) {
        if (seen.get(article.url) !== bodyHash) throw new Error(`Conflicting captured versions of ${article.url}`);
        continue;
      }
      seen.set(article.url, bodyHash);
      const result = await understandArticle(article);
      if (result.article.related && (result.issues.length || result.events.some((e) => e.issues.some((i) => /unresolved|ambiguous|conflict/.test(i))))) {
        result.assistance = await assistUnresolved(article, result, apiBudget);
      }
      analyses.push(result);
      report.articles.push({ ...result.article, disposition: result.disposition, issues: result.issues, eventCount: result.events.length, lexical: result.lexical });
    }
    // Replay must not falsely advance a live collector's watermark.
    const previousThrough = previousState?.throughDate || null;
    const coversNextDay = !previousThrough || (from <= shift(previousThrough, 1) && to >= shift(previousThrough, 1));
    const throughDate = args.input ? previousThrough : coversNextDay ? to : previousThrough;
    const snapshot = buildNewsSnapshot({ baseIncidents, previousState, analyses, checkedAt, throughDate, rejectedUrls });
    snapshot.state.api = apiBudget;
    validateNewsSnapshot(snapshot);
    const files = {};
    files["public/data/incidents.json"] = await writeJson(path.join(output, "public/data/incidents.json"), snapshot.incidents);
    files["public/data/news.json"] = await writeJson(path.join(output, "public/data/news.json"), snapshot.news);
    files["public/data/news-status.json"] = await writeJson(path.join(output, "public/data/news-status.json"), snapshot.status);
    files["state.json"] = await writeJson(path.join(output, "state.json"), snapshot.state);
    Object.assign(report, { status: "ready", ...snapshot.report, analyzed: analyses.length });
    await writeJson(path.join(output, "analysis.json"), analyses);
    await writeJson(path.join(output, "report.json"), report);
    // Full sources are a local replay artifact, never part of the publish manifest.
    await writeJson(path.join(output, "sources.json"), { articles });
    await writeJson(path.join(output, "manifest.json"), { version: 1, status: "ready", createdAt: checkedAt, mode: report.mode, inputs, files });
    console.log(`Ready: ${analyses.length} articles; ${snapshot.incidents.length} events. Snapshot: ${output}`);
  } catch (error) {
    report.status = "failed"; report.error = error.message;
    await writeJson(path.join(output, "report.json"), report);
    throw error;
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
