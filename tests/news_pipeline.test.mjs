import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { understandArticle } from "../scripts/news_understanding.mjs";
import { buildNewsSnapshot } from "../scripts/news_records.mjs";
import { parseArticleHtml } from "../scripts/ltn_article.mjs";
import { root, checkedAt, checkedOld, drivingArticle, url, sha256, json, sandbox } from "./news-test-helpers.mjs";

// Reuse real interpretation across publication checks; do not mock the tokenizer.
let interpreted;
const interpretation = () => interpreted ??= understandArticle(drivingArticle);

function sourcePositions(result, article) {
  for (const s of result.sentences) {
    assert.equal(article[s.field].slice(s.start, s.end), s.text);
    for (const token of s.tokens) assert.equal(s.text.slice(token.start, token.end), token.text);
  }
  function visit(value) {
    if (!value || typeof value !== "object") return;
    if (value.field && typeof value.quote === "string") {
      assert.equal(article[value.field].slice(value.start, value.end), value.quote);
    }
    for (const child of Object.values(value)) visit(child);
  }
  visit(result);
}

test("shared interpretation is stable, preserves source positions and separates passenger drugs from driver alcohol", async () => {
  const result = await interpretation();
  assert.deepEqual(await understandArticle(drivingArticle), result);
  sourcePositions(result, drivingArticle);
  assert.equal(result.lexical.engine, "jieba");
  assert.equal(result.lexical.version, "0.42.1");
  assert.equal(result.lexical.hmm, false);
  assert.match(result.lexical.dictionaryHash, /^[a-f0-9]{64}$/);
  assert.equal(result.article.bodyHash, sha256(drivingArticle.body));
  assert.deepEqual(result.sentences[0].tokens[0], { text: "🚗", start: 0, end: 2, kind: null, canonical: null });
  assert.ok(result.sentences.flatMap(s => s.tokens).some(t => t.kind === "drug" && t.canonical === "依托咪酯"));
  assert.ok(result.sentences.flatMap(s => s.tokens).some(t => t.kind === "alcohol_test" && t.text === "酒測"));
  assert.equal(result.events.length, 1);
  const event = result.events[0];
  const driver = event.actors.find(a => a.surname === "陳");
  const passenger = event.actors.find(a => a.surname === "林");
  assert.ok(driver?.roles.includes("driver"));
  assert.ok(passenger?.roles.includes("passenger"));
  assert.ok(!passenger.roles.includes("driver"));
  const alcohol = event.alcoholClaims.find(c => c.kind === "alcohol_test" && c.value === 0.45);
  assert.ok(alcohol, "explicit concentration must be extracted");
  assert.deepEqual({ actorIds: alcohol.actorIds, value: alcohol.value, unit: alcohol.unit, specimen: alcohol.specimen, status: alcohol.status },
    { actorIds: [driver.id], value: 0.45, unit: "mg/L", specimen: "breath", status: "positive" });
  assert.ok(event.drugClaims.some(c => c.kind === "person_test" && c.status === "positive" && c.actorIds.includes(passenger.id)));
  assert.ok(event.drugClaims.some(c => c.kind === "person_test" && c.status === "negative" && c.actorIds.includes(driver.id)));
  assert.ok(!event.drugClaims.some(c => c.status === "positive" && c.actorIds.includes(driver.id)));
  assert.ok(!event.impairmentTypes.includes("drug"), "passenger positive / driver negative cannot establish driver drug use");
});

test("a checked event with unknown casualties counts once and identical sources do not change publication", async () => {
  const analysis = await interpretation();
  const first = buildNewsSnapshot({ baseIncidents: [], analyses: [analysis, analysis], checkedAt, throughDate: null });
  assert.equal(first.incidents.length, 1);
  const row = first.incidents[0];
  assert.deepEqual([row.deaths, row.injuries], [null, null]);
  assert.deepEqual(row.impairmentTypes, ["alcohol"]);
  assert.equal(row.dataQuality.verificationStatus, "machine_checked");
  assert.equal(row.dataQuality.eventCountValid, true);
  assert.equal(row.dataQuality.includeInStats, true);
  assert.equal(row.dataQuality.mapEligible, true);
  assert.deepEqual(row.dataQuality.fieldStatus, { deaths: "unknown", injuries: "unknown" });
  assert.equal(first.news.articles.length, 1);
  assert.deepEqual(first.news.articles[0].eventIds, [row.id]);
  const later = "2026-11-04T08:00:00.000Z";
  const before = structuredClone(first);
  const replay = buildNewsSnapshot({ baseIncidents: first.incidents, previousState: first.state,
    analyses: [analysis], checkedAt: later, throughDate: null });
  assert.deepEqual(first, before, "publication must not mutate caller-owned baseline/state");
  assert.deepEqual(replay.incidents, first.incidents);
  assert.deepEqual(replay.news, first.news);
  assert.deepEqual(replay.state.events, first.state.events);
  assert.equal(replay.state.dataHash, first.state.dataHash);
  assert.equal(replay.status.lastChangedAt, checkedAt);
  assert.equal(replay.status.lastCheckedAt, later);
  assert.equal(replay.state.throughDate, null);
  assert.equal(replay.report.addedEventCount, 0);
});

test("policy is a news card, while a generic alcohol footer creates no traffic event", async () => {
  const policy = { url: url(90000002), source: "LTN", publishedAt: "2026-11-03", title: "立委討論酒駕修法政策",
    body: "立委今天討論酒駕修法政策，建議強化宣導與道路安全教育，並請警方提出防制方案。" };
  const policyResult = await understandArticle(policy);
  const snapshot = buildNewsSnapshot({ baseIncidents: [], analyses: [policyResult], checkedAt, throughDate: null });
  assert.equal(snapshot.incidents.length, 0);
  assert.equal(snapshot.news.articles.length, 1);
  assert.equal(snapshot.news.articles[0].kind, "policy");
  assert.deepEqual(snapshot.news.articles[0].eventIds, []);

  const title = "臺北藝文展覽開幕";
  const body = "臺北市今天舉行藝文展覽，展出多位藝術家的作品，民眾可於開放時間自由參觀。";
  const footer = "☆飲酒過量，有害健康，禁止酒駕。";
  const html = `<script type="application/ld+json">${JSON.stringify({ "@type": "NewsArticle", headline: title,
    datePublished: "2026-11-03T12:00:00+08:00", articleBody: `${body}\n${footer}` })}</script><div class="text"><p>${body}</p><p>${footer}</p></div>`;
  const parsed = parseArticleHtml(html, { url: url(90000003) });
  assert.equal(parsed.body, body, "source adapter must discard boilerplate");
  // Normalized replays may still carry the footer; interpretation must also ignore it.
  const unrelated = { ...parsed, body: `${body}\n${footer}` };
  const result = await understandArticle(unrelated);
  sourcePositions(result, unrelated);
  assert.equal(result.article.related, false);
  assert.deepEqual(result.candidates, []);
  assert.ok(result.events.every(e => e.impairmentTypes.length === 0));
  assert.deepEqual(buildNewsSnapshot({ baseIncidents: [], analyses: [result], checkedAt, throughDate: null }).news.articles, []);
});

test("regulation commencement dates do not replace the date of today's driving event", async () => {
  // Synthetic reductions of the live 5626512 finding; no article is fetched.
  // Cover both separate sentences and regulatory/event clauses sharing a sentence.
  for (const [index, regulation, relative] of [
    [0, "道路交通管理處罰條例毒駕新制在10月31日上路。", "今天凌晨"],
    [1, "道路交通管理處罰條例修正案於10月31日公告施行，", "今凌晨"],
  ]) {
    const article = { url: url(90000006 + index), source: "LTN", publishedAt: "2026-11-02",
      title: "中山路駕駛唾液快篩陽性",
      body: `${regulation}27歲林姓男子${relative}駕駛轎車行經臺北市中山路。林男唾液快篩檢出依托咪酯呈陽性。` };
    const analysis = await understandArticle(article);
    sourcePositions(analysis, article);
    assert.equal(analysis.events.length, 1);
    const event = analysis.events[0];
    assert.equal(event.occurredAt.value, "2026-11-02", `${relative}: regulation date is not the event date`);
    assert.equal(event.occurredAt.precision, "day");
    assert.ok(event.occurredAt.evidence.some(e => e.quote.includes(`林姓男子${relative}`)),
      "the occurrence date needs the actual driving sentence as evidence");
    const snapshot = buildNewsSnapshot({ baseIncidents: [], analyses: [analysis], checkedAt, throughDate: null });
    assert.equal(snapshot.incidents.length, 1);
    assert.equal(snapshot.incidents[0].occurredAt, "2026-11-02");
    assert.deepEqual(snapshot.incidents[0].impairmentTypes, ["drug"]);
    assert.equal(snapshot.incidents[0].dataQuality.publicationChecks.dateChecked, true);
  }
});

test("generic police drug-driving warnings cannot establish a person's drug use", async () => {
  const warning = "警方表示，施用毒品後駕車嚴重影響交通安全。";
  const article = { url: url(90000008), source: "LTN", publishedAt: "2026-11-02",
    title: "中山路駕駛唾液快篩待驗",
    body: "27歲林姓男子今天凌晨駕駛轎車行經臺北市中山路。林男唾液快篩結果待驗。" + warning };
  const analysis = await understandArticle(article);
  sourcePositions(analysis, article);
  assert.equal(analysis.events.length, 1);
  const event = analysis.events[0];
  const driver = event.actors.find(a => a.surname === "林");
  assert.ok(driver?.roles.includes("driver"));
  assert.ok(event.drugClaims.some(c => c.kind === "person_test" && c.status === "pending" && c.actorIds.includes(driver.id)),
    "the actual pending test must remain present");
  assert.ok(!event.drugClaims.some(c => c.kind === "consumption" || c.status === "reported_use"));
  assert.ok(!driver.drugEvidence.some(c => c.status === "reported_use"));
  assert.ok(event.drugClaims.every(c => c.evidence.every(e => !e.quote.includes(warning))));
  assert.notEqual(event.drugDriving.status, "reported_positive_or_use");
  const snapshot = buildNewsSnapshot({ baseIncidents: [], analyses: [analysis], checkedAt, throughDate: null });
  assert.equal(snapshot.incidents.length, 0, "generic advice cannot promote a pending test into a checked event");
  assert.equal(snapshot.news.articles.length, 1);
  assert.deepEqual(snapshot.news.articles[0].eventIds, []);
});

// A publication-boundary fixture with literal source spans; this is not generated
// by the interpreter under test. It asserts the documented same-event contract.
function conflictingFollowUp() {
  const lines = [
    "2026年11月2日，36歲陳姓男子駕駛轎車行經臺北市中山路。",
    "陳男呼氣酒測為0.45mg/L。",
    "事故共造成3人受傷。",
    `警方說明，這是先前報導（${checkedOld.url}）的同一起中山路酒駕事故。`,
  ];
  const body = lines.join("\n");
  const sentences = lines.map((text, i) => ({ id: `p${i + 1}s1`, field: "body", text,
    start: body.indexOf(text), end: body.indexOf(text) + text.length }));
  const evidence = sentences.map(s => ({ sentenceId: s.id, field: s.field, start: s.start, end: s.end, quote: s.text }));
  const event = {
    id: "event-1", candidate: null, issues: [], impairmentTypes: ["alcohol"],
    actors: [{ id: "driver", surname: "陳", age: 36, gender: "male", roles: ["driver"], evidence: [evidence[0]],
      vehicles: [{ type: "轎車", evidence: [evidence[0]] }], outcomes: [] }],
    occurredAt: { value: "2026-11-02", precision: "day", evidence: [evidence[0]] },
    city: { value: "臺北市", evidence: [evidence[0]], alternatives: [] },
    locationDetail: { value: "中山路", evidence: [evidence[0]] },
    traffic: { observedDriving: true, status: "driving_reported", eventType: "alcohol_driving", evidence: [evidence[0]] },
    alcoholDriving: { status: "reported_positive_or_use", actorIds: ["driver"], evidence: [evidence[1]] },
    alcoholClaims: [{ kind: "alcohol_test", status: "positive", actorIds: ["driver"], timeScope: "current",
      value: 0.45, unit: "mg/L", specimen: "breath", text: lines[1], evidence: [evidence[1]] }],
    drugClaims: [],
    casualties: { deaths: { value: null, basis: "not_reported", evidence: [] },
      injuries: { value: 3, basis: "explicit_total", evidence: [evidence[2]] } },
    casualtyClaims: [{ kind: "injuries", value: 3, scope: "reported_total", approximate: false, evidence: [evidence[2]] }],
    sourceReferences: [{ relation: "same_event", url: checkedOld.url, evidence: [evidence[3]] }],
  };
  return { version: "publication-fixture-v1", disposition: "update_review", issues: [], sentences, events: [event],
    article: { url: url(90000004), title: "中山路酒駕事故後續調查", publishedAt: "2026-11-03", source: "LTN",
      kind: "judicial", related: true, impairmentTypes: ["alcohol"], bodyHash: sha256(body) } };
}

test("same-case conflicting counts retain checked old values and record the incoming source once", () => {
  const analysis = conflictingFollowUp();
  const first = buildNewsSnapshot({ baseIncidents: [checkedOld], analyses: [analysis], checkedAt, throughDate: null });
  assert.deepEqual(first.incidents, [checkedOld], "3 reported later must neither replace the checked 2 nor be added to it");
  assert.equal(first.news.articles.length, 2);
  assert.deepEqual(first.news.articles.find(a => a.url === analysis.article.url).eventIds, [checkedOld.id]);
  assert.equal(first.state.events[0].conflicts.length, 1);
  const conflict = first.state.events[0].conflicts[0];
  assert.deepEqual({ field: conflict.field, retained: conflict.retained, incoming: conflict.incoming, url: conflict.url, bodyHash: conflict.bodyHash },
    { field: "injuries", retained: 2, incoming: 3, url: analysis.article.url, bodyHash: analysis.article.bodyHash });
  assert.equal(conflict.evidence[0].quote, "事故共造成3人受傷。");
  assert.equal(first.incidents[0].dataQuality.fieldStatus.injuries, "checked");
  assert.equal(first.report.afterStatsCount, 1);
  const again = buildNewsSnapshot({ baseIncidents: first.incidents, previousState: first.state,
    analyses: [analysis], checkedAt: "2026-11-04T08:00:00.000Z", throughDate: null });
  assert.deepEqual(again.state.events, first.state.events);
  assert.equal(again.state.dataHash, first.state.dataHash);
});

test("an explicit source correction flows through interpretation into a checked count update", async () => {
  const context = "2026年11月2日，36歲陳姓男子駕駛轎車行經臺北市中山路。陳男呼氣酒測為0.45mg/L。";
  const original = { url: url(90000005), title: "中山路酒駕事故", source: "LTN", publishedAt: "2026-11-03",
    body: context + "事故共造成2人受傷。" };
  const corrected = { ...original, body: context + "原報導2人受傷，更正為3人受傷。" };
  const before = await understandArticle(original);
  const after = await understandArticle(corrected);
  sourcePositions(before, original);
  sourcePositions(after, corrected);
  assert.equal(before.events.length, 1);
  assert.equal(after.events.length, 1);
  const event = after.events[0];
  assert.equal(event.casualties.injuries.value, 3);
  assert.notEqual(event.casualties.injuries.basis, "conflicting");
  assert.deepEqual([...new Set(event.casualtyClaims.filter(c => c.kind === "injuries" && c.scope === "reported_total").map(c => c.value))], [3]);
  assert.equal(event.updateKind, "correction");
  assert.equal(event.currentFacts.injuries.previousValue, 2);
  assert.equal(event.currentFacts.injuries.value, 3);
  assert.ok(event.currentFacts.injuries.evidence.some(e => e.quote.includes("原報導2人受傷，更正為3人受傷")));

  const first = buildNewsSnapshot({ baseIncidents: [], analyses: [before], checkedAt, throughDate: null });
  assert.equal(first.incidents.length, 1);
  assert.equal(first.incidents[0].injuries, 2);
  assert.equal(first.incidents[0].dataQuality.verificationStatus, "machine_checked");
  assert.equal(first.incidents[0].dataQuality.fieldStatus.injuries, "checked");
  const next = buildNewsSnapshot({ baseIncidents: first.incidents, previousState: first.state,
    analyses: [after], checkedAt: "2026-11-04T08:00:00.000Z", throughDate: null });
  assert.equal(next.incidents.length, 1);
  assert.equal(next.incidents[0].id, first.incidents[0].id);
  assert.equal(next.incidents[0].injuries, 3);
  assert.equal(next.incidents[0].deaths, null);
  assert.equal(next.incidents[0].dataQuality.fieldStatus.injuries, "checked");
  assert.equal(next.report.addedEventCount, 0);
  assert.deepEqual(next.state.events[0].conflicts, []);
  const changes = next.report.changes.filter(c => c.field === "injuries");
  assert.equal(changes.length, 1);
  assert.deepEqual({ previous: changes[0].previous, value: changes[0].value, reason: changes[0].reason },
    { previous: 2, value: 3, reason: "correction" });
  assert.equal(changes[0].bodyHash, sha256(corrected.body));
});

test("publication does not promote an alcohol result missing units or a valid original source span", async () => {
  for (const defect of ["missing unit", "wrong source span"]) {
    const analysis = structuredClone(await interpretation());
    const reading = analysis.events[0].alcoholClaims.find(c => c.kind === "alcohol_test" && c.value === 0.45);
    if (defect === "missing unit") reading.unit = null;
    else reading.evidence = reading.evidence.map(e => ({ ...e, start: e.start + 1, end: e.end + 1 }));
    const snapshot = buildNewsSnapshot({ baseIncidents: [], analyses: [analysis], checkedAt, throughDate: null });
    assert.equal(snapshot.incidents.length, 0, defect);
    assert.equal(snapshot.news.articles.length, 1, "source remains available for clarification");
    assert.deepEqual(snapshot.news.articles[0].eventIds, []);
  }
});

test("replay CLI hashes raw inputs, deduplicates sources, preserves a null watermark and fails closed on an engine fault", async (t) => {
  const ctx = await sandbox(t, ["update_news.mjs", "news_records.mjs", "news_understanding.mjs", "news_assistance.mjs",
    "news_tokenizer.mjs", "tokenize_news.py", "ltn_article.mjs"]);
  await fs.symlink(path.join(root, "node_modules"), path.join(ctx.directory, "node_modules"), "dir");
  await fs.symlink(path.join(root, "scripts/lexicon"), path.join(ctx.directory, "scripts/lexicon"), "dir");
  const base = path.join(ctx.directory, "base.json"), state = path.join(ctx.directory, "previous-state.json");
  const input = path.join(ctx.directory, "input.json"), output = path.join(ctx.directory, "output");
  const baseline = buildNewsSnapshot({ baseIncidents: [checkedOld], analyses: [], checkedAt, throughDate: null });
  // Noncanonical formatting makes a parse/reserialize hash fail this check.
  const baseBytes = " \n" + JSON.stringify([checkedOld]) + "\n\n";
  const stateBytes = JSON.stringify(baseline.state, null, 4) + "\n\n";
  await fs.writeFile(base, baseBytes);
  await fs.writeFile(state, stateBytes);
  await fs.writeFile(input, json({ articles: [drivingArticle, drivingArticle] }));
  await fs.mkdir(path.join(ctx.directory, "public/data"), { recursive: true });
  const publicBase = path.join(ctx.directory, "public/data/incidents.json");
  await fs.writeFile(publicBase, baseBytes);
  const args = ["--input", input, "--base", base, "--state", state, "--output", output];
  const success = await ctx.run("update_news.mjs", args);
  assert.equal(success.code, 0, success.stderr);
  const read = async (name) => JSON.parse(await fs.readFile(path.join(output, name), "utf8"));
  const manifest = await read("manifest.json");
  assert.equal(manifest.status, "ready");
  assert.equal(manifest.mode, "replay");
  assert.deepEqual(manifest.inputs, { baseSha256: sha256(baseBytes), stateSha256: sha256(stateBytes) });
  assert.notEqual(manifest.inputs.baseSha256, sha256(json(JSON.parse(baseBytes))));
  assert.notEqual(manifest.inputs.stateSha256, sha256(json(JSON.parse(stateBytes))));
  assert.deepEqual(Object.keys(manifest.files).sort(), ["public/data/incidents.json", "public/data/news-status.json", "public/data/news.json", "state.json"]);
  for (const [name, hash] of Object.entries(manifest.files)) assert.equal(sha256(await fs.readFile(path.join(output, name))), hash);
  assert.equal((await read("analysis.json")).length, 1);
  assert.equal((await read("state.json")).throughDate, null);
  assert.equal((await read("public/data/news-status.json")).lastPublishedAt, null);

  // Reuse the ready directory: a failed rerun must remove the stale ready marker.
  const failure = await ctx.run("update_news.mjs", args, { NEWS_PYTHON: path.join(ctx.directory, "missing-python") });
  assert.equal(failure.code, 1, failure.stderr);
  assert.match(failure.stderr, /Python executable is unavailable/);
  assert.ok(!failure.stderr.includes(drivingArticle.body));
  await assert.rejects(fs.access(path.join(output, "manifest.json")), { code: "ENOENT" });
  assert.equal((await read("report.json")).status, "failed");
  assert.equal(await fs.readFile(base, "utf8"), baseBytes);
  assert.equal(await fs.readFile(state, "utf8"), stateBytes);
  assert.equal(await fs.readFile(publicBase, "utf8"), baseBytes);

  // Even a zero-result live search requires the tokenizer, not just article loops.
  const emptyOutput = path.join(ctx.directory, "empty-search");
  const empty = await ctx.run("update_news.mjs", ["--from", "2026-11-02", "--to", "2026-11-02",
    "--base", base, "--state", state, "--output", emptyOutput],
  { NEWS_TEST_EMPTY_SEARCH: "1", NEWS_PYTHON: path.join(ctx.directory, "missing-python") });
  assert.equal(empty.code, 1, "zero articles must not bypass the required tokenizer preflight");
  await assert.rejects(fs.access(path.join(emptyOutput, "manifest.json")), { code: "ENOENT" });
  assert.equal(JSON.parse(await fs.readFile(path.join(emptyOutput, "report.json"))).status, "failed");
  assert.equal(await fs.readFile(base, "utf8"), baseBytes);
  assert.equal(await fs.readFile(state, "utf8"), stateBytes);
  assert.equal(await fs.readFile(publicBase, "utf8"), baseBytes);
});

test("live CLI rejects watermark gaps, advances continuous coverage and preserves history-only backfills", async (t) => {
  const ctx = await sandbox(t, ["update_news.mjs", "news_records.mjs", "news_understanding.mjs", "news_assistance.mjs",
    "news_tokenizer.mjs", "tokenize_news.py", "ltn_article.mjs"]);
  await fs.symlink(path.join(root, "node_modules"), path.join(ctx.directory, "node_modules"), "dir");
  await fs.symlink(path.join(root, "scripts/lexicon"), path.join(ctx.directory, "scripts/lexicon"), "dir");
  const old = { ...checkedOld, publishedAt: "2026-10-30", occurredAt: "2026-10-29" };
  const baseline = buildNewsSnapshot({ baseIncidents: [old], analyses: [], checkedAt, throughDate: "2026-10-30" });
  const base = path.join(ctx.directory, "base.json"), state = path.join(ctx.directory, "previous-state.json");
  const baseBytes = Buffer.from(" \n" + JSON.stringify([old]) + "\n\n");
  const stateBytes = Buffer.from(JSON.stringify(baseline.state, null, 4) + "\n\n");
  const inputs = { baseSha256: sha256(baseBytes), stateSha256: sha256(stateBytes) };
  await fs.writeFile(base, baseBytes);
  await fs.writeFile(state, stateBytes);

  // Every run starts from the same immutable 10/30 baseline, not the prior output.
  for (const scenario of [
    { name: "gap", from: "2026-11-02", to: "2026-11-02", throughDate: null },
    { name: "continuous", from: "2026-10-31", to: "2026-11-02", throughDate: "2026-11-02" },
    { name: "backfill", from: "2026-10-01", to: "2026-10-02", throughDate: "2026-10-30" },
  ]) {
    const output = path.join(ctx.directory, scenario.name);
    const result = await ctx.run("update_news.mjs", ["--from", scenario.from, "--to", scenario.to,
      "--base", base, "--state", state, "--output", output], { NEWS_TEST_EMPTY_SEARCH: "1" });
    const report = JSON.parse(await fs.readFile(path.join(output, "report.json")));
    if (scenario.name === "gap") {
      assert.equal(result.code, 1, result.stderr);
      assert.match(result.stderr, /skips uncollected dates after 2026-10-30/);
      assert.equal(report.status, "failed");
      await assert.rejects(fs.access(path.join(output, "manifest.json")), { code: "ENOENT" });
    } else {
      assert.equal(result.code, 0, result.stderr);
      assert.equal(report.status, "ready");
      assert.equal(report.discovered, 0);
      assert.equal(report.analyzed, 0);
      const manifest = JSON.parse(await fs.readFile(path.join(output, "manifest.json")));
      const outputState = await fs.readFile(path.join(output, "state.json"));
      assert.equal(manifest.status, "ready");
      assert.equal(manifest.mode, "live");
      assert.deepEqual(manifest.inputs, inputs);
      assert.equal(manifest.files["state.json"], sha256(outputState));
      assert.equal(JSON.parse(outputState).throughDate, scenario.throughDate, scenario.name);
    }
    const unchangedBase = await fs.readFile(base), unchangedState = await fs.readFile(state);
    assert.deepEqual(unchangedBase, baseBytes, `${scenario.name}: base bytes changed`);
    assert.deepEqual(unchangedState, stateBytes, `${scenario.name}: state bytes changed`);
    assert.deepEqual({ baseSha256: sha256(unchangedBase), stateSha256: sha256(unchangedState) }, inputs);
  }
});
