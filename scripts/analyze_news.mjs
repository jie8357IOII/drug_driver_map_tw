#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchHtml, parseArticleHtml } from "./ltn_article.mjs";

const help = `Usage:
  node scripts/analyze_news.mjs --url URL --output DIR
  node scripts/analyze_news.mjs --urls FILE --output DIR
  node scripts/analyze_news.mjs --input FILE --output DIR

Choose exactly one input. --urls reads one URL per line.
--input reads normalized {articles:[...]} or captured {articles:{url:{status,body}}} JSON without fetching.
Writes sources.json, analysis.json, candidates.json and review.md only to DIR.
`;

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--help" || flag === "-h") {
      args.help = true;
      continue;
    }
    if (!["--url", "--urls", "--input", "--output"].includes(flag)) throw new Error(`Unknown argument: ${flag}`);
    const value = argv[++index];
    if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value.`);
    const key = flag.slice(2);
    if (args[key] !== undefined) throw new Error(`${flag} may only be supplied once.`);
    args[key] = value;
  }
  if (args.help) return args;
  if ([args.url, args.urls, args.input].filter(Boolean).length !== 1) throw new Error("Use exactly one of --url, --urls or --input.");
  if (!args.output) throw new Error("--output DIR is required.");
  return args;
}

async function outputDirectory(value) {
  const directory = path.resolve(value);
  // Resolve existing ancestors as well, so a symlink cannot route output into public data.
  let ancestor = directory;
  const missing = [];
  let resolved;
  while (!resolved) {
    try {
      resolved = path.resolve(await fs.realpath(ancestor), ...missing);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      missing.unshift(path.basename(ancestor));
      ancestor = path.dirname(ancestor);
    }
  }
  const publicData = await fs.realpath(fileURLToPath(new URL("../public/data", import.meta.url)));
  const relative = path.relative(publicData, resolved);
  if (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))) {
    throw new Error("Output must be outside public/data.");
  }
  // Existing report symlinks must not redirect individual writes outside the output directory.
  for (const name of ["sources.json", "analysis.json", "candidates.json", "review.md"]) {
    const file = path.join(resolved, name);
    const stat = await fs.lstat(file).catch((error) => {
      if (error.code !== "ENOENT") throw error;
      return null;
    });
    if (stat?.isSymbolicLink()) throw new Error(`Refusing to overwrite a report symlink: ${file}`);
  }
  return resolved;
}

function normalizeArticle(article) {
  if (!article || typeof article !== "object" || Array.isArray(article)) throw new Error("Expected a normalized article object.");
  for (const key of ["url", "title", "publishedAt", "body"]) {
    if (typeof article[key] !== "string" || !article[key].trim()) throw new Error(`Missing article ${key}.`);
  }
  const url = new URL(article.url);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error(`Unexpected article URL: ${article.url}`);
  const date = new Date(`${article.publishedAt}T00:00:00Z`);
  if (!/^20\d\d-\d\d-\d\d$/.test(article.publishedAt) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== article.publishedAt) {
    throw new Error(`Invalid publication date: ${article.publishedAt}`);
  }
  return { ...article, source: article.source || "LTN" };
}

async function readInputs(args) {
  if (args.url) return [{ kind: "url", url: args.url }];
  if (args.urls) {
    const urls = (await fs.readFile(args.urls, "utf8")).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    return urls.map((url) => ({ kind: "url", url }));
  }
  const input = JSON.parse(await fs.readFile(args.input, "utf8"));
  if (Array.isArray(input?.articles)) {
    return input.articles.map((article) => ({ kind: "normalized", article, url: article?.url }));
  }
  if (input?.articles && typeof input.articles === "object") {
    return Object.entries(input.articles).map(([url, entry]) => ({ kind: "captured", url, entry }));
  }
  throw new Error("Input must contain an articles array or a captured articles object.");
}

async function readArticle(input) {
  if (input.kind === "normalized") return normalizeArticle(input.article);
  if (input.kind === "url") return parseArticleHtml(await fetchHtml(input.url), { url: input.url });
  const status = typeof input.entry === "string" ? 200 : input.entry?.status ?? 200;
  if (!Number.isInteger(status) || status < 200 || status >= 300) throw new Error(`Captured HTTP ${status}: ${input.url}`);
  const html = typeof input.entry === "string" ? input.entry : input.entry?.body;
  return parseArticleHtml(html, { url: input.url, searchUrl: input.entry?.searchUrl });
}

function articleInfo(article) {
  return {
    url: article?.url ?? null,
    title: article?.title ?? null,
    publishedAt: article?.publishedAt ?? null,
    source: article?.source || "LTN",
  };
}

function errorInfo(stage, error) {
  return { stage, message: error instanceof Error ? error.message : String(error) };
}

function list(value) {
  return value == null ? [] : Array.isArray(value) ? value : [value];
}

function display(value) {
  if (value == null || value === "") return "未知";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

function cell(value) {
  return display(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/[\\`\[\]*_]/g, "\\$&").replace(/\|/g, "&#124;").replace(/\r?\n/g, "<br>");
}

function sourceCell(article) {
  const title = cell(article.title);
  let link = `${title}<br>${cell(article.url)}`;
  try {
    const url = new URL(article.url);
    if (["http:", "https:"].includes(url.protocol)) link = `[${title}](<${url.href.replace(/[<>|]/g, encodeURIComponent)}>)`;
  } catch { /* Invalid source URLs remain visible in error rows. */ }
  return `${cell(article.source)} · ${link}<br>發布：${cell(article.publishedAt)}`;
}

function casualtyCell(casualty) {
  return `值：${cell(casualty?.value)}<br>依據：${cell(casualty?.basis)}<br>至少：${cell(casualty?.minimum)}`;
}

function eventReview(event, index) {
  const lines = [`### 事件 ${index + 1}：${cell(event.id)}`, "", "**人物**", ""];
  const evidenceEntries = new Map();
  const evidenceRefs = (items) => list(items).map((item) => {
    const sentenceId = item?.sentenceId;
    const quote = item?.quote ?? item;
    const key = JSON.stringify([sentenceId ?? null, quote]);
    if (!evidenceEntries.has(key)) evidenceEntries.set(key, { label: `E${evidenceEntries.size + 1}`, sentenceId, quote });
    return evidenceEntries.get(key).label;
  }).filter((label, position, labels) => labels.indexOf(label) === position).join("、") || "未提供";

  const actors = list(event.actors);
  for (const actor of actors) {
    lines.push(`- ${cell(actor?.id)}：${cell(actor?.label)}；roles：${list(actor?.roles).map(cell).join("、") || "未列明"}；依據：${evidenceRefs(actor?.evidence)}`);
  }
  if (!actors.length) lines.push("- 未辨識人物，仍須核對原文。請勿把未綁定的陳述自行歸給駕駛。");
  lines.push("", "**毒品與檢測陳述（drugClaims）**", "");
  const claims = list(event.drugClaims);
  for (const [claimIndex, claim] of claims.entries()) {
    const actorIds = list(claim?.actorIds).map((id) => {
      const actor = actors.find((person) => person?.id === id);
      return `${cell(id)}（${actor ? cell(actor.label) : "未找到對應人物"}）`;
    }).join("、") || (claim?.actorIds == null ? "未提供" : "[]（未綁定人物）");
    const methods = list(claim?.methods).map(cell).join("、") || (claim?.methods == null ? "未提供" : "[]（未列明）");
    const substances = list(claim?.substances).map((substance) => {
      if (substance?.name == null) return cell(substance);
      return `${cell(substance.name)}${substance.raw != null ? `（原文：${cell(substance.raw)}）` : ""}`;
    }).join("、") || (claim?.substances == null ? "未提供" : "[]（未列明）");
    const refs = evidenceRefs(claim?.evidence);
    const source = typeof claim?.text === "string" && claim.text.trim()
      ? `原文子句（text）：${cell(claim.text)}<br>句子依據（evidence）：${refs}`
      : `原文（evidence）：${refs}${refs === "未提供" ? "；缺少原文依據，需補查" : "，完整引文見本事件下方"}`;
    lines.push(
      `- **陳述 ${claimIndex + 1}** · kind：${cell(claim?.kind)}；status：${cell(claim?.status)}<br>` +
      `actorIds：${actorIds}；timeScope：${cell(claim?.timeScope)}<br>` +
      `methods：${methods}；substances：${substances}<br>${source}`,
    );
  }
  if (!claims.length) lines.push("- 未列出 drugClaims；不代表已排除毒駕或已完成檢測。");

  lines.push("", "**酒精與酒駕陳述（alcoholClaims）**", "");
  for (const claim of list(event.alcoholClaims)) {
    lines.push(`- ${cell(claim.kind)}／${cell(claim.status)}；人物：${list(claim.actorIds).map(cell).join("、") || "未綁定"}；` +
      `檢體：${cell(claim.specimen)}；數值：${cell(claim.value)}；單位：${cell(claim.unit)}；時間：${cell(claim.timeScope)}；依據：${evidenceRefs(claim.evidence)}`);
  }
  lines.push("", "**其他判讀依據**", "");
  for (const [label, field] of [
    ["日期", event.occurredAt], ["縣市", event.city], ["毒駕彙整（待複核）", event.drugDriving], ["酒駕彙整（待複核）", event.alcoholDriving],
    ["死亡", event.casualties?.deaths], ["受傷", event.casualties?.injuries],
  ]) {
    lines.push(`- ${label}：${evidenceRefs(field?.evidence)}${label === "日期" ? `；日期原文：${cell(field?.raw)}` : ""}`);
  }
  lines.push("", "**原文證據（相同引文只列一次；E 編號限本事件）**", "");
  for (const { label, sentenceId, quote } of evidenceEntries.values()) {
    lines.push(`- **${label}** · sentenceId：${cell(sentenceId)}<br>${cell(quote)}`);
  }
  if (!evidenceEntries.size) lines.push("- 未提供原文證據。");
  lines.push("", "**事件問題**", "");
  const issues = list(event.issues);
  lines.push(...(issues.length ? issues.map((issue) => `- ${cell(issue)}`) : ["- 程式未列出問題；仍待原文複核。"]), "");
  return lines;
}

function reviewMarkdown(results, errors, candidateCount) {
  const failures = results.filter((entry) => entry.status === "error").length;
  const failed = failures > 0 || errors.length > 0;
  const lines = [
    "# 新聞原文判讀", "",
    `狀態：${failed ? "解析未完成（含失敗項目）；已解析部分尚待原文複核" : "解析完成，尚待原文複核"}；文章：${results.length}；失敗文章：${failures}；候選：${candidateCount}。`, "",
    "值為「未知」不等於零；「至少」是已知下限，未必是事件總數。候選與原文判讀不代表已核准納入統計。", "",
    "drugDriving 是程式彙整結果；請逐項核對 drugClaims 的人物、對象、時間與原文。拒測、待驗及物品陽性不能直接視為駕駛人體檢測陽性。", "",
  ];
  for (const error of errors) lines.push(`- ${cell(error.stage)}：${cell(error.message)}`);
  if (errors.length) lines.push("");
  for (const [articleIndex, entry] of results.entries()) {
    lines.push(`## ${articleIndex + 1}．${cell(entry.article.title)}`, "", sourceCell(entry.article), "");
    if (entry.status === "error") {
      lines.push(`解析失敗：${cell(entry.error.stage)}。此篇未完成解析，不能視為無事件。`, "", `- ${cell(entry.error.message)}`, "");
      continue;
    }
    const result = entry.result;
    lines.push(`程式處置（disposition）：${cell(result.disposition)}；解析事件：${result.events.length}。以上尚待原文複核。`, "");
    if (list(result.issues).length) {
      lines.push("**文章問題**", "", ...list(result.issues).map((issue) => `- ${cell(issue)}`), "");
    }
    if (!result.events.length) {
      lines.push("程式未解析出事件，仍須確認是否漏讀原文。", "");
      continue;
    }
    lines.push(
      "| 事件 | 事發日期／縣市 | 酒／毒駕彙整（待複核） | 死亡 | 受傷 |",
      "|---|---|---|---|---|",
    );
    for (const event of result.events) {
      const dateCity = `${cell(event.occurredAt?.value)}<br>${cell(event.city?.value)}`;
      const types = { collision: "造成事故", dangerous_driving: "危險駕駛", drug_driving: "毒駕上路", alcohol_driving: "酒駕上路", driving: "一般行駛（未建立酒／毒駕）" };
      const eventLabel = `${cell(event.id)}<br>${cell(types[event.traffic?.eventType])}<br>${event.candidate ? "待複核候選" : "未產生候選"}`;
      lines.push(`| ${eventLabel} | ${dateCity} | 毒：${cell(event.drugDriving?.status)}<br>酒：${cell(event.alcoholDriving?.status)} | ${casualtyCell(event.casualties?.deaths)} | ${casualtyCell(event.casualties?.injuries)} |`);
    }
    lines.push("");
    for (const [eventIndex, event] of result.events.entries()) lines.push(...eventReview(event, eventIndex));
  }
  return lines.join("\n") + "\n";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(help);
    return;
  }
  const directory = await outputDirectory(args.output);
  const sources = [];
  const results = [];
  const candidates = [];
  const errors = [];
  const pending = [];
  try {
    const inputs = await readInputs(args);
    if (!inputs.length) throw new Error("No articles supplied.");
    for (const input of inputs) {
      const entry = { article: articleInfo(input.article || { url: input.url }) };
      results.push(entry);
      try {
        const article = await readArticle(input);
        sources.push(article);
        entry.article = articleInfo(article);
        pending.push({ article, entry });
      } catch (error) {
        Object.assign(entry, { status: "error", error: errorInfo("source", error) });
      }
    }
  } catch (error) {
    errors.push(errorInfo("input", error));
  }

  if (pending.length) {
    let understandArticle;
    let moduleError;
    try {
      ({ understandArticle } = await import("./news_understanding.mjs"));
      if (typeof understandArticle !== "function") throw new Error("news_understanding.mjs must export understandArticle(article).");
    } catch (error) {
      moduleError = error;
    }
    for (const { article, entry } of pending) {
      try {
        if (moduleError) throw moduleError;
        const result = await understandArticle(article);
        entry.result = result;
        if (!result || typeof result.disposition !== "string" || !Array.isArray(result.events) || !Array.isArray(result.candidates) ||
            result.events.some((event) => !event || typeof event !== "object" || Array.isArray(event)) ||
            result.candidates.some((candidate) => !candidate || typeof candidate !== "object" || Array.isArray(candidate))) {
          throw new Error("Invalid understandArticle result: expected disposition, events and candidates.");
        }
        entry.status = "ok";
        candidates.push(...result.candidates);
      } catch (error) {
        Object.assign(entry, { status: "error", error: errorInfo("understanding", error) });
      }
    }
  }

  const failed = errors.length > 0 || results.some((entry) => entry.status === "error");
  const analysis = { status: failed ? "failed" : "completed", results, errors };
  const outputs = [
    ["sources.json", JSON.stringify({ articles: sources }, null, 2) + "\n"],
    ["analysis.json", JSON.stringify(analysis, null, 2) + "\n"],
    ["candidates.json", JSON.stringify(candidates, null, 2) + "\n"],
    ["review.md", reviewMarkdown(results, errors, candidates.length)],
  ];
  await fs.mkdir(directory, { recursive: true });
  for (const [name, content] of outputs) await fs.writeFile(path.join(directory, name), content);
  console.log(`${failed ? "解析未完成；已解析部分尚待原文複核" : "解析完成，尚待原文複核"}: ${results.length} article(s), ${candidates.length} candidate(s). Reports: ${directory}`);
  if (failed) {
    for (const error of errors) console.error(`${error.stage}: ${error.message}`);
    for (const entry of results.filter((item) => item.status === "error")) console.error(`${entry.article.url || "Unknown article"}: ${entry.error.message}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
