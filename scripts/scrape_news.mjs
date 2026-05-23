import fs from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";

const outputPath = path.resolve("public/data/incidents.json");
const ltnSearch = {
  source: "LTN",
  baseUrl: "https://search.ltn.com.tw/list",
  keyword: "毒駕",
  type: "all",
  sort: "date",
  startTime: "20240101",
  endTime: "20260523",
  pageSize: 20,
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

const chineseNumbers = {
  一: 1,
  二: 2,
  兩: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
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

function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function inferCity(text) {
  const match = cityNames.find((city) => text.includes(city));
  if (!match) return "";
  return aliases[match] || match;
}

function toNumber(value) {
  if (!value) return 0;
  if (/^\d+$/.test(value)) return Number(value);
  if (value === "十") return 10;
  if (value.includes("十")) {
    const [tens, ones] = value.split("十");
    return (chineseNumbers[tens] || 1) * 10 + (chineseNumbers[ones] || 0);
  }
  return chineseNumbers[value] || 0;
}

function inferCount(text, patterns, fallback) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return toNumber(match[1]);
  }
  return text.match(fallback) ? 1 : 0;
}

function inferIncidentFields(text) {
  const city = inferCity(text);
  const number = "([\\d一二兩三四五六七八九十]+)(?![\\d一二兩三四五六七八九十歲])";
  const deaths = inferCount(
    text,
    [
      new RegExp(`${number}死`),
      new RegExp(`${number}[人名]?死亡`),
      new RegExp(`撞死${number}`),
      new RegExp(`奪${number}命`),
      new RegExp(`${number}命`),
    ],
    /不治|喪命|撞死|死亡|身亡|亡/,
  );
  const injuries = inferCount(
    text,
    [
      new RegExp(`${number}傷`),
      new RegExp(`${number}人受傷`),
      new RegExp(`撞傷${number}`),
      new RegExp(`重傷${number}`),
    ],
    /重傷|昏迷|受傷|擦挫傷|輕傷/,
  );

  return {
    city,
    deaths: /父女(?:雙亡|不治)|雙亡/.test(text) ? Math.max(deaths, 2) : deaths,
    injuries: /妻重傷|母重傷/.test(text) ? Math.max(injuries, 1) : injuries,
  };
}

function endDate() {
  const value = ltnSearch.endTime;
  return new Date(Date.UTC(Number(value.slice(0, 4)), Number(value.slice(4, 6)) - 1, Number(value.slice(6, 8))));
}

function formatDate(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function parsePublishedAt(timeText) {
  const text = stripTags(timeText);
  const absolute = text.match(/(20\d{2})[/-](\d{1,2})[/-](\d{1,2})/);
  if (absolute) {
    return `${absolute[1]}-${absolute[2].padStart(2, "0")}-${absolute[3].padStart(2, "0")}`;
  }

  const base = endDate();
  const daysAgo = text.match(/(\d+)天前/);
  if (daysAgo) {
    base.setUTCDate(base.getUTCDate() - Number(daysAgo[1]));
    return formatDate(base);
  }

  if (/分鐘前|小時前|剛剛/.test(text)) {
    return formatDate(base);
  }

  return "";
}

function parseTotalResults(html) {
  const text = stripTags(html);
  const totalMatch = text.match(/約有\s*([\d,]+)\s*項結果/);
  if (totalMatch) return Number(totalMatch[1].replaceAll(",", ""));

  const pageNumbers = [...html.matchAll(/page=(\d+)"/g)].map((match) => Number(match[1]));
  if (pageNumbers.length) return Math.max(...pageNumbers) * ltnSearch.pageSize;
  return ltnSearch.pageSize;
}

function parseLtnResults(html) {
  const rows = [...html.matchAll(/<li>\s*<a[\s\S]*?<div class="cont"[\s\S]*?<\/div>\s*<\/li>/g)];
  const candidates = [];

  for (const row of rows) {
    const block = row[0];
    const titleMatch = block.match(/<a href="([^"]+)" class="tit"[\s\S]*?title="([^"]+)"[\s\S]*?>([\s\S]*?)<\/a>/);
    if (!titleMatch) continue;

    const url = titleMatch[1];
    const title = stripTags(titleMatch[2] || titleMatch[3]);
    if (!title.includes(ltnSearch.keyword)) continue;

    const timeMatch = block.match(/<span class="time">([\s\S]*?)<\/span>/);
    const summaryMatch = block.match(/<p>([\s\S]*?)<\/p>/);
    const summary = stripTags(summaryMatch?.[1] || "");
    const fields = inferIncidentFields(`${title} ${summary}`);
    if (!fields.city || fields.deaths + fields.injuries === 0) continue;

    candidates.push({
      id: `ltn-${crypto.createHash("sha1").update(url).digest("hex").slice(0, 12)}`,
      title,
      source: ltnSearch.source,
      url,
      publishedAt: parsePublishedAt(timeMatch?.[1] || ""),
      city: fields.city,
      deaths: fields.deaths,
      injuries: fields.injuries,
      summary: summary.slice(0, 150),
      confidence: "needs_review",
    });
  }

  return candidates;
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 compatible; TaiwanDrugDrivingMap/0.1",
    },
  });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.text();
}

async function crawl() {
  const firstPageHtml = await fetchHtml(searchUrl(1));
  const totalResults = parseTotalResults(firstPageHtml);
  const totalPages = Math.ceil(totalResults / ltnSearch.pageSize);
  const byUrl = new Map();

  for (const candidate of parseLtnResults(firstPageHtml)) {
    byUrl.set(candidate.url, candidate);
  }

  console.log(`LTN reports about ${totalResults} results, crawling ${totalPages} pages.`);

  for (let page = 2; page <= totalPages; page += 1) {
    const html = await fetchHtml(searchUrl(page));
    for (const candidate of parseLtnResults(html)) {
      byUrl.set(candidate.url, candidate);
    }

    if (page % 10 === 0 || page === totalPages) {
      console.log(`Crawled page ${page}/${totalPages}; incidents so far: ${byUrl.size}`);
    }
  }

  return [...byUrl.values()]
    .filter((item) => item.publishedAt)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

const incidents = await crawl();
await fs.writeFile(outputPath, JSON.stringify(incidents, null, 2) + "\n");
console.log(`Wrote ${incidents.length} LTN incidents to ${outputPath}`);
