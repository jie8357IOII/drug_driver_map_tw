import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

test("Git review deletions survive merge while related reports and unrelated branches do not become rejections", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "news-history-test-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", args, { cwd: directory, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  git("init", "-b", "main");
  git("config", "user.name", "News test");
  git("config", "user.email", "test@example.test");
  git("config", "commit.gpgsign", "false");
  const file = path.join(directory, "public/data/incidents.json");
  await fs.mkdir(path.dirname(file), { recursive: true });
  const kept = { url: "https://news.ltn.com.tw/news/society/breakingnews/1" };
  const removed = { url: "https://news.ltn.com.tw/news/society/breakingnews/2?source=search" };
  const related = { url: "https://news.ltn.com.tw/news/society/breakingnews/3" };
  async function save(items) {
    await fs.writeFile(file, JSON.stringify(items));
    git("add", "public/data/incidents.json");
    git("commit", "-m", "Update reviewed incidents");
  }
  await save([kept, removed, related]);
  git("switch", "-c", "unrelated");
  await save([removed, related]);
  git("switch", "main");
  git("switch", "-c", "news-review");
  await save([{ ...kept, relatedReports: [related] }]);
  git("switch", "main");
  git("merge", "--no-ff", "news-review", "-m", "Merge reviewed data");
  const output = path.join(directory, "rejections.json");
  execFileSync(process.execPath, [fileURLToPath(new URL("../scripts/list_rejected_news.mjs", import.meta.url)), output], { cwd: directory });
  assert.deepEqual(JSON.parse(await fs.readFile(output, "utf8")), ["https://news.ltn.com.tw/news/society/breakingnews/2"]);
});

test("a fetched merged PR head retains add-then-delete decisions after squash", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "news-squash-test-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", args, { cwd: directory, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  git("init", "-b", "main");
  git("config", "user.name", "News test");
  git("config", "user.email", "test@example.test");
  git("config", "commit.gpgsign", "false");
  const file = path.join(directory, "public/data/incidents.json");
  await fs.mkdir(path.dirname(file), { recursive: true });
  const kept = { url: "https://news.ltn.com.tw/news/society/breakingnews/1" };
  const rejected = { url: "https://news.ltn.com.tw/news/society/breakingnews/2" };
  const accepted = { url: "https://news.ltn.com.tw/news/society/breakingnews/3" };
  async function save(items) {
    await fs.writeFile(file, JSON.stringify(items));
    git("add", ".");
    git("commit", "-m", "Review data");
  }
  await save([kept]);
  git("switch", "-c", "review");
  await save([kept, rejected, accepted]);
  await save([kept, accepted]);
  git("update-ref", "refs/remotes/news-reviews/1", "HEAD");
  git("switch", "main");
  git("merge", "--squash", "review");
  git("commit", "-m", "Squash reviewed data");
  git("branch", "-D", "review");
  const output = path.join(directory, "rejections.json");
  const script = fileURLToPath(new URL("../scripts/list_rejected_news.mjs", import.meta.url));
  execFileSync(process.execPath, [script, output, "refs/remotes/news-reviews/1"], { cwd: directory });
  assert.deepEqual(JSON.parse(await fs.readFile(output, "utf8")), [rejected.url]);
});
