import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";

const script = fileURLToPath(new URL("../scripts/update_news_pr.sh", import.meta.url));

test("local news PR command parses and documents the same date options", () => {
  execFileSync("bash", ["-n", script]);
  const result = execFileSync("bash", [script, "--help"], { encoding: "utf8" });
  assert.match(result, /--date.*--start.*--end.*--max-pages/);
});

test("local news PR command refuses dirty checkouts before auth or Git mutation", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "news-pr-command-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await fs.mkdir(path.join(directory, "scripts"));
  await fs.mkdir(path.join(directory, "bin"));
  await fs.copyFile(script, path.join(directory, "scripts/update_news_pr.sh"));
  await fs.writeFile(path.join(directory, "user-edit.txt"), "keep my work");
  for (const command of ["gh", "jq"]) {
    const file = path.join(directory, "bin", command);
    await fs.writeFile(file, "#!/bin/sh\nexit 99\n");
    await fs.chmod(file, 0o755);
  }
  execFileSync("git", ["init", "-b", "main"], { cwd: directory, stdio: "pipe" });
  const before = execFileSync("git", ["status", "--porcelain"], { cwd: directory, encoding: "utf8" });
  const result = spawnSync("bash", [path.join(directory, "scripts/update_news_pr.sh")], {
    cwd: directory, encoding: "utf8", env: { ...process.env, PATH: `${directory}/bin:${process.env.PATH}` },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /clean, separate checkout/);
  assert.equal(await fs.readFile(path.join(directory, "user-edit.txt"), "utf8"), "keep my work");
  assert.equal(execFileSync("git", ["status", "--porcelain"], { cwd: directory, encoding: "utf8" }), before);
});
