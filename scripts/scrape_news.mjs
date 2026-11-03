import fs from "node:fs/promises";

// Retained as data:validate. Collection is implemented only in update_news.mjs,
// which produces a snapshot instead of writing directly into public data.
const args = process.argv.slice(2);
let output = "public/data/incidents.json";
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--validate") continue;
  if (args[i] === "--help" || args[i] === "-h") {
    console.log("npm run data:validate -- [--output FILE]\nCollect with npm run news:update -- --help.");
    process.exit(0);
  }
  if (args[i] === "--output" && args[i + 1] && !args[i + 1].startsWith("--")) { output = args[++i]; continue; }
  throw new Error(`Unsupported validation option: ${args[i]}. Use news:update for collection.`);
}

const items = JSON.parse(await fs.readFile(output, "utf8"));
if (!Array.isArray(items) || !items.length) throw new Error("Incidents must be a non-empty array; preserve historical records.");
const ids = new Set();
for (const row of items) {
  if (!row.id || ids.has(row.id) || !row.title || !row.url || typeof row.city !== "string") throw new Error(`Invalid incident: ${row.id}`);
  ids.add(row.id);
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(row.publishedAt) || new Date(`${row.publishedAt}T00:00:00Z`).toISOString().slice(0, 10) !== row.publishedAt) throw new Error(`Invalid publication date: ${row.id}`);
  for (const field of ["deaths", "injuries"]) {
    if (row[field] !== null && (!Number.isSafeInteger(row[field]) || row[field] < 0)) throw new Error(`Invalid ${field}: ${row.id}`);
  }
  const q = row.dataQuality || {};
  if (q.verificationStatus === "legacy" && (q.includeInStats || q.mapEligible)) throw new Error(`Unverified legacy incident in statistics: ${row.id}`);
  if (q.verificationStatus === "machine_checked" && (!q.eventCountValid || !q.publicationChecks?.driverLinked || !q.publicationChecks?.dateChecked)) throw new Error(`Missing event checks: ${row.id}`);
  if (!q.verificationStatus && q.flags?.includes("automated_candidate") && q.includeInStats !== false && q.needsHumanReview !== false) throw new Error(`Unreviewed legacy candidate in statistics: ${row.id}`);
}
console.log(`Validated ${items.length} incidents. Publication also validates news, state, evidence and manifest hashes.`);
