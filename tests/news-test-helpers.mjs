import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

export const root = fileURLToPath(new URL("../", import.meta.url));
export const checkedAt = "2026-11-03T08:00:00.000Z";
export const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
export const json = (value) => JSON.stringify(value, null, 2) + "\n";
export const url = (id) => `https://news.ltn.com.tw/news/society/breakingnews/${id}`;

// Authored synthetic cases, not fetched articles or purported real incidents.
// Every evidence position is checked against these literal source strings.
export const drivingArticle = {
  url: url(90000001), source: "LTN", publishedAt: "2026-11-03",
  title: "🚗中山路駕駛酒測 乘客唾液檢出依托咪酯",
  body: "  2026年11月2日，36歲陳姓男子駕駛轎車行經臺北市中山路。\r\n" +
    "  陳男呼氣酒測為0.45mg/L。28歲林姓男子為同車乘客，林男唾液快篩檢出依托咪酯呈陽性。" +
    "陳男唾液快篩未檢出毒品，警方排除陳男毒駕。",
};

export const checkedOld = {
  id: "reviewed-old", url: url(90000000), title: "既有已核對酒駕事件", source: "LTN",
  publishedAt: "2026-11-02", occurredAt: "2026-11-02", city: "臺北市",
  impairmentTypes: ["alcohol"], deaths: 0, injuries: 2,
  dataQuality: { verificationStatus: "manual_checked", includeInStats: true, mapEligible: true,
    needsHumanReview: false, fieldStatus: { deaths: "checked", injuries: "checked" } },
};

const exec = promisify(execFile);

export async function sandbox(t, scripts) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "news-regression-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await fs.mkdir(path.join(directory, "scripts"));
  await fs.mkdir(path.join(directory, "bin"));
  for (const name of scripts) await fs.copyFile(path.join(root, "scripts", name), path.join(directory, "scripts", name));
  const effects = path.join(directory, "unexpected-effects.log");
  for (const command of ["git", "gh", "npm", "node", "curl"]) {
    const target = path.join(directory, "bin", command);
    await fs.writeFile(target, '#!/bin/sh\nprintf "%s\\n" "$0" >> "$NEWS_TEST_EFFECTS"\nexit 97\n', { mode: 0o755 });
  }
  const env = { ...process.env, PATH: `${directory}/bin:${process.env.PATH}`, NODE_OPTIONS: "",
    NEWS_TEST_EFFECTS: effects, GEMINI_API_KEY: "", GEMINI_MODEL: "", GITHUB_ACTIONS: "false", GITHUB_OUTPUT: "",
    NEWS_PYTHON: process.env.NEWS_PYTHON ?? (existsSync(path.join(root, ".venv-news/bin/python"))
      ? path.join(root, ".venv-news/bin/python") : "python3") };
  async function run(script, args = [], override = {}) {
    const shell = script.endsWith(".sh");
    const argv = [...(shell ? [] : ["--import", path.join(root, "tests/news-offline-guard.mjs")]),
      path.join(directory, "scripts", script), ...args];
    let result;
    try { result = { code: 0, ...await exec(shell ? "bash" : process.execPath, argv,
      { cwd: directory, env: { ...env, ...override }, timeout: 20000, maxBuffer: 4 * 1024 * 1024 }) }; }
    catch (error) { result = { code: error.code, stdout: error.stdout, stderr: error.stderr }; }
    assert.equal(await fs.stat(effects).then(() => true, () => false), false, "CLI attempted network or an external command");
    return result;
  }
  return { directory, run };
}

export async function treeHashes(directory) {
  const entries = {};
  async function visit(relative) {
    for (const item of await fs.readdir(path.join(directory, relative), { withFileTypes: true })) {
      const name = path.join(relative, item.name);
      if (item.isDirectory()) await visit(name);
      else if (item.isFile()) entries[name] = sha256(await fs.readFile(path.join(directory, name)));
    }
  }
  await visit("");
  return entries;
}

export async function writeSnapshot(directory, snapshot, mode = "replay") {
  const values = { "public/data/incidents.json": snapshot.incidents, "public/data/news.json": snapshot.news,
    "public/data/news-status.json": snapshot.status, "state.json": snapshot.state };
  const files = {};
  for (const [name, value] of Object.entries(values)) {
    await fs.mkdir(path.dirname(path.join(directory, name)), { recursive: true });
    const bytes = json(value);
    await fs.writeFile(path.join(directory, name), bytes);
    files[name] = sha256(bytes);
  }
  const manifest = { version: 1, status: "ready", mode, createdAt: checkedAt, files };
  await fs.writeFile(path.join(directory, "manifest.json"), json(manifest));
  return manifest;
}
