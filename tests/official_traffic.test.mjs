import test from "node:test";
import assert from "node:assert/strict";
import { parseOfficialTrafficPage, parseOfficialCauseRows, collectOfficialTraffic, validateOfficialTraffic } from "../scripts/official_traffic.mjs";
import { buildNewsSnapshot, validateNewsSnapshot } from "../scripts/news_records.mjs";
import { checkedAt, checkedOld, sha256 } from "./news-test-helpers.mjs";
import { officialPageUrl, officialPage, officialNotice, causeRows, causeBytes, officialApiUrl, officialFixtureResponse } from "./official-traffic-fixtures.mjs";

function offlineSource({ page = officialPage, afterPage = page, failUrl = null } = {}) {
  const calls = [];
  let pageReads = 0;
  return { calls, fetchImpl: async (input) => {
    const url = new URL(input).href;
    calls.push(url);
    if (url === failUrl) return new Response("unavailable", { status: 503 });
    if (url === new URL(officialPageUrl).href) return new Response(++pageReads === 1 ? page : afterPage);
    const response = officialFixtureResponse(input);
    assert.ok(response, `unexpected official request: ${url}`);
    return response;
  } };
}

let collected;
const currentFixture = () => collected ??= collectOfficialTraffic({ fetchImpl: offlineSource().fetchImpl, checkedAt });

test("official causes use exact labels beyond the top ten and preserve missing versus explicit zero", () => {
  assert.equal(causeRows.length, 96);
  assert.deepEqual(parseOfficialCauseRows(causeRows), { alcoholCases: 2488, drugCases: 8 });
  assert.deepEqual(parseOfficialCauseRows([...causeRows].reverse()), { alcoholCases: 2488, drugCases: 8 });
  assert.deepEqual(parseOfficialCauseRows(causeRows.slice(0, 94)), { alcoholCases: null, drugCases: null });
  assert.deepEqual(parseOfficialCauseRows([{ name: "酒醉(後)駕駛", caseQty: 0 }]), { alcoholCases: 0, drugCases: null });
  assert.deepEqual(parseOfficialCauseRows([{ name: "吸食違禁物駕駛", caseQty: 0 }]), { alcoholCases: null, drugCases: 0 });
  assert.throws(() => parseOfficialCauseRows([...causeRows, causeRows[95]]), /duplicate cause/);
  assert.throws(() => parseOfficialCauseRows([{ name: "吸食違禁物駕駛", caseQty: null }]), /invalid count/);
});

test("official page metadata determines the latest period and rejects invalid or unavailable periods", () => {
  assert.deepEqual(parseOfficialTrafficPage(officialPage), { fromYear: 2023, toYear: 2026, toMonth: "2026-08",
    sourceUpdatedAt: "2026-10-27", notice: officialNotice });
  assert.equal(parseOfficialTrafficPage(officialPage.replace('value="11508"', 'value="11509"')).toMonth, "2026-09");
  for (const html of [
    officialPage.replace('value="11508"', 'value="11513"'),
    officialPage.replace('value="11508"', 'value="11112"'),
    officialPage.replace('<option value="115">115</option>', ""),
    officialPage.replace('<option value="4">大型車</option>', ""),
  ]) assert.throws(() => parseOfficialTrafficPage(html), /Invalid official traffic data/);
});

test("official collection covers four vehicles per published year with raw-response provenance and no casualty totals", async () => {
  const source = offlineSource();
  const result = await collectOfficialTraffic({ fetchImpl: source.fetchImpl, checkedAt });
  assert.equal(validateOfficialTraffic(result), undefined);
  assert.equal(result.status, "current");
  assert.equal(result.source, "MOTC_ROADSAFETY");
  assert.equal(result.dataset, "first_party_cause_by_vehicle");
  assert.equal(result.scope, "第一當事者事故肇因，分車種、全國、全年齡");
  assert.equal(result.fromMonth, "2023-01");
  assert.equal(result.toMonth, "2026-08");
  assert.equal(result.sourceUpdatedAt, "2026-10-27");
  assert.equal(result.notice, officialNotice);
  assert.equal(result.checkedAt, checkedAt);
  assert.equal(result.fetchedAt, checkedAt);
  assert.equal(result.rows.length, 16);
  assert.equal(source.calls.length, 18, "page metadata must be checked again after the 16 API reads");
  assert.equal(source.calls[0], new URL(officialPageUrl).href);
  assert.equal(source.calls.at(-1), new URL(officialPageUrl).href);
  const vehicles = [[0, "機車", 2488, 8], [1, "小型車", 2488, 0], [4, "大型車", 2488, null], [2, "自行車(含電自、電輔)", null, 8]];
  for (const year of [2023, 2024, 2025, 2026]) for (const [type, label, alcohol, drug] of vehicles) {
    const row = result.rows.find(r => r.year === year && r.vehicleType === type);
    assert.deepEqual(row, { year, fromMonth: `${year}-01`, toMonth: year === 2026 ? "2026-08" : `${year}-12`,
      vehicleType: type, vehicle: label, alcoholCases: alcohol, drugCases: drug,
      sourceUrl: officialApiUrl(year, type), sourceSha256: sha256(causeBytes(type)) });
    assert.equal(source.calls.filter(url => url === row.sourceUrl).length, 1);
  }
});

test("failed, regressed or changing official periods retain the last complete data as stale", async () => {
  const previous = await currentFixture();
  const before = structuredClone(previous);
  const later = "2026-11-04T08:00:00.000Z";
  const cases = [
    [offlineSource({ failUrl: new URL(officialPageUrl).href }), /HTTP 503/],
    [offlineSource({ failUrl: officialApiUrl(2024, 1) }), /HTTP 503/],
    [offlineSource({ page: officialPage.replace('value="11508"', 'value="11507"') }), /backwards/],
    [offlineSource({ page: officialPage.replace('value="11508"', 'value="11513"') }), /period/],
    [offlineSource({ afterPage: officialPage.replace('value="11508"', 'value="11509"') }), /changed during collection/],
  ];
  for (const [source, reason] of cases) {
    const retained = await collectOfficialTraffic({ fetchImpl: source.fetchImpl, checkedAt: later, previous });
    assert.equal(retained.status, "stale");
    assert.match(retained.error, reason);
    assert.deepEqual(retained, { ...previous, checkedAt: later, status: "stale", error: retained.error });
    assert.equal(validateOfficialTraffic(retained), undefined);
  }
  assert.deepEqual(previous, before, "fallback must not mutate its caller's last successful data");
  await assert.rejects(collectOfficialTraffic({ fetchImpl: offlineSource({ failUrl: officialApiUrl(2024, 1) }).fetchImpl,
    checkedAt: later }), /HTTP 503/, "a failed first fetch must not invent official counts");
});

test("official validation rejects incomplete year/vehicle coverage, bad row periods and invalid counts", async () => {
  const valid = await currentFixture();
  for (const corrupt of [
    value => { value.toMonth = "2026-13"; },
    value => { value.rows[0].toMonth = "2023-08"; },
    value => { value.rows.pop(); },
    value => { value.rows[1] = structuredClone(value.rows[0]); },
    value => { value.rows[0].drugCases = -1; },
    value => { value.rows[0].sourceUrl = officialApiUrl(2024, 0); },
  ]) {
    const invalid = structuredClone(valid);
    corrupt(invalid);
    assert.throws(() => validateOfficialTraffic(invalid), /Invalid official traffic data/);
  }
});

test("records mirror official data, retain it when omitted, accept old snapshots and publish stale fallback", async () => {
  const officialTraffic = await currentFixture();
  const args = { baseIncidents: [checkedOld], analyses: [], checkedAt, throughDate: null };
  const old = buildNewsSnapshot(args);
  assert.equal(old.state.officialTraffic, undefined);
  assert.equal(old.status.officialTraffic, undefined);
  assert.doesNotThrow(() => validateNewsSnapshot(old));
  const attached = buildNewsSnapshot({ ...args, previousState: old.state, officialTraffic });
  assert.deepEqual(attached.state.officialTraffic, officialTraffic);
  assert.deepEqual(attached.status.officialTraffic, officialTraffic);
  assert.deepEqual(attached.incidents, old.incidents);
  assert.deepEqual(attached.news, old.news);
  const before = structuredClone(attached);
  const later = "2026-11-04T08:00:00.000Z";
  const retained = buildNewsSnapshot({ ...args, previousState: attached.state, checkedAt: later });
  assert.deepEqual(retained.state.officialTraffic, officialTraffic);
  assert.deepEqual(retained.status.officialTraffic, officialTraffic);
  const stale = await collectOfficialTraffic({ fetchImpl: offlineSource({ failUrl: new URL(officialPageUrl).href }).fetchImpl,
    checkedAt: later, previous: officialTraffic });
  const fallback = buildNewsSnapshot({ ...args, previousState: attached.state, checkedAt: later, officialTraffic: stale });
  assert.deepEqual(fallback.state.officialTraffic, stale);
  assert.deepEqual(fallback.status.officialTraffic, stale);
  assert.doesNotThrow(() => validateNewsSnapshot(fallback));
  assert.deepEqual(attached, before);
  const mismatch = structuredClone(attached);
  mismatch.status.officialTraffic.rows[0].drugCases += 1;
  assert.throws(() => validateNewsSnapshot(mismatch), /officialTraffic mismatch/);
  const missing = structuredClone(attached);
  delete missing.status.officialTraffic;
  assert.throws(() => validateNewsSnapshot(missing), /officialTraffic mismatch/);
});
