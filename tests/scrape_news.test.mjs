import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));
const sentinel = {
  id: "reviewed", title: "既有已校正事件", source: "LTN", url: "https://news.ltn.com.tw/news/society/breakingnews/100",
  city: "臺北市", publishedAt: "2026-05-01", deaths: 0, injuries: 2,
  dataQuality: { includeInStats: true, needsHumanReview: false, flags: ["count_corrected"] },
  extractedDetails: { driver: { age: 36 } },
  relatedReports: [{ title: "既有事件的另一報導", url: "https://news.ltn.com.tw/news/society/breakingnews/101" }],
};
const url = (id) => `https://news.ltn.com.tw/news/society/breakingnews/${id}`;
const escape = (s) => String(s || "").replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
const search = (items, total = items.length) => `<html><body>約有 ${total} 項結果<ul>${items.map((item) => `<li><div class="cont"><a class="tit extra" href="${item.url}" title="${escape(item.title)}">${escape(item.title)}</a></div></li>`).join("")}</ul></body></html>`;
const article = (title, body, date = "2026-05-26T12:00:00+08:00") => `<html><head><script type="application/ld+json">${JSON.stringify({ "@type": "NewsArticle", headline: title, datePublished: date, articleBody: body })}</script></head><body><h1>${escape(title)}</h1><div class="text"><p>${escape(body)}</p></div></body></html>`;

async function setup(t, items, existing = [sentinel]) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ltn-news-test-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const output = path.join(directory, "incidents.json");
  const report = path.join(directory, "report.json");
  const fixture = path.join(directory, "fixture.json");
  await fs.writeFile(output, JSON.stringify(existing, null, 2) + "\n");
  const routes = { search: [search(items)], articles: Object.fromEntries(items.map((item) => [item.url, article(item.title, item.body)])) };
  async function run(extra = [], dates = ["--date", "2026-05-26"]) {
    await fs.writeFile(fixture, JSON.stringify(routes));
    try {
      const result = await exec(process.execPath, ["--import", path.join(root, "tests/news-fetch-fixture.mjs"), path.join(root, "scripts/scrape_news.mjs"), ...dates, "--output", output, "--report", report, ...extra], {
        cwd: directory, env: { ...process.env, TZ: "America/Los_Angeles", NEWS_TEST_FIXTURE: fixture }, timeout: 15000,
      });
      return { code: 0, ...result };
    } catch (error) { return { code: error.code, stderr: error.stderr, stdout: error.stdout }; }
  }
  return { routes, run, output, read: async () => JSON.parse(await fs.readFile(output, "utf8")), report: async () => JSON.parse(await fs.readFile(report, "utf8")) };
}

for (const [name, title, body, counts] of [
  ["explicit zero casualties", "臺北市毒駕擦撞 無人受傷 無人死亡", "臺北市發生毒駕擦撞事故，警方說明現場無人受傷、無人死亡，正在調查事故經過。", [0, 0]],
  ["zero-casualty danger", "臺北市毒駕衝入店家 幸無人員傷亡", "臺北市駕駛涉毒失控衝入店家，警方表示並無人員傷亡，現場僅有財物損壞。", [0, 0]],
  ["explicit casualty numbers", "臺北市毒駕釀2死3傷", "臺北市發生毒駕事故，共造成2人死亡、3人受傷，警方正在調查駕駛的毒品來源。", [2, 3]],
  ["age is not a casualty count", "臺北市毒駕撞死78歲婦人", "臺北市一輛轎車涉毒駕失控，撞上78歲婦人，警方調查事故經過，報導未提供總死傷數。", [null, null]],
  ["unknown is not zero", "臺北市毒駕逆向逃逸", "臺北市警方追查毒駕事件，駕駛逆向逃逸造成交通危險，事故細節仍在調查中。", [null, null]],
]) {
  test(name, async (t) => {
    const ctx = await setup(t, [{ url: url(200), title, body }]);
    assert.equal((await ctx.run()).code, 0);
    const rows = await ctx.read();
    assert.equal(rows.length, 2);
    assert.deepEqual([rows[0].deaths, rows[0].injuries], counts);
    assert.equal(rows[0].dataQuality.includeInStats, false);
    assert.equal(rows[0].dataQuality.needsHumanReview, true);
    assert.match(rows[0].dataQuality.sourceSearchUrl, /search\.ltn\.com\.tw/);
    assert.deepEqual(rows[1], sentinel);
  });
}

test("unrecognized HTTP 200 is a failure and leaves bytes intact", async (t) => {
  const ctx = await setup(t, []);
  const before = await fs.readFile(ctx.output, "utf8");
  ctx.routes.search = ["<html><body>Please verify you are human</body></html>"];
  assert.equal((await ctx.run()).code, 1);
  assert.equal(await fs.readFile(ctx.output, "utf8"), before);
  assert.equal((await ctx.report()).status, "failed");
});

test("confirmed zero results is a successful no-op", async (t) => {
  const ctx = await setup(t, []);
  const before = await fs.readFile(ctx.output, "utf8");
  assert.equal((await ctx.run()).code, 0);
  assert.equal((await ctx.report()).status, "no_change");
  assert.equal(await fs.readFile(ctx.output, "utf8"), before);
});

test("policies and court follow-ups do not become new incidents", async (t) => {
  const ctx = await setup(t, [
    { url: url(200), title: "強化毒駕防制 警局擬推新措施", body: "臺北市近年發生毒駕衝撞，警方說將持續推動政策並加強取締，過去事故造成2死3傷。" },
    { url: url(201), title: "臺北市毒駕撞人案判刑", body: "臺北市去年毒駕撞人案件今日判刑，死傷人數並未更新，法院公布相關判決內容。" },
  ]);
  assert.equal((await ctx.run()).code, 0);
  assert.deepEqual(await ctx.read(), [sentinel]);
  assert.equal((await ctx.report()).articles.filter((item) => item.status === "excluded").length, 2);
});

test("duplicates include related reports; reruns preserve reviewer changes and bytes", async (t) => {
  const item = { url: url(200), title: "臺北市毒駕撞護欄", body: "臺北市涉毒駕駛失控撞上護欄，警方帶回調查，現場並無人員傷亡，車輛受損。" };
  const ctx = await setup(t, [item, { url: url(101), title: "既有事件的另一報導" }]);
  assert.equal((await ctx.run()).code, 0);
  const rows = await ctx.read();
  rows[0].summary = "人工修訂，後續重跑必須保留";
  rows[0].dataQuality.needsHumanReview = false;
  rows[0].dataQuality.includeInStats = true;
  await fs.writeFile(ctx.output, JSON.stringify(rows, null, 2) + "\n");
  const before = await fs.readFile(ctx.output, "utf8");
  assert.equal((await ctx.run()).code, 0);
  assert.equal(await fs.readFile(ctx.output, "utf8"), before);
  assert.equal((await ctx.report()).added, 0);
});

test("different same-city incidents are not automatically merged", async (t) => {
  const ctx = await setup(t, [
    { url: url(200), title: "臺北市毒駕於甲路撞機車1傷", body: "臺北市駕駛涉毒駕在甲路撞機車，造成1人受傷，警方正在調查事故發生原因。" },
    { url: url(201), title: "臺北市毒駕於乙路撞機車1傷", body: "臺北市另有駕駛涉毒駕在乙路撞機車，造成1人受傷，與甲路事故是不同駕駛。" },
  ]);
  assert.equal((await ctx.run()).code, 0);
  assert.equal((await ctx.read()).length, 3);
});

test("incomplete pagination and page limits fail before publishing", async (t) => {
  const items = Array.from({ length: 20 }, (_, i) => ({ url: url(200 + i), title: `毒駕事故${i}` }));
  const ctx = await setup(t, items);
  ctx.routes.search = [search(items, 21), search([items[0]], 21)];
  assert.equal((await ctx.run(["--max-pages", "1"])).code, 1);
  assert.match((await ctx.report()).error, /exceeding/);
  assert.equal((await ctx.run()).code, 1);
  assert.match((await ctx.report()).error, /repeated or omitted/);
  assert.deepEqual(await ctx.read(), [sentinel]);
});

test("a later article failure cannot publish an earlier partial result", async (t) => {
  const items = [200, 201].map((id) => ({ url: url(id), title: `臺北市毒駕失控撞車${id}`, body: "臺北市駕駛毒駕失控撞車，現場無人傷亡，警方處理事故並持續調查原因。" }));
  const ctx = await setup(t, items);
  ctx.routes.articles[url(201)] = { status: 404, body: "not found" };
  assert.equal((await ctx.run()).code, 1);
  assert.deepEqual(await ctx.read(), [sentinel]);
});

test("missing absolute article date fails instead of using the query end date", async (t) => {
  const ctx = await setup(t, [{ url: url(200), title: "臺北市毒駕失控撞車" }]);
  ctx.routes.articles[url(200)] = article("臺北市毒駕失控撞車", "臺北市駕駛涉毒失控撞車，警方已經到場處理事故，詳細原因仍待調查。", undefined).replace(/"datePublished":"[^"]+",?/, "");
  assert.equal((await ctx.run()).code, 1);
  assert.deepEqual(await ctx.read(), [sentinel]);
});

test("default dates are three completed Taipei days regardless of runner timezone", async (t) => {
  const ctx = await setup(t, []);
  ctx.routes.now = "2026-11-03T16:05:00Z";
  assert.equal((await ctx.run([], [])).code, 0);
  const report = await ctx.report();
  assert.deepEqual([report.start, report.end], ["20261101", "20261103"]);
});

test("validation rejects unreviewed automatic candidates included in statistics", async (t) => {
  const ctx = await setup(t, [], [{ ...sentinel, dataQuality: { flags: ["automated_candidate"], includeInStats: true, needsHumanReview: true } }]);
  assert.equal((await ctx.run(["--validate"])).code, 1);
});
