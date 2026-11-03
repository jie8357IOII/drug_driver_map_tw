#!/usr/bin/env node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const root = fileURLToPath(new URL("../", import.meta.url));
const publicFiles = ["incidents.json", "news.json", "news-status.json"].map((name) => `public/data/${name}`);
const hashedFiles = [...publicFiles, "state.json"];
const snapshotFiles = [...hashedFiles, "manifest.json"];
const metadataFiles = ["publication.json", "published.json"];
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const json = (value) => Buffer.from(JSON.stringify(value, null, 2) + "\n");
const taipeiDate = (time = Date.now()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(time));

function run(command, args, options = {}) {
  return execFileSync(command, args, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...options });
}
const git = (args, options) => run("git", args, options).trim();

function help() {
  console.log(`Usage:
  npm run news:publish -- --snapshot DIR [--dry-run] [--allow-replay]

--dry-run checks the ready manifest and all four SHA-256 hashes, without writing,
network access, crawling, building, pushing, or deployment. Replay is allowed here.
Default publication requires main at origin/main, no code changes, gh login,
repository write permission, and Pages Source = GitHub Actions. Generate from the
latest news-data incidents/state (custom --base/--state paths are supported by the
generator). The manifest's input hashes must match that durable baseline. Changes
to public data are allowed; code changes are not. The exact snapshot is uploaded to
news-upload/<hash>, then update-news.yml
is dispatched on main under the shared pages lock. This submits publication; inspect
Actions for deployment/readback completion. --allow-replay explicitly permits replay.
A saved snapshot awaiting publication must be retried before any different snapshot.

Manifest: version:1, status:"ready", mode:"live"|"replay", files maps exactly
public/data/{incidents,news,news-status}.json and state.json to SHA-256 hex strings.
Formal publication also requires inputs:{baseSha256,stateSha256}, hashing the raw
generator inputs (stateSha256:null on bootstrap). Dry-run accepts older manifests.
Only these four files, manifest.json, and publisher metadata enter news-data.
analysis.json, report.json, sources.json and raw/cache files are never persisted or
deployed. Only the three public JSON files and a build identity enter the Pages site.

Actions helpers (no crawling; require GITHUB_ACTIONS=true and main):
  --restore DIR [--catch-up]           Restore news-data; output update/retry/skip.
  --import REF --sha SHA --output DIR  Import an exact local upload; check its base.
  --snapshot DIR --prepare             Validate and copy public data into checkout.
  --snapshot DIR --check-dist DIR      Check built hashes; add code/snapshot identity.
  --snapshot DIR --persist             Persist the built snapshot without force-push.
  --snapshot DIR --verify-url URL      Read back all hashes, then record success.
    --no-record                       Read-only verification for code deployment.
NEWS_DATA_SHA must come from --restore (or --persist for readback).
NEWS_COLLECTION_DATE is set only for fresh automatic, default-range collection.
--allow-replay is required for all publication helpers handling a replay snapshot.
No wrapper script or extra npm dependencies are required.`);
}

function parseArgs(argv) {
  const args = {};
  const values = ["snapshot", "restore", "import", "sha", "output", "check-dist", "verify-url"];
  const flags = ["dry-run", "prepare", "persist", "catch-up", "allow-replay", "no-record"];
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i].replace(/^--/, "");
    if (argv[i] === "--help" || argv[i] === "-h") return { help: true };
    if (args[key] !== undefined || !argv[i].startsWith("--")) throw new Error(`Unexpected argument: ${argv[i]}`);
    if (values.includes(key)) {
      if (!argv[i + 1] || argv[i + 1].startsWith("--")) throw new Error(`--${key} requires a value.`);
      args[key] = argv[++i];
    } else if (flags.includes(key)) args[key] = true;
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if (["restore", "import", "dry-run", "prepare", "persist", "check-dist", "verify-url"].filter((key) => args[key]).length > 1) throw new Error("Choose one operation at a time.");
  if (!args.restore && !args.import && !args.snapshot) throw new Error("--snapshot DIR is required; see --help.");
  if (args["catch-up"] && !args.restore) throw new Error("--catch-up requires --restore.");
  if ((args.sha || args.output) && !args.import) throw new Error("--sha and --output require --import.");
  if ((args.restore || args.import) && args.snapshot) throw new Error("Do not combine --snapshot with restore/import.");
  if (args["no-record"] && !args["verify-url"]) throw new Error("--no-record requires --verify-url.");
  return args;
}

async function outputs(values) {
  for (const [key, value] of Object.entries(values)) {
    console.log(`${key}=${value}`);
    if (process.env.GITHUB_OUTPUT) await fs.appendFile(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
  }
}

function validate(buffers) {
  const manifest = JSON.parse(buffers["manifest.json"]);
  if (manifest.version !== 1 || manifest.status !== "ready" || !["live", "replay"].includes(manifest.mode) || !manifest.files || Array.isArray(manifest.files)) throw new Error("Snapshot requires a version:1 ready manifest with live/replay mode and files mapping.");
  if (Object.keys(manifest.files).sort().join("\n") !== [...hashedFiles].sort().join("\n")) throw new Error("Manifest must hash exactly the three public JSON files and state.json.");
  for (const file of hashedFiles) {
    JSON.parse(buffers[file]);
    if (!/^[a-f0-9]{64}$/.test(manifest.files[file]) || sha256(buffers[file]) !== manifest.files[file]) throw new Error(`Snapshot hash mismatch: ${file}`);
  }
  const id = sha256(snapshotFiles.map((file) => `${file}:${sha256(buffers[file])}\n`).join(""));
  return { buffers, manifest, id };
}

function requireLive(snapshot, allowReplay) {
  if (snapshot.manifest.mode === "replay" && !allowReplay) throw new Error("Replay cannot be published without explicit --allow-replay; --dry-run is safe.");
}

async function readSnapshot(directory) {
  const resolved = await fs.realpath(directory);
  const buffers = {};
  for (const file of snapshotFiles) {
    const target = await fs.realpath(path.join(resolved, file));
    if (!target.startsWith(resolved + path.sep) || !(await fs.stat(target)).isFile()) throw new Error(`Snapshot file escapes directory: ${file}`);
    buffers[file] = await fs.readFile(target);
  }
  return validate(buffers);
}

async function validateRecords(snapshot) {
  const { validateNewsSnapshot } = await import("./news_records.mjs");
  validateNewsSnapshot({
    incidents: JSON.parse(snapshot.buffers[publicFiles[0]]), news: JSON.parse(snapshot.buffers[publicFiles[1]]),
    status: JSON.parse(snapshot.buffers[publicFiles[2]]), state: JSON.parse(snapshot.buffers["state.json"]),
  });
  if (snapshot.manifest.mode === "live" && !/^20\d{2}-\d{2}-\d{2}$/.test(JSON.parse(snapshot.buffers["state.json"]).throughDate || "")) throw new Error("A live snapshot requires a collection watermark.");
}

function remoteHead(branch) {
  const line = git(["ls-remote", "--heads", "origin", `refs/heads/${branch}`]);
  if (!line) return "none";
  const [sha, ref] = line.split(/\s+/);
  if (!/^[a-f0-9]{40}$/.test(sha) || ref !== `refs/heads/${branch}`) throw new Error(`Unexpected remote ref: ${branch}`);
  return sha;
}

function requireActions() {
  if (process.env.GITHUB_ACTIONS !== "true" || process.env.GITHUB_REF !== "refs/heads/main") throw new Error("This helper runs only in Actions on main; use --dry-run or the default local publisher.");
}

function expectedBase() {
  const value = process.env.NEWS_DATA_SHA;
  if (value !== "none" && !/^[a-f0-9]{40}$/.test(value || "")) throw new Error("NEWS_DATA_SHA must come from --restore.");
  return value;
}

function assertBase(expected) {
  if (remoteHead("news-data") !== expected) throw new Error("news-data changed; restore the latest state and retry. Never force-push.");
}

function fetchBranch(branch, sha) {
  git(["fetch", "--no-tags", "origin", `refs/heads/${branch}`]);
  if (git(["rev-parse", "FETCH_HEAD"]) !== sha) throw new Error(`${branch} changed during fetch; retry.`);
}

function fromCommit(sha) {
  const buffers = {};
  for (const file of snapshotFiles) buffers[file] = run("git", ["show", `${sha}:${file}`], { encoding: "buffer" });
  const snapshot = validate(buffers);
  const names = git(["ls-tree", "--name-only", sha]).split("\n");
  for (const file of metadataFiles) if (names.includes(file)) snapshot.buffers[file] = run("git", ["show", `${sha}:${file}`], { encoding: "buffer" });
  return snapshot;
}

function inputHashes(snapshot) {
  const inputs = snapshot.manifest.inputs;
  if (!inputs || !/^[a-f0-9]{64}$/.test(inputs.baseSha256) || !(inputs.stateSha256 === null || /^[a-f0-9]{64}$/.test(inputs.stateSha256))) throw new Error("Publication requires manifest.inputs baseSha256/stateSha256 from the generator; regenerate this snapshot.");
  return inputs;
}

function checkSnapshotBase(snapshot, base) {
  let previous;
  if (base !== "none") {
    fetchBranch("news-data", base);
    previous = fromCommit(base);
    // Persistence may have succeeded before deployment failed. Resume that exact
    // snapshot without requiring its original inputs to equal its own outputs.
    if (previous.id === snapshot.id) return previous;
    const published = JSON.parse(previous.buffers["published.json"] || "null");
    if (published?.snapshotId !== previous.id) throw new Error("A different saved snapshot is awaiting publication. Retry update-news.yml without snapshot_ref or dates first; only that same snapshot may be imported while pending.");
  }
  const inputs = inputHashes(snapshot);
  const incidents = previous?.buffers["public/data/incidents.json"] || run("git", ["show", "HEAD:public/data/incidents.json"], { encoding: "buffer" });
  const stateHash = previous ? sha256(previous.buffers["state.json"]) : null;
  if (inputs.baseSha256 !== sha256(incidents) || inputs.stateSha256 !== stateHash) throw new Error("Snapshot was generated from stale or different inputs. Regenerate using the latest news-data incidents/state (main incidents and no state on bootstrap).");
  return previous;
}

async function writeSnapshot(directory, snapshot) {
  await fs.mkdir(directory, { recursive: true });
  if ((await fs.readdir(directory)).length) throw new Error(`Restore destination must be empty: ${directory}`);
  // Write ready last, so an interrupted copy is not mistaken for a snapshot.
  for (const file of [...hashedFiles, ...metadataFiles, "manifest.json"]) {
    if (!snapshot.buffers[file]) continue;
    await fs.mkdir(path.dirname(path.join(directory, file)), { recursive: true });
    await fs.writeFile(path.join(directory, file), snapshot.buffers[file]);
  }
}

async function restore(args) {
  requireActions();
  const sha = remoteHead("news-data");
  if (sha === "none") return outputs({ news_data_sha: sha, mode: "update", has_snapshot: "false" });
  fetchBranch("news-data", sha);
  const snapshot = fromCommit(sha);
  const publication = JSON.parse(snapshot.buffers["publication.json"] || "null");
  const published = JSON.parse(snapshot.buffers["published.json"] || "null");
  if (publication?.snapshotId !== snapshot.id) throw new Error("news-data publication metadata does not match the snapshot.");
  await writeSnapshot(args.restore, snapshot);
  const state = JSON.parse(snapshot.buffers["state.json"]);
  const complete = published?.snapshotId === snapshot.id;
  const caughtUp = snapshot.manifest.mode === "live" && state.throughDate >= taipeiDate(Date.now() - 86400000);
  const mode = !complete ? "retry" : args["catch-up"] && caughtUp && publication.collectionDate === taipeiDate() ? "skip" : "update";
  await outputs({ news_data_sha: sha, mode, has_snapshot: "true" });
}

async function importUpload(args) {
  requireActions();
  if (!/^news-upload\/[a-f0-9]{64}$/.test(args.import) || !/^[a-f0-9]{40}$/.test(args.sha || "") || !args.output) throw new Error("Import requires news-upload/<snapshot hash>, exact --sha, and --output DIR.");
  const base = expectedBase();
  assertBase(base);
  fetchBranch(args.import, args.sha);
  const snapshot = fromCommit(args.sha);
  requireLive(snapshot, args["allow-replay"]);
  const metadata = JSON.parse(snapshot.buffers["publication.json"] || "null");
  if (metadata?.snapshotId !== snapshot.id || args.import !== `news-upload/${snapshot.id}`) throw new Error("Upload identity does not match its pinned snapshot.");
  const saved = checkSnapshotBase(snapshot, base);
  // A published.json-only commit may advance the ref without changing inputs.
  if (saved?.id !== snapshot.id && metadata.codeSha !== git(["rev-parse", "HEAD"])) throw new Error("Upload main SHA changed; regenerate using current main.");
  await writeSnapshot(args.output, snapshot);
}

async function prepare(snapshot) {
  requireActions();
  assertBase(expectedBase());
  checkSnapshotBase(snapshot, expectedBase());
  await validateRecords(snapshot);
  for (const file of publicFiles) {
    await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await fs.writeFile(path.join(root, file), snapshot.buffers[file]);
  }
}

function buildRecord(snapshot) {
  return { version: 1, codeSha: git(["rev-parse", "HEAD"]), snapshotId: snapshot.id, files: Object.fromEntries(publicFiles.map((file) => [file, snapshot.manifest.files[file]])) };
}

async function checkDist(snapshot, directory) {
  requireActions();
  for (const file of publicFiles) if (sha256(await fs.readFile(path.join(directory, file.replace(/^public\//, "")))) !== snapshot.manifest.files[file]) throw new Error(`Build changed snapshot data: ${file}`);
  await fs.writeFile(path.join(directory, "news-build.json"), json(buildRecord(snapshot)));
}

async function commitFiles(buffers, parent, branch, message) {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "news-git-"));
  // An isolated index preserves the caller's checkout, staging area and branch.
  const env = { ...process.env, GIT_INDEX_FILE: path.join(temporary, "index") };
  if (process.env.GITHUB_ACTIONS === "true") Object.assign(env, {
    GIT_AUTHOR_NAME: "github-actions[bot]", GIT_COMMITTER_NAME: "github-actions[bot]",
    GIT_AUTHOR_EMAIL: "41898282+github-actions[bot]@users.noreply.github.com",
    GIT_COMMITTER_EMAIL: "41898282+github-actions[bot]@users.noreply.github.com",
  });
  try {
    git(["read-tree", "--empty"], { env });
    for (const [file, buffer] of Object.entries(buffers)) {
      if (![...snapshotFiles, ...metadataFiles].includes(file)) throw new Error(`Refusing to persist non-publication file: ${file}`);
      const blob = git(["hash-object", "-w", "--stdin"], { env, input: buffer });
      git(["update-index", "--add", "--cacheinfo", `100644,${blob},${file}`], { env });
    }
    const tree = git(["write-tree"], { env });
    const sha = git(["commit-tree", tree, ...(parent === "none" ? [] : ["-p", parent]), "-m", message], { env });
    // A normal fast-forward push fails if another writer advanced the branch.
    git(["push", "origin", `${sha}:refs/heads/${branch}`], { env });
    return sha;
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
}

async function persist(snapshot) {
  requireActions();
  const base = expectedBase();
  assertBase(base);
  const build = JSON.parse(await fs.readFile(path.join(root, "dist/news-build.json")));
  if (JSON.stringify(build) !== JSON.stringify(buildRecord(snapshot))) throw new Error("Build identity mismatch; build and --check-dist first.");
  const previous = checkSnapshotBase(snapshot, base);
  if (previous) {
    if (previous.id === snapshot.id) return outputs({ news_data_sha: base });
    const oldDate = JSON.parse(previous.buffers["state.json"]).throughDate;
    const newDate = JSON.parse(snapshot.buffers["state.json"]).throughDate;
    if (oldDate && (!newDate || newDate < oldDate)) throw new Error("Refusing to move the live collection watermark backwards.");
  }
  const collectionDate = process.env.NEWS_COLLECTION_DATE || null;
  if (collectionDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(collectionDate)) throw new Error("Invalid NEWS_COLLECTION_DATE.");
  snapshot.buffers["publication.json"] = json({ version: 1, snapshotId: snapshot.id, codeSha: build.codeSha, baseCommit: base, collectionDate, savedAt: new Date().toISOString() });
  if (previous?.buffers["published.json"]) snapshot.buffers["published.json"] = previous.buffers["published.json"];
  const sha = await commitFiles(snapshot.buffers, base, "news-data", `Save news snapshot ${snapshot.id}`);
  await outputs({ news_data_sha: sha });
}

async function verifyPublished(snapshot, pageUrl, noRecord) {
  requireActions();
  const base = expectedBase();
  assertBase(base);
  const url = new URL(pageUrl);
  if (url.protocol !== "https:") throw new Error("Pages readback requires HTTPS.");
  const expected = buildRecord(snapshot);
  let error;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const fetchFile = async (relative) => {
        const target = new URL(`${url.href.replace(/\/$/, "")}/${relative}`);
        target.searchParams.set("run", `${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}-${attempt}`);
        const response = await fetch(target, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
        if (!response.ok) throw new Error(`Pages returned ${response.status} for ${relative}`);
        return Buffer.from(await response.arrayBuffer());
      };
      const actual = JSON.parse(await fetchFile("news-build.json"));
      if (actual.codeSha !== expected.codeSha || actual.snapshotId !== expected.snapshotId) throw new Error("Pages code SHA/snapshot does not match this run.");
      for (const file of publicFiles) if (sha256(await fetchFile(file.replace(/^public\//, ""))) !== snapshot.manifest.files[file]) throw new Error(`Pages hash mismatch: ${file}`);
      error = null;
      break;
    } catch (failure) {
      error = failure;
      console.error(`Readback ${attempt}/5: ${failure.message}`);
      if (attempt < 5) await delay(5000);
    }
  }
  if (error) throw error;
  assertBase(base);
  fetchBranch("news-data", base);
  const saved = fromCommit(base);
  if (saved.id !== snapshot.id) throw new Error("Published snapshot differs from durable state.");
  if (!noRecord) {
    saved.buffers["published.json"] = json({ ...expected, publishedAt: new Date().toISOString(), pageUrl: url.href, runId: process.env.GITHUB_RUN_ID });
    await commitFiles(saved.buffers, base, "news-data", `Confirm published news ${snapshot.id}`);
  }
  const summary = `Published code ${expected.codeSha}; snapshot ${snapshot.id}. All three public data hashes match Pages.\n`;
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
}

async function publishLocal(snapshot, allowReplay) {
  if (process.env.GITHUB_ACTIONS === "true") throw new Error("Actions must use explicit prepare/persist/verify helpers.");
  const changed = git(["diff", "--name-only", "HEAD"]).split("\n").filter(Boolean);
  if (git(["branch", "--show-current"]) !== "main" || changed.some((file) => !publicFiles.includes(file))) throw new Error("Local publication requires main with no code changes; restored public data and untracked snapshots are allowed.");
  const origin = git(["remote", "get-url", "origin"]);
  const match = origin.match(/^(?:https:\/\/github\.com\/|git@github\.com:)([^/]+\/[^/]+?)(?:\.git)?$/);
  if (!match) throw new Error("origin must identify a GitHub.com repository (HTTPS or SSH).");
  const repo = match[1];
  const pushRepo = git(["remote", "get-url", "--push", "origin"]).match(/^(?:https:\/\/github\.com\/|git@github\.com:)([^/]+\/[^/]+?)(?:\.git)?$/)?.[1];
  if (pushRepo?.toLowerCase() !== repo.toLowerCase()) throw new Error("origin fetch and push URLs must identify the same GitHub repository.");
  const codeSha = git(["rev-parse", "HEAD"]);
  if (remoteHead("main") !== codeSha) throw new Error("Local main must equal origin/main before publication.");
  git(["var", "GIT_AUTHOR_IDENT"]);
  run("gh", ["auth", "status", "--hostname", "github.com"], { stdio: "pipe" });
  const permissions = JSON.parse(run("gh", ["api", "--hostname", "github.com", `repos/${repo}`]));
  if (permissions.permissions?.push !== true) throw new Error("GitHub identity requires repository contents write permission.");
  const workflow = JSON.parse(run("gh", ["api", "--hostname", "github.com", `repos/${repo}/actions/workflows/update-news.yml`]));
  if (workflow.state !== "active") throw new Error("Enable update-news.yml on main; dispatch requires Actions write permission.");
  const pages = JSON.parse(run("gh", ["api", "--hostname", "github.com", `repos/${repo}/pages`]));
  if (pages.build_type !== "workflow") throw new Error("Configure Pages Source as GitHub Actions before publication.");
  await validateRecords(snapshot);
  const base = remoteHead("news-data");
  const saved = checkSnapshotBase(snapshot, base);
  snapshot.buffers["publication.json"] = json({ version: 1, snapshotId: snapshot.id, codeSha, baseCommit: base });
  const branch = `news-upload/${snapshot.id}`;
  let sha = remoteHead(branch);
  if (sha === "none") sha = await commitFiles(snapshot.buffers, "none", branch, `Upload news snapshot ${snapshot.id}`);
  else {
    fetchBranch(branch, sha);
    const upload = fromCommit(sha);
    const metadata = JSON.parse(upload.buffers["publication.json"] || "null");
    if (upload.id !== snapshot.id || metadata?.snapshotId !== snapshot.id || (saved?.id !== snapshot.id && metadata.codeSha !== codeSha)) throw new Error("Existing upload has a different snapshot or code SHA; regenerate the snapshot.");
  }
  console.log(`Upload retained: ${branch} @ ${sha}\nRetry inputs: snapshot_ref=${branch}, snapshot_sha=${sha}, allow_replay=${Boolean(allowReplay)}`);
  run("gh", ["workflow", "run", "update-news.yml", "--repo", `https://github.com/${repo}`, "--ref", "main", "--json"], { input: JSON.stringify({ snapshot_ref: branch, snapshot_sha: sha, allow_replay: Boolean(allowReplay) }), stdio: ["pipe", "inherit", "inherit"] });
  console.log(`Submitted this exact snapshot. Check https://github.com/${repo}/actions/workflows/update-news.yml for deployment/readback completion.`);
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) help();
  else if (args.restore) await restore(args);
  else if (args.import) await importUpload(args);
  else {
    const snapshot = await readSnapshot(args.snapshot);
    if (args["dry-run"]) console.log(JSON.stringify({ status: "validated", mode: snapshot.manifest.mode, snapshotId: snapshot.id, files: snapshot.manifest.files, effects: "none" }, null, 2));
    else {
      requireLive(snapshot, args["allow-replay"]);
      if (args.prepare) await prepare(snapshot);
      else if (args["check-dist"]) await checkDist(snapshot, args["check-dist"]);
      else if (args.persist) await persist(snapshot);
      else if (args["verify-url"]) await verifyPublished(snapshot, args["verify-url"], args["no-record"]);
      else await publishLocal(snapshot, args["allow-replay"]);
    }
  }
} catch (error) {
  console.error(`News publication stopped: ${error.message}`);
  process.exitCode = 1;
}
