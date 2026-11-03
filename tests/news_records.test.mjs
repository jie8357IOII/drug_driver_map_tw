import test from "node:test";
import assert from "node:assert/strict";
import { understandArticle } from "../scripts/news_understanding.mjs";
import { buildNewsSnapshot, validateNewsSnapshot } from "../scripts/news_records.mjs";
import { checkedAt, drivingArticle, sha256, url } from "./news-test-helpers.mjs";

test("an older mislinked related report cannot promote or claim the primary legacy event", async () => {
  // Synthetic reductions of the 5360415 / 1745856 failure, not fetched or
  // purported verbatim articles. Keep the event facts in literal source text.
  const primary = { url: url(90000020), source: "LTN", publishedAt: "2026-03-06", title: "宜蘭駕駛疑毒駕撞車",
    body: "2026年3月6日，23歲林姓男子駕駛轎車在宜蘭縣中山路撞車。林男唾液快篩結果待驗，警方尚未確認是否毒駕。" };
  const related = { url: url(90000021), source: "LTN", publishedAt: "2024-10-28", title: "台中駕駛毒駕撞車",
    body: "2024年10月27日，18歲白姓男子駕駛轎車在台中市自由路撞車。白男唾液快篩K他命呈陽性。" };
  const primaryAnalysis = await understandArticle(primary);
  const relatedAnalysis = await understandArticle(related);
  const p = primaryAnalysis.events[0], r = relatedAnalysis.events[0];
  assert.equal(primaryAnalysis.events.length, 1);
  assert.equal(relatedAnalysis.events.length, 1);
  assert.equal(p.occurredAt.value, "2026-03-06");
  assert.equal(p.city.value, "宜蘭縣");
  assert.ok(p.actors.some(a => a.surname === "林" && a.age === 23 && a.roles.includes("driver")));
  assert.notEqual(p.drugDriving.status, "reported_positive_or_use");
  assert.equal(r.occurredAt.value, "2024-10-27");
  assert.equal(r.city.value, "臺中市");
  assert.ok(r.actors.some(a => a.surname === "白" && a.age === 18 && a.roles.includes("driver")));
  assert.equal(r.drugDriving.status, "reported_positive_or_use");

  const legacy = { id: "legacy-primary", url: primary.url, title: primary.title, source: "LTN",
    publishedAt: primary.publishedAt, occurredAt: null, city: "", deaths: null, injuries: null,
    dataQuality: { verificationStatus: "legacy", includeInStats: false, needsHumanReview: true },
    relatedReports: [{ url: related.url, title: related.title, publishedAt: related.publishedAt }] };
  const historyReview = { checkedAt, targetIds: [legacy.id],
    sourceResults: [{ url: primary.url, ok: true }, { url: related.url, ok: true }] };
  // Both input order and publication chronology put the unrelated positive first.
  const snapshot = buildNewsSnapshot({ baseIncidents: [legacy], analyses: [relatedAnalysis, primaryAnalysis],
    checkedAt, throughDate: null, historyReview });
  const retained = snapshot.incidents.find(row => row.id === legacy.id);
  assert.ok(retained);
  assert.equal(retained.dataQuality.includeInStats, false, "another driver's positive test cannot promote the primary row");
  assert.equal(retained.dataQuality.verificationStatus, "legacy");
  const review = snapshot.state.coverage.historyReview;
  assert.deepEqual({ total: review.total, accepted: review.accepted, pending: review.pending }, { total: 1, accepted: 0, pending: 1 });
  assert.equal(review.rows[0].incidentId, legacy.id);
  assert.equal(review.rows[0].status, "pending");
  const record = snapshot.state.events.find(row => row.id === legacy.id);
  assert.equal(record.match.date, "2026-03-06");
  assert.equal(record.match.city, "宜蘭縣");
  assert.ok(record.match.actorKeys.some(a => a.surname === "林" && a.age === 23));
  const relatedCard = snapshot.news.articles.find(article => article.url === related.url);
  assert.ok(relatedCard, "the source remains visible without claiming the wrong event");
  assert.ok(!relatedCard.eventIds.includes(legacy.id), "public cards must discard contradicted legacy event-ID seeds");
  assert.deepEqual(snapshot.status.coverage, snapshot.state.coverage);
});

// Two real interpretations shared by the records-only checks. Unknown dates and
// failed source acquisition stay distinct; neither is replaced with a fake event.
let auditData;
const auditFixture = () => auditData ??= (async () => {
  const undated = { url: url(90000022), source: "LTN", publishedAt: "2026-11-03", title: "中正路駕駛酒測結果",
    body: "45歲黃姓男子駕駛轎車行經新北市中正路。黃男呼氣酒測為0.5mg/L。" };
  const analyses = [await understandArticle(drivingArticle), await understandArticle(undated)];
  const failedUrl = url(90000023);
  const base = [drivingArticle, undated].map((article, i) => ({
    id: i ? "legacy-undated" : "legacy-dated", url: article.url, title: article.title, source: article.source,
    publishedAt: article.publishedAt, occurredAt: null, city: i ? "新北市" : "臺北市", deaths: null, injuries: null,
    dataQuality: { verificationStatus: "legacy", includeInStats: false, needsHumanReview: true },
    ...(i ? { relatedReports: [{ url: failedUrl, title: "待補取得的後續報導", publishedAt: "2026-11-03" }] } : {}),
  }));
  const review = { checkedAt, targetIds: base.map(row => row.id), sourceResults: [
    { url: drivingArticle.url, ok: true }, { url: undated.url, ok: true }, { url: failedUrl, ok: false, error: "HTTP 503" },
  ] };
  const snapshot = buildNewsSnapshot({ baseIncidents: base, analyses, checkedAt, throughDate: null, historyReview: review,
    collection: { source: "LTN", from: "2026-10-01", to: "2026-10-03", keywords: ["毒駕", "酒駕"], checkedAt } });
  return { analyses, undated, failedUrl, base, review, snapshot };
})();

test("history review retains every target and explains accepted, undated and failed-source outcomes", async () => {
  const { analyses, undated, failedUrl, base, review, snapshot } = await auditFixture();
  assert.equal(analyses[0].events[0].occurredAt.value, "2026-11-02");
  assert.equal(analyses[1].events[0].occurredAt.value, null);
  const audit = snapshot.state.coverage.historyReview;
  assert.deepEqual({ total: audit.total, accepted: audit.accepted, pending: audit.pending }, { total: 2, accepted: 1, pending: 1 });
  assert.deepEqual(audit.rows.map(row => row.incidentId), review.targetIds);
  assert.equal(audit.rows[0].status, "accepted");
  assert.equal(audit.rows[1].status, "pending");
  assert.ok(audit.rows[1].reasons.some(reason => reason.includes(undated.url) && /事發日|事發日期/.test(reason)));
  assert.ok(audit.rows[1].reasons.some(reason => reason.includes(failedUrl) && /失敗/.test(reason) && reason.includes("HTTP 503")));
  assert.ok(audit.rows[1].sourceUrls.includes(failedUrl));
  assert.equal(snapshot.incidents.find(row => row.id === "legacy-dated").dataQuality.includeInStats, true);
  assert.equal(snapshot.incidents.find(row => row.id === "legacy-undated").dataQuality.includeInStats, false);
  assert.deepEqual(snapshot.status.coverage, snapshot.state.coverage);
  assert.deepEqual(snapshot.report.historyReview, audit);
  assert.deepEqual(snapshot.state.coverage.recordDates, { publishedFrom: "2026-11-03", publishedTo: "2026-11-03",
    occurredFrom: "2026-11-02", occurredTo: "2026-11-02" }, "unknown occurrence dates must not borrow publication dates");
  assert.ok(base.every(row => row.dataQuality.verificationStatus === "legacy"), "caller-owned baseline is not rewritten");

  const missingTarget = "missing-historical-target";
  const expanded = buildNewsSnapshot({ baseIncidents: base, analyses, checkedAt, throughDate: null,
    historyReview: { ...review, targetIds: [...review.targetIds, missingTarget] } }).state.coverage.historyReview;
  assert.deepEqual({ total: expanded.total, accepted: expanded.accepted, pending: expanded.pending }, { total: 3, accepted: 1, pending: 2 });
  assert.deepEqual(expanded.rows.map(row => row.incidentId), [...review.targetIds, missingTarget]);
  const missing = expanded.rows.find(row => row.incidentId === missingTarget);
  assert.equal(missing.status, "pending");
  assert.deepEqual(missing.sourceUrls, []);
  assert.ok(missing.reasons.some(reason => /不在.*基準資料/.test(reason)));
});

test("forceRecheckUrls re-evaluates a cached source against the supplied legacy baseline without duplicating its event", async () => {
  const { base, analyses, review, snapshot } = await auditFixture();
  // Cached cards are not authoritative incident rows: the supplied baseline can
  // still contain an old excluded row that now needs an explicit fresh check.
  const args = { baseIncidents: base, previousState: snapshot.state, analyses,
    checkedAt: "2026-11-04T08:00:00.000Z", throughDate: null,
    historyReview: { ...review, checkedAt: "2026-11-04T08:00:00.000Z" } };
  const cached = buildNewsSnapshot(args);
  assert.equal(cached.incidents.find(row => row.id === "legacy-dated").dataQuality.includeInStats, false);
  assert.equal(cached.state.coverage.historyReview.accepted, 0);
  const rechecked = buildNewsSnapshot({ ...args, forceRecheckUrls: [drivingArticle.url] });
  assert.equal(rechecked.incidents.find(row => row.id === "legacy-dated").dataQuality.verificationStatus, "machine_checked");
  assert.equal(rechecked.incidents.find(row => row.id === "legacy-dated").dataQuality.includeInStats, true);
  assert.equal(rechecked.state.coverage.historyReview.accepted, 1);
  assert.equal(rechecked.state.coverage.historyReview.pending, 1);
  assert.equal(rechecked.report.addedEventCount, 0);
  assert.deepEqual(rechecked.incidents.map(row => row.id), snapshot.incidents.map(row => row.id));
  assert.deepEqual(rechecked.state.events.find(row => row.id === "legacy-dated").history,
    snapshot.state.events.find(row => row.id === "legacy-dated").history, "same source version must not duplicate history");
});

test("coverage merges adjacent search windows without filling gaps or refreshing an old review", async () => {
  const { snapshot } = await auditFixture();
  let current = snapshot;
  for (const collection of [
    { source: "LTN", from: "2026-10-04", to: "2026-10-05", keywords: ["酒駕", "毒駕"], checkedAt: "2026-11-04T08:00:00.000Z" },
    { source: "LTN", from: "2026-10-08", to: "2026-10-09", keywords: ["毒駕", "酒駕"], checkedAt: "2026-11-05T08:00:00.000Z" },
  ]) {
    current = buildNewsSnapshot({ baseIncidents: current.incidents, previousState: current.state,
      analyses: [], checkedAt: collection.checkedAt, throughDate: null, collection });
  }
  assert.deepEqual(current.state.coverage.searches, [
    { source: "LTN", from: "2026-10-01", to: "2026-10-05", keywords: ["毒駕", "酒駕"], checkedAt: "2026-11-04T08:00:00.000Z" },
    { source: "LTN", from: "2026-10-08", to: "2026-10-09", keywords: ["毒駕", "酒駕"], checkedAt: "2026-11-05T08:00:00.000Z" },
  ]);
  assert.deepEqual(current.status.coverage, current.state.coverage);
  assert.deepEqual(current.state.coverage.historyReview, snapshot.state.coverage.historyReview);
  assert.equal(current.state.coverage.historyReview.checkedAt, checkedAt);
  assert.equal(snapshot.state.coverage.searches.length, 1, "previous state must remain immutable");
});

test("pre-coverage snapshots still validate and do not invent historical search coverage", async () => {
  const old = structuredClone((await auditFixture()).snapshot);
  delete old.state.coverage;
  delete old.state.coverageHash;
  delete old.status.coverage;
  assert.doesNotThrow(() => validateNewsSnapshot(old));
  const next = buildNewsSnapshot({ baseIncidents: old.incidents, previousState: old.state,
    analyses: [], checkedAt: "2026-11-04T08:00:00.000Z", throughDate: null });
  assert.deepEqual(next.incidents, old.incidents);
  assert.deepEqual(next.state.coverage.searches, []);
  assert.equal(next.state.coverage.historyReview, null);
  assert.deepEqual(next.status.coverage, next.state.coverage);
});

test("validation rejects altered review totals even with a matching coverage hash, and rejects hash tampering", async () => {
  const { snapshot } = await auditFixture();
  assert.doesNotThrow(() => validateNewsSnapshot(snapshot));
  const badTotal = structuredClone(snapshot);
  const coverage = badTotal.state.coverage;
  coverage.historyReview.total += 1;
  badTotal.status.coverage = structuredClone(coverage);
  // Keep the documented hash valid so this exercises semantic audit validation,
  // rather than passing only because any byte mutation invalidates the digest.
  badTotal.state.coverageHash = sha256(JSON.stringify({ searches: coverage.searches,
    recordDates: coverage.recordDates, historyReview: coverage.historyReview }));
  assert.throws(() => validateNewsSnapshot(badTotal), /history review/);
  const badHash = structuredClone(snapshot);
  badHash.state.coverageHash = "0".repeat(64);
  assert.throws(() => validateNewsSnapshot(badHash), /coverage.*hash/);
  assert.throws(() => buildNewsSnapshot({ baseIncidents: badHash.incidents, previousState: badHash.state,
    analyses: [], checkedAt, throughDate: null }), /coverage.*hash/);
  const mismatch = structuredClone(snapshot);
  mismatch.status.coverage.historyReview.pending += 1;
  assert.throws(() => validateNewsSnapshot(mismatch), /coverage mismatch/);
});
