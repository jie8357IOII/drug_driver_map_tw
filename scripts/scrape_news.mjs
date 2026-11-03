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
  --rejections <path>                JSON array of previously removed source URLs.
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

    if (["--date", "--start", "--end", "--output", "--keyword", "--max-pages", "--report", "--rejections"].includes(arg)) {
      if (!next || next.startsWith("--")) {
        throw new Error(`${arg} requires a value.`);
      }

      if (arg === "--date") args.date = next;
      if (arg === "--start") args.start = next;
      if (arg === "--end") args.end = next;
      if (arg === "--output") args.outputPath = next;
      if (arg === "--keyword") args.keyword = next;
      if (arg === "--report") args.reportPath = next;
      if (arg === "--rejections") args.rejectionsPath = next;
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
  $("script, style, .appE1121, .ad, .related, .photo").remove();
  const paragraphs = $(".text p").toArray().map((node) => text($(node).text()))
    .filter((paragraph) => paragraph && !/請繼續往下閱讀|自由時報提醒您|下載APP|加入LINE/.test(paragraph));
  // JSON-LD is a fallback for LTN sections without the usual article paragraphs.
  const body = paragraphs.join("\n") || text(article?.articleBody);
  if (!body || body.length < 20) throw new Error(`Missing article body: ${listing.url}`);
  return { ...listing, title, publishedAt, body };
}

function inferCity(title, body) {
  const withoutByline = body.replace(/〔[^〕]*〕|【[^】]*】/g, "");
  const shortNames = { 北市: "臺北市", 嘉縣: "嘉義縣", 嘉市: "嘉義市", 竹縣: "新竹縣", 竹市: "新竹市" };
  const names = [...cityNames, ...Object.keys(shortNames)].sort((a, b) => b.length - a.length);
  const pattern = new RegExp(names.join("|"), "g");
  // Prefer an explicit driving/crash location over a later arrest or residence.
  const location = withoutByline.match(new RegExp(`(?:行經|行駛於|發生在|駕車在|騎車在)(${names.join("|")})`))?.[1];
  for (const value of [location || "", title, withoutByline]) {
    for (const match of value.matchAll(pattern)) {
      // These two names alone cannot distinguish the city from the county.
      if (["新竹", "嘉義"].includes(match[0])) continue;
      return shortNames[match[0]] || aliases[match[0]] || match[0];
    }
  }
  return "";
}

function nonIncidentHeadline(title) {
  return /判刑|判決|重判|輕判|判處|徒刑|起訴|求刑|國民法官|一審|二審|定讞|上訴|修法|政策|刑責|刑罰|立委|藍委|議員|質詢|擬推|防制|防毒駕|統計|專題|社論|評論|自由觀點|自由廣場|宣導|回顧/.test(title);
}

function currentIncidentText(body) {
  return body.split(/[。！？\n]/).filter((sentence) =>
    !/去年|前年|過去|多年前|另一起|另外一起|另案|統計|往年|平均|呼籲|提醒|宣導/.test(sentence),
  ).join("。");
}

function extractDetails(title, body) {
  const facts = `${title}。${currentIncidentText(body)}`;
  const affirmed = facts.split(/[，,；;。！？\n]/).filter((clause) =>
    !/未發現|未見|查無|未檢出|陰性|未呈|否認|並非|拒絕|拒測|尚未/.test(clause),
  ).join("。");
  const keywords = [
    ["安非他命", /(?:甲基)?安非[他它]命|安毒/],
    ["K他命", /愷他命|氯胺酮|K他命/i],
    ["依托咪酯", /依[托託]咪酯/],
    ["喪屍煙彈", /喪屍[煙菸]彈/],
    ["大麻", /大麻/],
    ["海洛因", /海洛因/],
    ["甲基卡西酮", /甲基卡西酮/],
    ["可卡因", /可卡因|古柯鹼/],
    ["MDMA", /MDMA|搖頭丸/i],
    ["毒咖啡包", /毒(?:品)?咖啡包/],
  ].filter(([, pattern]) => pattern.test(affirmed)).map(([label]) => label);
  const performedTests = facts.split(/[。！？\n；;]|[，,](?=後來|隨後|之後|並經)/).filter((sentence) =>
    !/拒絕|拒測|不願|不配合|要求|尚未|未(?:實施|進行|採集|檢驗|快篩)|(?:將|擬|待)[^。]{0,8}(?:採|驗|檢測)/.test(sentence),
  ).join("。");
  const testMethods = [
    ["唾液快篩/檢測", /唾液[^。]{0,10}(?:篩|檢|測)|唾篩/],
    ["尿液檢驗", /(?:尿液|驗尿|採尿)[^。]{0,15}(?:檢|驗|送驗)|驗尿/],
    ["血液檢驗", /(?:血液|抽血)[^。]{0,15}(?:檢|驗|送驗)/],
  ].filter(([, pattern]) => pattern.test(performedTests)).map(([label]) => label);
  // Require a driving verb, so a struck motorcycle does not become the offender's car.
  const vehicle = facts.match(/(?:騎乘?|駕駛|駕著|開著)(?:一輛|一部)?(?:白色|黑色|紅色)?(微型電動二輪車|電動自行車|電動機車|自行車|腳踏車|機車|小貨車|大貨車|貨車|轎車|汽車)/)?.[1];
  const primaryVehicleType = vehicle === "轎車" ? "汽車" : vehicle === "腳踏車" ? "自行車" : vehicle;
  const scenarioTypes = [
    ["逆向", /逆向/],
    ["闖紅燈", /闖紅燈/],
    ["綠燈未行", /綠燈[^。！？]*(?:不走|不動|未起步)/],
    ["拒檢逃逸", /拒檢[^。]*(?:逃|衝)|攔(?:查|檢)[^。]*(?:加速逃|逃逸)/],
    ["自摔/失控", /自摔|失控/],
    ["衝撞警員/警車", /撞[^。]{0,6}(?:警員|員警|警車|警用)/],
    ["肇事逃逸", /肇逃|肇事[^。]{0,8}逃逸|撞[^。]{0,15}逃逸/],
    ["碰撞", /撞|擦撞/],
    ["行駛人行道", /(?:騎|行駛|駛入)[^。]{0,8}人行道/],
  ].filter(([, pattern]) => pattern.test(affirmed)).map(([label]) => label);
  return {
    driver: primaryVehicleType ? { primaryVehicleType, primaryVehicleLabel: vehicle, vehicleExtractionMethod: "article_text" } : {},
    drug: { keywords, testMethods },
    crash: { scenarioTypes }, victim: {}, context: {},
  };
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
  const zeroPrefix = "(?:無人(?:員)?|未造成(?:人員)?|沒有(?:造成)?(?:人員|人)?|並無(?:人員|人)?)";
  const zeroBoth = new RegExp(`${zeroPrefix}(?:傷亡|死傷)`).test(value);
  const zero = zeroBoth || new RegExp(`${zeroPrefix}${kind === "deaths" ? "死亡" : "受傷"}`).test(value);
  const positive = value.replace(new RegExp(`${zeroPrefix}(?:死亡|受傷|死傷|傷亡)`, "g"), "");
  if (zero && (kind === "deaths" ? /死亡|身亡|不治|撞死|喪命/ : /受傷|輕傷|重傷|撞傷/).test(positive)) return null;
  const digits = "[\\d零〇一二兩三四五六七八九十]+";
  const number = `(?<![\\d零〇一二兩三四五六七八九十])(${digits})`;
  const patterns = kind === "deaths"
    ? [new RegExp(`${number}(?:死(?!傷)|(?:人|名|位)(?:死亡|身亡|喪命))`, "g"), new RegExp(`(?:撞死|輾斃)${number}(?:人|名|位)(?!歲)`, "g")]
    : [new RegExp(`${number}(?:傷(?!亡)|(?:人|名|位)(?:受傷|輕傷|重傷))`, "g"), new RegExp(`撞傷${number}(?:(?:名|位)?(?:員警|警員|警)|(?:人|名|位)(?!歲))`, "g")];
  const counts = new Set(patterns.flatMap((pattern) => [...positive.matchAll(pattern)].map((match) => numberValue(match[1]))));
  if (kind === "deaths" && /雙亡/.test(positive)) counts.add(2);
  if (zero) counts.add(0);
  // Conflicting counts or an unquantified injury/death remain unknown, never guessed as one.
  return counts.size === 1 ? [...counts][0] : null;
}

function casualtyEvidence(title, body) {
  if (/否認|不實|誤傳|網傳|謠言|未證實/.test(`${title} ${body}`)) return "";
  const summaries = body.split(/[。！？\n]/).filter((sentence) =>
    !/去年|前年|過去|多年前|另一起|另外一起|另案|統計|往年|平均|附近店家/.test(sentence) &&
    /(?:造成|釀成|釀|發生|導致|共計|合計)[\d零〇一二兩三四五六七八九十]|(?:現場|整起事故|這起事故|所幸)(?:均|皆|並|幸|所幸)?(?:無人|未造成|沒有造成)/.test(sentence),
  );
  return `${title} ${summaries.join(" ")}`;
}

function classify(article) {
  const { title, body } = article;
  if (nonIncidentHeadline(title)) {
    return { reason: "政策、統計、評論或司法後續報導" };
  }
  const facts = `${title} ${currentIncidentText(body)}`;
  const negationChecked = facts.replace(/尚未排除毒駕|未排除毒駕|不排除(?:他)?毒駕|不能排除毒駕|無法排除毒駕/g, "疑似毒駕");
  if (/排除毒駕|無(?:酒駕[、或及與]?|飲酒[、或及與]?)?毒駕|驗無毒駕/.test(negationChecked)) {
    return { reason: "報導排除毒駕" };
  }
  const drugEvidence = facts.replace(/(?:未發現|未見|查無|無)(?:酒駕[、或及與]?|酒精[、或及與]?)?(?:毒駕(?:徵候|反應)?|毒品(?:相關)?(?:跡證|反應)?)/g, "");
  // Possession plus a traffic violation does not establish impaired driving.
  const drug = /毒駕|(?:吸毒|施用毒品|吸食[^。]{0,12}毒品)[^。]{0,20}(?:駕車|開車|騎車|上路)/.test(drugEvidence) ||
    drugEvidence.split(/[。\n]/).some((sentence) => !/乘客|乘員|同車友人/.test(sentence) && /(?:駕駛|騎士)[^。]{0,60}(?:唾液|尿液|毒品|毒檢)[^。]{0,40}陽性/.test(sentence));
  // General drug/enforcement stories often mention historical crashes in their body.
  // Require a concrete traffic event in the headline, then verify the drug link in the article.
  const traffic = /撞|衝入|衝進|衝上|翻車|自摔|捲(?:入)?車底|車禍|事故|肇事|逆向|失控|危險駕駛|拒檢.*(?:逃|衝)|逃逸.*(?:追|衝|車)|闖紅燈|綠燈[^。！？]*(?:不走|不動|未起步)|釀.*(?:死|傷)/.test(title);
  if (!drug || !traffic) return { reason: "未確認具體涉毒交通事故或危險事件" };
  const multipleIncidents = /(?:兩|2)(?:起|件)(?:毒駕|事故|案件)|分別查獲|(?:毒駕|酒駕)案.{0,8}處理完/.test(`${title} ${body}`);
  const evidenceText = multipleIncidents ? "" : casualtyEvidence(title, body);
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
    extractedDetails: multipleIncidents ? { driver: {}, drug: {}, crash: {}, victim: {}, context: {} } : extractDetails(title, body),
    dataQuality: {
      includeInStats: false,
      needsHumanReview: true,
      flags: ["automated_candidate", ...(multipleIncidents ? ["multiple_incidents_same_article"] : []), ...(!city ? ["unknown_city"] : []), ...(deaths === null || injuries === null ? ["unknown_casualties"] : [])],
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
  const rejected = new Set(cli.rejectionsPath ? JSON.parse(await fs.readFile(cli.rejectionsPath, "utf8")) : []);
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
    if (rejected.has(listing.url)) {
      Object.assign(row, { status: "excluded", reason: "先前複核已移除的來源；保留刪除決定" });
      continue;
    }
    if (nonIncidentHeadline(listing.title)) {
      Object.assign(row, { status: "excluded", reason: "標題為政策、統計、評論或司法後續；未擷取事故內文" });
      continue;
    }
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
  const existing = JSON.parse(await fs.readFile(outputPath, "utf8"));
  validateIncidents(existing);
  if (!existing.length) throw new Error("The existing incidents file must not be empty; refusing to replace historical data.");
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
