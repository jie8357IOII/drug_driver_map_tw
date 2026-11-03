import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";

// Include explicitly fetched merged data-PR heads: their review history survives squash merges.
const file = "public/data/incidents.json";
const git = (...args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
const commits = git("log", "--format=%H", "HEAD", ...process.argv.slice(3), "--", file).trim().split("\n").filter(Boolean);
const rejected = new Set();
function urls(items) {
  return new Set(items.flatMap((item) => [item, ...(item.relatedReports || [])]).filter((item) => item.url).map((item) => {
    const url = new URL(item.url);
    url.search = "";
    url.hash = "";
    return url.href;
  }));
}
for (const commit of commits) {
  const parent = git("rev-list", "--parents", "-n", "1", commit).trim().split(" ")[1];
  if (!parent) continue;
  if (!git("ls-tree", "--name-only", parent, "--", file).trim()) continue;
  const before = urls(JSON.parse(git("show", `${parent}:${file}`)));
  const after = git("ls-tree", "--name-only", commit, "--", file).trim()
    ? urls(JSON.parse(git("show", `${commit}:${file}`))) : new Set();
  for (const url of before) if (!after.has(url)) rejected.add(url);
}
if (!process.argv[2]) throw new Error("Provide an output JSON path.");
await fs.writeFile(process.argv[2], JSON.stringify([...rejected].sort(), null, 2) + "\n");
