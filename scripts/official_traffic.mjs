import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const SOURCE_URL = "https://roadsafety.tw/AccAgeI26CauseOrder?type=肇因分析";
const VEHICLES = [[0, "機車"], [1, "小型車"], [4, "大型車"], [2, "自行車(含電自、電輔)"]];
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const month = (value) => /^20\d{2}-(?:0[1-9]|1[0-2])$/.test(value || "");
const instant = (value) => typeof value === "string" && Number.isFinite(Date.parse(value));
const requireValue = (condition, message) => { if (!condition) throw new Error(`Invalid official traffic data: ${message}`); };

function sourceUrl(year, vehicleType) {
  const query = new URLSearchParams({ Cyear: String(year - 1911), CityKeyid: "0", AreaKeyid: "0", OrderType: "1", Age: "0", I26type: String(vehicleType) });
  return `https://roadsafety.tw/api/AccAgeI26CauseOrderAjax/GetResult?${query}`;
}

export function parseOfficialTrafficPage(html) {
  // Restore validates saved data before npm ci; load the HTML parser only when collecting.
  const { load } = require("cheerio");
  const $ = load(html);
  const base = $("#hfBaseYear").val(), latest = $("#hfMaxYearMonth").val();
  const update = $("#hfUpdateDate").val(), notice = $("#hfDashboardDataRange").val();
  requireValue(/^\d{3}$/.test(base || "") && /^\d{3}(?:0[1-9]|1[0-2])$/.test(latest || ""), "missing published period");
  const fromYear = Number(base) + 1911, toYear = Number(latest.slice(0, 3)) + 1911;
  requireValue(fromYear >= 2000 && fromYear <= toYear && toYear - fromYear <= 20, "published years");
  for (let year = fromYear; year <= toYear; year++) requireValue($("#ddlCyear option").toArray().some((item) => $(item).val() === String(year - 1911)), `unavailable year ${year}`);
  for (const [type] of VEHICLES) requireValue($("#ddlI26 option").toArray().some((item) => $(item).val() === String(type)), `unavailable vehicle ${type}`);
  requireValue(/^\d{3}\/\d{2}\/\d{2}$/.test(update || "") && typeof notice === "string" && notice.length > 0, "source metadata");
  const sourceUpdatedAt = `${Number(update.slice(0, 3)) + 1911}-${update.slice(4).replace("/", "-")}`;
  requireValue(new Date(`${sourceUpdatedAt}T00:00:00Z`).toISOString().slice(0, 10) === sourceUpdatedAt, "source update date");
  return { fromYear, toYear, toMonth: `${toYear}-${latest.slice(3)}`, sourceUpdatedAt, notice };
}

export function parseOfficialCauseRows(rows) {
  requireValue(Array.isArray(rows) && rows.length > 0 && rows.every((row) => row && typeof row.name === "string"), "empty or malformed cause response");
  requireValue(rows.every((row) => Number.isSafeInteger(row.caseQty) && row.caseQty >= 0), "invalid count in cause response");
  const cases = (label) => {
    const matches = rows.filter((row) => row.name === label);
    requireValue(matches.length <= 1, `duplicate cause ${label}`);
    if (!matches.length) return null;
    return matches[0].caseQty;
  };
  return { alcoholCases: cases("酒醉(後)駕駛"), drugCases: cases("吸食違禁物駕駛") };
}

export function validateOfficialTraffic(value) {
  requireValue(value?.version === 1 && value.source === "MOTC_ROADSAFETY" && value.dataset === "first_party_cause_by_vehicle" && value.sourceUrl === SOURCE_URL, "source");
  requireValue(month(value.fromMonth) && month(value.toMonth) && value.fromMonth.endsWith("-01") && value.fromMonth <= value.toMonth, "period");
  requireValue(typeof value.scope === "string" && value.scope && typeof value.notice === "string" && value.notice && /^20\d{2}-\d{2}-\d{2}$/.test(value.sourceUpdatedAt || ""), "metadata");
  requireValue(instant(value.checkedAt) && instant(value.fetchedAt) && value.fetchedAt <= value.checkedAt && ["current", "stale"].includes(value.status), "refresh status");
  requireValue(value.status === "stale" ? typeof value.error === "string" && value.error.length > 0 : value.error === undefined, "refresh error");
  const start = Number(value.fromMonth.slice(0, 4)), end = Number(value.toMonth.slice(0, 4));
  requireValue(end - start <= 20 && Array.isArray(value.rows) && value.rows.length === (end - start + 1) * VEHICLES.length, "row coverage");
  const seen = new Set();
  for (const row of value.rows) {
    const key = `${row.year}:${row.vehicleType}`;
    requireValue(Number.isInteger(row.year) && row.year >= start && row.year <= end && VEHICLES.some(([type, label]) => type === row.vehicleType && label === row.vehicle) && !seen.has(key), "vehicle/year");
    seen.add(key);
    requireValue(row.fromMonth === `${row.year}-01` && row.toMonth === (row.year === end ? value.toMonth : `${row.year}-12`), "row period");
    requireValue([row.alcoholCases, row.drugCases].every((n) => n === null || Number.isSafeInteger(n) && n >= 0), "case counts");
    requireValue(row.sourceUrl === sourceUrl(row.year, row.vehicleType) && /^[a-f0-9]{64}$/.test(row.sourceSha256 || ""), "row provenance");
  }
}

export async function collectOfficialTraffic({ fetchImpl = fetch, checkedAt = new Date().toISOString(), previous = null } = {}) {
  requireValue(instant(checkedAt), "check timestamp");
  async function download(url) {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(30000), headers: { Accept: "application/json,text/html" } });
    if (!response.ok) throw new Error(`Official traffic source HTTP ${response.status}: ${url}`);
    return Buffer.from(await response.arrayBuffer());
  }
  try {
    const metadata = parseOfficialTrafficPage((await download(SOURCE_URL)).toString("utf8"));
    const fromMonth = `${metadata.fromYear}-01`, toMonth = metadata.toMonth;
    requireValue(!previous || fromMonth <= previous.fromMonth && toMonth >= previous.toMonth, "source period moved backwards");
    const rows = [];
    // Four published vehicle groups are kept separate; they are not a national total.
    for (let year = metadata.fromYear; year <= metadata.toYear; year++) {
      for (const [vehicleType, vehicle] of VEHICLES) {
        const url = sourceUrl(year, vehicleType), bytes = await download(url);
        rows.push({ year, fromMonth: `${year}-01`, toMonth: year === metadata.toYear ? toMonth : `${year}-12`, vehicleType, vehicle,
          ...parseOfficialCauseRows(JSON.parse(bytes.toString("utf8"))), sourceUrl: url, sourceSha256: sha256(bytes) });
      }
    }
    const after = parseOfficialTrafficPage((await download(SOURCE_URL)).toString("utf8"));
    requireValue(JSON.stringify(metadata) === JSON.stringify(after), "source period changed during collection");
    const result = { version: 1, source: "MOTC_ROADSAFETY", dataset: "first_party_cause_by_vehicle", sourceUrl: SOURCE_URL,
      scope: "第一當事者事故肇因，分車種、全國、全年齡", fromMonth, toMonth,
      sourceUpdatedAt: metadata.sourceUpdatedAt, notice: metadata.notice, checkedAt, fetchedAt: checkedAt, status: "current", rows };
    validateOfficialTraffic(result);
    return result;
  } catch (error) {
    if (!previous) throw error;
    validateOfficialTraffic(previous);
    const retained = { ...structuredClone(previous), checkedAt, status: "stale", error: error.message };
    validateOfficialTraffic(retained);
    return retained;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length === 1 && ["--help", "-h"].includes(args[0])) {
    console.log("Usage: node scripts/official_traffic.mjs --output FILE\nFetch official first-party cause counts; writes a local JSON file and does not publish.");
  } else if (args.length === 2 && args[0] === "--output" && args[1] && !args[1].startsWith("--")) {
    collectOfficialTraffic().then(async (result) => {
      await fs.mkdir(path.dirname(path.resolve(args[1])), { recursive: true });
      await fs.writeFile(path.resolve(args[1]), JSON.stringify(result, null, 2) + "\n");
      console.log(`Official traffic: ${result.fromMonth}..${result.toMonth}, ${result.rows.length} vehicle/year rows. ${path.resolve(args[1])}`);
    }).catch((error) => { console.error(error.message); process.exitCode = 1; });
  } else { console.error("Use --output FILE or --help."); process.exitCode = 1; }
}
