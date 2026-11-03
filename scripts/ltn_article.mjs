import { setTimeout as delay } from "node:timers/promises";
import { load } from "cheerio";

function text(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function canonicalUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || !url.hostname.endsWith(".ltn.com.tw")) {
    throw new Error(`Unexpected article URL: ${value}`);
  }
  url.search = "";
  url.hash = "";
  return url.href;
}

function isArticleParagraph(paragraph) {
  if (!paragraph || /請繼續往下閱讀|自由時報提醒您|下載\s*APP|加入\s*LINE|加入自由[^。]*LINE|^☆.*(?:禁止酒駕|飲酒過量)|^☆健康新聞/i.test(paragraph)) return false;
  // Photo credits also occur in plain paragraphs, outside LTN's photo containers.
  return !/[（(](?:圖[／/：:]|照片[／/：:]|記者[^（）()]*攝|[^（）()]*(?:翻攝|提供|資料照|示意圖))[^（）()]*[）)]$/.test(paragraph);
}

export function parseArticleHtml(html, listing) {
  const url = canonicalUrl(listing.url);
  if (typeof html !== "string") throw new Error(`Missing article HTML: ${url}`);
  const $ = load(html);
  const objects = [];
  for (const node of $('script[type="application/ld+json"]').toArray()) {
    try {
      const value = JSON.parse($(node).html());
      objects.push(...(Array.isArray(value) ? value : [value]));
      if (Array.isArray(value?.["@graph"])) objects.push(...value["@graph"]);
    } catch { /* Some unrelated advertising metadata is not valid JSON. */ }
  }
  const article = objects.find((item) => item && [item["@type"]].flat().includes("NewsArticle"));
  const title = text(article?.headline || $("h1").first().text());
  const dateText = article?.datePublished || $('meta[property="article:published_time"]').attr("content");
  if (!title || typeof dateText !== "string" || !/^20\d\d-\d\d-\d\d(?:T|$)/.test(dateText)) {
    throw new Error(`Missing article title or absolute publication date: ${url}`);
  }
  const publishedAt = dateText.slice(0, 10);
  const [year, month, day] = publishedAt.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) {
    throw new Error(`Invalid calendar date: ${publishedAt}`);
  }

  $(".text p img, .text p picture").remove();
  $("script, style, .appE1121, .ad, .related, .photo, figure, figcaption, .caption, .photo-caption, .img-caption, .promotion").remove();
  const paragraphs = $(".text p").toArray().map((node) => text($(node).text())).filter(isArticleParagraph);
  // JSON-LD is a fallback for LTN sections without the usual article paragraphs.
  const fallback = String(article?.articleBody || "").split(/\r?\n/).map(text).filter(isArticleParagraph).join("\n");
  const body = paragraphs.join("\n") || fallback;
  if (!body || body.length < 20) throw new Error(`Missing article body: ${url}`);
  return {
    url,
    title,
    publishedAt,
    ...(dateText.includes("T") ? { publishedTime: dateText } : {}),
    body,
    source: "LTN",
    ...(listing.searchUrl ? { searchUrl: listing.searchUrl } : {}),
  };
}

export async function fetchHtml(url) {
  canonicalUrl(url);
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

// Shared source adapter: every returned listing belongs to a fully checked page.
export async function discoverArticles({ from, to, keywords = ["毒駕", "酒駕", "酒後駕車", "酒測", "拒測"], maxPages = 30 }) {
  const found = new Map();
  for (const keyword of keywords) {
    let total = null;
    const seen = new Set();
    for (let page = 1; ; page += 1) {
      const params = new URLSearchParams({ keyword, start_time: from.replaceAll("-", ""), end_time: to.replaceAll("-", ""), sort: "date", type: "all" });
      if (page > 1) params.set("page", String(page));
      const searchUrl = `https://search.ltn.com.tw/list?${params}`;
      const $ = load(await fetchHtml(searchUrl));
      $("script, style").remove();
      const count = $("body").text().match(/約有\s*([\d,]+)\s*項結果/);
      if (!count) throw new Error(`Unrecognized search page: ${keyword}, page ${page}`);
      const pageTotal = Number(count[1].replaceAll(",", ""));
      if (total !== null && total !== pageTotal) throw new Error(`Search changed during pagination: ${keyword}`);
      total = pageTotal;
      if (Math.ceil(total / 20) > maxPages) throw new Error(`Search exceeds ${maxPages} pages: ${keyword}; use a shorter date window.`);
      const items = $(".cont a.tit").toArray().map((node) => ({ url: canonicalUrl($(node).attr("href")),
        title: text($(node).attr("title") || $(node).text()), searchUrl }));
      if (items.length !== Math.min(20, Math.max(0, total - (page - 1) * 20)) || items.some((item) => !item.title)) {
        throw new Error(`Incomplete search page: ${keyword}, page ${page}`);
      }
      for (const item of items) {
        if (seen.has(item.url)) throw new Error(`Repeated search result: ${keyword}`);
        seen.add(item.url); found.set(item.url, item);
      }
      if (seen.size === total) break;
      await delay(300);
    }
  }
  return [...found.values()];
}
