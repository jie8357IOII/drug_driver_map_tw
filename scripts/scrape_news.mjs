import fs from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { load } from "cheerio";

const DEFAULT_OUTPUT_PATH = "public/data/incidents.json";
const DEFAULT_PAGE_SIZE = 20;

function printHelp() {
  console.log(`Usage:
  node scripts/scrape_news.mjs --date 2026-05-26
  node scripts/scrape_news.mjs --date 20260526
  node scripts/scrape_news.mjs --start 2026-05-26 --end 2026-05-27

Options:
  --date <YYYY-MM-DD|YYYYMMDD>      Crawl a single calendar day. Sets start_time and end_time to the same date.
  --start <YYYY-MM-DD|YYYYMMDD>     Search start date.
  --end <YYYY-MM-DD|YYYYMMDD>       Search end date.
  --output <path>                   Output JSON path. Default: ${DEFAULT_OUTPUT_PATH}
  --keyword <text>                  Search keyword. Default: 毒駕
  --max-pages <number>              Fail if more pages are needed. Default: 20.
  --report <path>                    Write a JSON report, including failures.
  --validate                        Validate the existing file without fetching.

With no dates, check the last three completed Asia/Taipei calendar days.
  --help                            Show this help message.

Examples:
  node scripts/scrape_news.mjs --date 2026-05-26
  node scripts/scrape_news.mjs --start 20260526 --end 20260527 --output public/data/incidents.json
`);
}

function parseArgs(argv) {
  const args = {
    outputPath: DEFAULT_OUTPUT_PATH,
    keyword: "毒駕",
    maxPages: 20,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--help" || arg === "-h") {
      args.help = true;
      continue;
    }
    if (arg === "--validate") {
      args.validate = true;
      continue;
    }

    if (["--date", "--start", "--end", "--output", "--keyword", "--max-pages", "--report"].includes(arg)) {
      if (!next || next.startsWith("--")) {
        throw new Error(`${arg} requires a value.`);
      }

      if (arg === "--date") args.date = next;
      if (arg === "--start") args.start = next;
      if (arg === "--end") args.end = next;
      if (arg === "--output") args.outputPath = next;
      if (arg === "--keyword") args.keyword = next;
      if (arg === "--report") args.reportPath = next;
      if (arg === "--max-pages") {
        const parsed = Number(next);
        if (!Number.isInteger(parsed) || parsed < 1) {
          throw new Error("--max-pages must be a positive integer.");
        }
        args.maxPages = parsed;
      }

      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (args.help) return args;

  if (args.date && (args.start || args.end)) {
    throw new Error("Use either --date or --start/--end, not both.");
  }

  if (args.date) {
    args.startTime = normalizeDate(args.date);
    args.endTime = normalizeDate(args.date);
    return args;
  }

  if (!args.start && !args.end) {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const date = new Date(`${today}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - 1);
    args.end = date.toISOString().slice(0, 10);
    date.setUTCDate(date.getUTCDate() - 2);
    args.start = date.toISOString().slice(0, 10);
  }

  if (!args.start || !args.end) {
    throw new Error("Both --start and --end are required when using a date range.");
  }

  args.startTime = normalizeDate(args.start);
  args.endTime = normalizeDate(args.end);

  if (args.startTime > args.endTime) {
    throw new Error("--start cannot be later than --end.");
  }

  return args;
}

function normalizeDate(value) {
  const compact = value.replaceAll("-", "").replaceAll("/", "").trim();
  if (!/^20\d{6}$/.test(compact)) {
    throw new Error(`Invalid date: ${value}. Use YYYY-MM-DD or YYYYMMDD.`);
  }

  const year = Number(compact.slice(0, 4));
  const month = Number(compact.slice(4, 6));
  const day = Number(compact.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));

  const isValid =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() + 1 === month &&
    date.getUTCDate() === day;

  if (!isValid) {
    throw new Error(`Invalid calendar date: ${value}.`);
  }

  return compact;
}

const cli = parseArgs(process.argv.slice(2));
if (cli.help) {
  printHelp();
  process.exit(0);
}

const outputPath = path.resolve(cli.outputPath);
const ltnSearch = {
  source: "LTN",
  baseUrl: "https://search.ltn.com.tw/list",
  keyword: cli.keyword,
  type: "all",
  sort: "date",
  startTime: cli.startTime,
  endTime: cli.endTime,
  pageSize: DEFAULT_PAGE_SIZE,
  maxPages: cli.maxPages,
};

const cityNames = [
  "新北市",
  "臺北市",
  "桃園市",
  "臺中市",
  "臺南市",
  "高雄市",
  "宜蘭縣",
  "新竹縣",
  "苗栗縣",
  "彰化縣",
  "南投縣",
  "雲林縣",
  "嘉義縣",
  "屏東縣",
  "臺東縣",
  "花蓮縣",
  "澎湖縣",
  "基隆市",
  "新竹市",
  "嘉義市",
  "金門縣",
  "連江縣",
  "新北",
  "台北",
  "臺北",
  "桃園",
  "台中",
  "臺中",
  "台南",
  "臺南",
  "高雄",
  "宜蘭",
  "苗栗",
  "彰化",
  "南投",
  "雲林",
  "嘉義",
  "屏東",
  "台東",
  "臺東",
  "花蓮",
  "澎湖",
  "基隆",
  "新竹",
  "金門",
  "連江",
];

const aliases = {
  新北: "新北市",
  台北: "臺北市",
  臺北: "臺北市",
  桃園: "桃園市",
  台中: "臺中市",
  臺中: "臺中市",
  台南: "臺南市",
  臺南: "臺南市",
  高雄: "高雄市",
  宜蘭: "宜蘭縣",
  苗栗: "苗栗縣",
  彰化: "彰化縣",
  南投: "南投縣",
  雲林: "雲林縣",
  嘉義: "嘉義縣",
  屏東: "屏東縣",
  台東: "臺東縣",
  臺東: "臺東縣",
  花蓮: "花蓮縣",
  澎湖: "澎湖縣",
  基隆: "基隆市",
  新竹: "新竹縣",
  金門: "金門縣",
  連江: "連江縣",
};

function searchUrl(page = 1) {
  const params = new URLSearchParams({
    keyword: ltnSearch.keyword,
    start_time: ltnSearch.startTime,
    end_time: ltnSearch.endTime,
    sort: ltnSearch.sort,
    type: ltnSearch.type,
  });
  if (page > 1) params.set("page", String(page));
  return `${ltnSearch.baseUrl}?${params.toString()}`;
}

function text(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function canonicalUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || !url.hostname.endsWith(".ltn.com.tw")) throw new Error(`Unexpected article URL: ${value}`);
  url.search = "";
  url.hash = "";
  return url.href;
}

function parseSearch(html, page) {
  const $ = load(html);
  $("script, style").remove();
  const totalMatch = $("body").text().match(/約有\s*([\d,]+)\s*項結果/);
  if (!totalMatch) throw new Error(`Unrecognized LTN search page ${page}; this is not a confirmed empty result.`);
  const total = Number(totalMatch[1].replaceAll(",", ""));
  const articles = $(".cont a.tit").toArray().map((node) => ({
    url: canonicalUrl($(node).attr("href")),
    title: text($(node).attr("title") || $(node).text()),
    searchUrl: searchUrl(page),
  }));
  const expected = Math.min(DEFAULT_PAGE_SIZE, Math.max(0, total - (page - 1) * DEFAULT_PAGE_SIZE));
  if (articles.length !== expected || articles.some((item) => !item.title)) {
    throw new Error(`Incomplete search page ${page}: expected ${expected} articles, parsed ${articles.length}.`);
  }
  return { total, articles };
}

function parseArticle(html, listing) {
  const $ = load(html);
  const objects = [];
  for (const node of $('script[type="application/ld+json"]').toArray()) {
    try {
      const value = JSON.parse($(node).html());
      objects.push(...(Array.isArray(value) ? value : [value]), ...(value["@graph"] || []));
    } catch { /* Some unrelated advertising metadata is not valid JSON. */ }
  }
  const article = objects.find((item) => [item["@type"]].flat().includes("NewsArticle"));
  const title = text(article?.headline || $("h1").first().text());
  const dateText = article?.datePublished || $('meta[property="article:published_time"]').attr("content");
  if (!title || !dateText || !/^20\d\d-\d\d-\d\d(?:T|$)/.test(dateText)) {
    throw new Error(`Missing article title or absolute publication date: ${listing.url}`);
  }
  const publishedAt = dateText.slice(0, 10);
  normalizeDate(publishedAt);
  $("script, style, .appE1121, .ad, .related").remove();
  const paragraphs = $(".text p").toArray().map((node) => text($(node).text()))
    .filter((paragraph) => paragraph && !/請繼續往下閱讀|自由時報提醒您|下載APP|加入LINE/.test(paragraph));
  // JSON-LD is a fallback for LTN sections without the usual article paragraphs.
  const body = paragraphs.join("\n") || text(article?.articleBody);
  if (!body || body.length < 20) throw new Error(`Missing article body: ${listing.url}`);
  return { ...listing, title, publishedAt, body };
}

function inferCity(title, body) {
  const withoutByline = body.replace(/〔[^〕]*〕|【[^】]*】/g, "");
  for (const value of [title, withoutByline]) {
    const matches = cityNames.filter((city) => value.includes(city));
    if (matches.length) return aliases[matches[0]] || matches[0];
  }
  return "";
}

function numberValue(value) {
  if (/^\d+$/.test(value)) return Number(value);
  const digits = { 零: 0, 〇: 0, 一: 1, 二: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (value.includes("十")) {
    const [tens, ones] = value.split("十");
    return (digits[tens] ?? 1) * 10 + (digits[ones] ?? 0);
  }
  return digits[value] ?? null;
}

function casualtyCount(value, kind) {
  const zeroBoth = /(?:無人(?:員)?|未造成(?:人員)?|沒有(?:人員)?|並無(?:人員)?)(?:傷亡|死傷)/.test(value);
  const zero = zeroBoth || new RegExp(`(?:無人(?:員)?|未造成(?:人員)?|沒有人)(?:${kind === "deaths" ? "死亡" : "受傷"})`).test(value);
  const positive = value.replace(/(?:無|未|沒有|並未)(?:人員|人)?(?:死亡|受傷|死傷|傷亡)/g, "");
  const digits = "[\\d零〇一二兩三四五六七八九十]+";
  const number = `(?<![\\d零〇一二兩三四五六七八九十])(${digits})`;
  const patterns = kind === "deaths"
    ? [new RegExp(`${number}(?:死(?!傷)|(?:人|名|位)(?:死亡|身亡|喪命))`, "g"), new RegExp(`(?:撞死|輾斃)${number}(?:人|名|位)(?!歲)`, "g")]
    : [new RegExp(`${number}(?:傷(?!亡)|(?:人|名|位)(?:受傷|輕傷|重傷))`, "g"), new RegExp(`撞傷${number}(?:人|名|位)(?!歲)`, "g")];
  const counts = new Set(patterns.flatMap((pattern) => [...positive.matchAll(pattern)].map((match) => numberValue(match[1]))));
  if (kind === "deaths" && /雙亡/.test(positive)) counts.add(2);
  if (zero) counts.add(0);
  // Conflicting counts or an unquantified injury/death remain unknown, never guessed as one.
  return counts.size === 1 ? [...counts][0] : null;
}

function classify(article) {
  const { title, body } = article;
  if (/判刑|判決|起訴|求刑|國民法官|一審|二審|定讞|上訴|修法|政策|立委|議員|質詢|擬推|防制|統計|專題|社論|評論|宣導|回顧/.test(title)) {
    return { reason: "政策、統計、評論或司法後續報導" };
  }
  if (/排除毒駕|無酒駕毒駕|驗無.*毒駕/.test(`${title} ${body.slice(0, 350)}`)) {
    return { reason: "報導排除毒駕" };
  }
  const lead = `${title} ${body.slice(0, 350)}`;
  const drug = /毒駕|吸毒|毒品|毒檢|毒物|安非他命|愷他命|依托咪酯|喪屍煙彈|大麻|海洛因/.test(lead);
  const traffic = /撞|衝入|衝進|衝上|翻車|車禍|事故|肇事|逆向|失控|危險駕駛|拒檢.*(?:逃|衝)|逃逸.*(?:追|衝|車)|闖紅燈/.test(lead);
  if (!drug || !traffic) return { reason: "未確認具體涉毒交通事故或危險事件" };
  const evidenceText = `${title} ${body}`;
  const city = inferCity(title, body);
  const deaths = casualtyCount(evidenceText, "deaths");
  const injuries = casualtyCount(evidenceText, "injuries");
  return { incident: {
    id: `ltn-${crypto.createHash("sha1").update(article.url).digest("hex").slice(0, 12)}`,
    title,
    source: "LTN",
    url: article.url,
    publishedAt: article.publishedAt,
    city,
    deaths,
    injuries,
    summary: text(body.replace(/〔[^〕]*〕|【[^】]*】/g, "")).slice(0, 150),
    confidence: "needs_review",
    extractedDetails: { driver: {}, drug: {}, crash: {}, victim: {}, context: {} },
    dataQuality: {
      includeInStats: false,
      needsHumanReview: true,
      flags: ["automated_candidate", ...(!city ? ["unknown_city"] : []), ...(deaths === null || injuries === null ? ["unknown_casualties"] : [])],
      sourceSearchUrl: article.searchUrl,
    },
  } };
}

async function fetchHtml(url) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(15000),
        headers: { "user-agent": "Mozilla/5.0 compatible; TaiwanDrugDrivingMap/0.1" },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
      if (response.url) canonicalUrl(response.url);
      const html = await response.text();
      if (!/text\/html/i.test(response.headers.get("content-type") || "")) throw new Error(`Expected HTML: ${url}`);
      return html;
    } catch (error) {
      if (attempt === 2 || /HTTP 4(?!29)\d\d/.test(error.message)) throw error;
      await delay(1000 * (attempt + 1));
    }
  }
}

function knownArticles(incidents) {
  const urls = new Set();
  const titles = new Set();
  for (const item of incidents.flatMap((incident) => [incident, ...(incident.relatedReports || [])])) {
    if (item.url) {
      const url = new URL(item.url);
      url.search = "";
      url.hash = "";
      urls.add(url.href);
    }
    if (item.title) titles.add(text(item.title));
  }
  return { urls, titles };
}

async function crawl(existing, report) {
  const first = parseSearch(await fetchHtml(searchUrl(1)), 1);
  const totalPages = Math.max(1, Math.ceil(first.total / DEFAULT_PAGE_SIZE));
  if (totalPages > ltnSearch.maxPages) throw new Error(`Need ${totalPages} pages, exceeding --max-pages ${ltnSearch.maxPages}; split the date range.`);
  report.searchResults = first.total;
  const listings = [...first.articles];
  for (let page = 2; page <= totalPages; page += 1) {
    await delay(300);
    const result = parseSearch(await fetchHtml(searchUrl(page)), page);
    if (result.total !== first.total) throw new Error("Search results changed during pagination; retry the complete run.");
    listings.push(...result.articles);
  }
  if (new Set(listings.map((item) => item.url)).size !== first.total) throw new Error("Search pagination repeated or omitted articles.");
  const known = knownArticles(existing);
  const additions = [];
  for (const listing of listings) {
    const row = { ...listing, status: "duplicate", reason: "已存在的 URL 或報導標題" };
    report.articles.push(row);
    if (known.urls.has(listing.url) || known.titles.has(listing.title)) continue;
    await delay(300);
    const article = parseArticle(await fetchHtml(listing.url), listing);
    const date = normalizeDate(article.publishedAt);
    if (date < ltnSearch.startTime || date > ltnSearch.endTime) {
      Object.assign(row, { status: "excluded", reason: "原文發布日期不在檢查區間" });
      continue;
    }
    const result = classify(article);
    if (result.reason) {
      Object.assign(row, { status: "excluded", reason: result.reason });
      continue;
    }
    additions.push(result.incident);
    known.urls.add(article.url);
    known.titles.add(article.title);
    Object.assign(row, { title: article.title, status: "needs_review", reason: "已讀原文；請核對事件、城市、死傷與重複事故", deaths: result.incident.deaths, injuries: result.incident.injuries });
  }
  return additions;
}

function validateIncidents(items) {
  if (!Array.isArray(items)) throw new Error("Incidents must be a JSON array.");
  const ids = new Set();
  for (const item of items) {
    if (!item.id || ids.has(item.id) || !item.url || !item.title || typeof item.city !== "string") throw new Error(`Invalid or duplicate incident: ${item.id}`);
    ids.add(item.id);
    normalizeDate(item.publishedAt);
    for (const key of ["deaths", "injuries"]) {
      if (item[key] !== null && (!Number.isInteger(item[key]) || item[key] < 0)) throw new Error(`Invalid ${key}: ${item.id}`);
    }
    if (item.dataQuality?.flags?.includes("automated_candidate") && item.dataQuality.includeInStats !== false &&
        (item.dataQuality.needsHumanReview !== false || !cityNames.includes(item.city) || item.deaths === null || item.injuries === null)) {
      throw new Error(`Review city and casualty counts before including in statistics: ${item.id}`);
    }
  }
}

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  try {
    await fs.writeFile(temporary, JSON.stringify(data, null, 2) + "\n");
    await fs.rename(temporary, filePath);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

const report = {
  checkedAt: new Date().toISOString(),
  start: ltnSearch.startTime,
  end: ltnSearch.endTime,
  status: "failed",
  articles: [],
};
if (cli.reportPath && path.resolve(cli.reportPath) === outputPath) throw new Error("Report and incidents paths must differ.");
try {
  let existing;
  try {
    existing = JSON.parse(await fs.readFile(outputPath, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT" || cli.validate) throw error;
    existing = [];
  }
  validateIncidents(existing);
  if (cli.validate && !existing.length) throw new Error("The published incidents file must not be empty.");
  const additions = cli.validate ? [] : await crawl(existing, report);
  const incidents = [...additions, ...existing].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  validateIncidents(incidents);
  if (additions.length) await writeJson(outputPath, incidents);
  Object.assign(report, { status: cli.validate ? "validated" : additions.length ? "updated" : "no_change", added: additions.length, total: incidents.length });
  console.log(`${report.status}: ${additions.length} new review candidate(s); ${incidents.length} total. Checked ${report.start}-${report.end}.`);
} catch (error) {
  report.error = error.message;
  throw error;
} finally {
  if (cli.reportPath) await writeJson(path.resolve(cli.reportPath), report);
}
