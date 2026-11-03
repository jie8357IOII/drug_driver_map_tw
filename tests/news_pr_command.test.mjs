import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { buildNewsSnapshot } from "../scripts/news_records.mjs";
import { sandbox, treeHashes, writeSnapshot, checkedOld, checkedAt, json } from "./news-test-helpers.mjs";

test("retired PR wrapper rejects execution without touching Git, staged edits or user files", async (t) => {
  const ctx = await sandbox(t, ["update_news_pr.sh"]);
  const git = (...args) => execFileSync("git", args, { cwd: ctx.directory, stdio: "pipe" });
  git("init", "-b", "main");
  git("config", "core.hooksPath", path.join(ctx.directory, "no-hooks"));
  git("config", "user.name", "News regression");
  git("config", "user.email", "news@example.test");
  git("config", "commit.gpgsign", "false");
  await fs.writeFile(path.join(ctx.directory, "user-edit.txt"), "committed\n");
  git("add", "user-edit.txt");
  git("commit", "-m", "Local fixture only");
  await fs.writeFile(path.join(ctx.directory, "user-edit.txt"), "staged\n");
  git("add", "user-edit.txt");
  await fs.writeFile(path.join(ctx.directory, "user-edit.txt"), "keep unstaged work\n");
  const before = await treeHashes(ctx.directory);
  const help = await ctx.run("update_news_pr.sh", ["--help"]);
  assert.equal(help.code, 0, help.stderr);
  assert.match(help.stderr + help.stdout, /Deprecated/);
  for (const args of [[], ["--date", "2026-11-02"]]) {
    const result = await ctx.run("update_news_pr.sh", args);
    assert.equal(result.code, 1, result.stderr);
    assert.match(result.stderr, /Deprecated/);
    assert.match(result.stderr, /news:update/);
    assert.match(result.stderr, /news:publish/);
  }
  assert.deepEqual(await treeHashes(ctx.directory), before);
});

async function publisher(t) {
  const ctx = await sandbox(t, ["publish_news.mjs", "news_records.mjs", "official_traffic.mjs"]);
  const snapshot = buildNewsSnapshot({ baseIncidents: [checkedOld], analyses: [], checkedAt, throughDate: null });
  const directory = path.join(ctx.directory, "snapshot");
  const manifest = await writeSnapshot(directory, snapshot);
  // Raw sources are not part of the publication contract.
  await fs.writeFile(path.join(directory, "sources.json"), "private raw article, deliberately not JSON");
  return { ...ctx, snapshot: directory, manifest };
}

test("publisher dry-run validates replay deterministically with no writes or external effects", async (t) => {
  const ctx = await publisher(t);
  const before = await treeHashes(ctx.directory);
  const args = ["--snapshot", ctx.snapshot, "--dry-run"];
  const first = await ctx.run("publish_news.mjs", args);
  const second = await ctx.run("publish_news.mjs", args);
  assert.equal(first.code, 0, first.stderr);
  assert.equal(second.code, 0, second.stderr);
  const result = JSON.parse(first.stdout);
  assert.equal(result.status, "validated");
  assert.equal(result.mode, "replay");
  assert.equal(result.effects, "none");
  assert.match(result.snapshotId, /^[a-f0-9]{64}$/);
  assert.deepEqual(result.files, ctx.manifest.files);
  assert.deepEqual(JSON.parse(second.stdout), result);
  assert.deepEqual(await treeHashes(ctx.directory), before);
  // Publication must reject replay before Git/auth/network without opt-in.
  const rejected = await ctx.run("publish_news.mjs", ["--snapshot", ctx.snapshot]);
  assert.equal(rejected.code, 1, rejected.stderr);
  assert.match(rejected.stderr, /Replay cannot be published.*--allow-replay/);
  assert.deepEqual(await treeHashes(ctx.directory), before);
});

test("publisher rejects raw-byte tampering of every hashed artifact and extra manifest paths", async (t) => {
  const ctx = await publisher(t);
  for (const file of Object.keys(ctx.manifest.files)) {
    const target = path.join(ctx.snapshot, file);
    const original = await fs.readFile(target);
    await fs.appendFile(target, "\n"); // Same JSON value, different bytes.
    const before = await treeHashes(ctx.directory);
    const result = await ctx.run("publish_news.mjs", ["--snapshot", ctx.snapshot, "--dry-run"]);
    assert.equal(result.code, 1, file);
    assert.match(result.stderr, /hash mismatch/);
    assert.ok(result.stderr.includes(file), result.stderr);
    assert.deepEqual(await treeHashes(ctx.directory), before);
    await fs.writeFile(target, original);
  }
  ctx.manifest.files["sources.json"] = "0".repeat(64);
  await fs.writeFile(path.join(ctx.snapshot, "manifest.json"), json(ctx.manifest));
  const before = await treeHashes(ctx.directory);
  const result = await ctx.run("publish_news.mjs", ["--snapshot", ctx.snapshot, "--dry-run"]);
  assert.equal(result.code, 1, result.stderr);
  assert.match(result.stderr, /exactly.*public JSON.*state.json/);
  assert.deepEqual(await treeHashes(ctx.directory), before);
});
