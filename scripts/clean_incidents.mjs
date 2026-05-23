import fs from "node:fs/promises";
import path from "node:path";

const inputPath = path.resolve("public/data/incidents.json");
const backupPath = path.resolve("public/data/incidents.raw.2026-05-24.json");
const reportPath = path.resolve("public/data/incidents.clean_report.json");

const hardExcludePattern =
  /自由日日|Shoot|專題|一覽|統計|平均|全國|擴大取締|交通大執法|大執法|取締|查緝|查獲\d+件|查獲|快篩|唾液|修法|政策|警政署|法務部|交通部|市警局|縣警局|議員|市府|連署|零容忍|宣戰|預防性|資料庫|近期|1週|9個月|19天|去年|今年|首季|頭號交通威脅|大本營|網轟|網友|成果|訓練備戰|利器|問題|關鍵|警推|強力/;
const eventWordPattern = /撞|衝|輾|肇事|車禍|失控|逆向|闖紅燈|追撞|連環撞|撞死|受傷|重傷|不治|死亡|身亡|喪命|死|傷/;
const titleCasualtyPattern =
  /(\d+|一|二|兩|三|四|五|六|七|八|九|十)(死|傷|命)|撞死|撞傷|輾斃|奪命|害命|重傷|不治|死亡|身亡|喪命|受傷|釀\d*死|釀\d*傷/;
const legalFollowupPattern =
  /判刑|判決|起訴|求刑|延押|裁定|國民法官|法官|檢方|檢察官|聲押|羈押|收押|家屬|夫心碎|發聲|告別式|最後身影|畫面曝光|監視器|還原|獨家|道歉|藥頭|上游|曝|曝光/;
const courtFollowupPattern =
  /判刑|判決|起訴|求刑|延押|裁定|國民法官|法官|檢方|檢察官|高院|一審|二審|定讞|上訴|重判|輕判|撤銷|發回|徒刑|入獄|殺人罪|殺人未遂|判\d|判處|判.*年/;
const weakReportPattern =
  /家屬|夫心碎|發聲|告別式|最後身影|畫面曝光|監視器|還原|獨家|道歉|網轟|網友|拒絕|救人第一|首日查獲|又見毒駕|收押|羈押|聲押|禁見|落網|呼籲|激動落淚|藏洋蔥|浴血歸來/;
const ruledOutDrugDrivingPattern = /驗無.*毒駕|無酒駕毒駕|無.*酒駕.*毒駕|未.*毒駕|排除毒駕/;
const eventTokenPattern =
  /BMW|賓士|保時捷|聯結車|砂石車|小貨車|貨車|轎車|機車|公車|計程車|康橋|彰化|彰南路|鹿港|買菜嬤|三寶媽|女教師|茶行|八里|倒垃圾|警所長|義消|虎林國中|工程車|新婚妻|父女|火鍋店|竹市|新竹|基隆|高雄|桃園|台中|台南|新北|國道|拒檢|闖紅燈|逆向|連環撞|追撞/g;
const stopTerms = [
  "毒駕",
  "駕駛",
  "男子",
  "警方",
  "毒品",
  "車禍",
  "肇事",
  "造成",
  "受傷",
  "死亡",
  "不治",
  "撞死",
  "送醫",
  "快篩",
  "喪屍",
  "煙彈",
  "疑似",
  "新聞",
  "自由",
  "時報",
  "社會",
  "今天",
  "昨天",
  "表示",
  "指出",
];

function dateValue(dateText) {
  return Math.floor(new Date(`${dateText}T00:00:00Z`).getTime() / 86400000);
}

function normalizeText(value) {
  let text = value
    .replace(/[A-Za-z]+/g, (match) => match.toUpperCase())
    .replace(/[^\p{Script=Han}A-Z0-9]+/gu, "");
  for (const term of stopTerms) text = text.replaceAll(term, "");
  return text;
}

function shingles(item) {
  const text = normalizeText(`${item.title}${item.summary || ""}`);
  const tokens = new Set();
  for (let size = 2; size <= 4; size += 1) {
    for (let index = 0; index <= text.length - size; index += 1) {
      tokens.add(text.slice(index, index + size));
    }
  }
  return tokens;
}

function similarity(a, b) {
  const aTokens = a._tokens;
  const bTokens = b._tokens;
  let overlap = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) overlap += 1;
  }
  const union = aTokens.size + bTokens.size - overlap;
  return { overlap, ratio: union ? overlap / union : 0 };
}

function eventTokens(item) {
  const text = `${item.title} ${item.summary || ""}`.toUpperCase();
  return new Set([...text.matchAll(eventTokenPattern)].map(([token]) => token));
}

function sharedEventToken(a, b) {
  for (const token of a._eventTokens) {
    if (b._eventTokens.has(token)) return true;
  }
  return false;
}

function isNonEvent(item) {
  const text = `${item.title} ${item.summary || ""}`;
  const titleHasEvent = eventWordPattern.test(item.title);
  const titleHasCasualty = titleCasualtyPattern.test(item.title);
  if (ruledOutDrugDrivingPattern.test(item.title)) return true;
  if (/近期|去年|今年|1週|9個月|19天|統計|平均|一覽|專題|自由日日|Shoot/.test(item.title)) return true;
  if (courtFollowupPattern.test(item.title)) return true;
  if (weakReportPattern.test(item.title)) return true;
  if (hardExcludePattern.test(item.title) && !titleHasCasualty) return true;
  if (legalFollowupPattern.test(item.title) && !titleHasEvent) return true;
  if (!titleHasCasualty && item.deaths + item.injuries > 0 && !titleHasEvent) return true;
  if (!titleHasCasualty && hardExcludePattern.test(text) && !titleHasEvent) return true;
  return false;
}

function scoreCanonical(item) {
  const text = `${item.title} ${item.summary || ""}`;
  let score = 0;
  score += item.deaths * 6 + item.injuries * 2;
  if (eventWordPattern.test(item.title)) score += 12;
  if (/撞死|不治|身亡|喪命/.test(item.title)) score += 8;
  if (/地名|路口|闖紅燈|逆向|追撞|連環撞|失控|拒檢/.test(text)) score += 4;
  if (legalFollowupPattern.test(item.title)) score -= 7;
  if (hardExcludePattern.test(item.title)) score -= 12;
  return score;
}

function shouldCluster(a, b) {
  if (a.city !== b.city) return false;
  const dayDistance = Math.abs(a._day - b._day);
  if (dayDistance > 4) return false;
  const { overlap, ratio } = similarity(a, b);
  const sameCasualty = a.deaths === b.deaths && a.injuries === b.injuries;
  const similarCasualty = a.deaths > 0 && b.deaths > 0 && Math.abs(a.deaths - b.deaths) <= 1;
  if ((sameCasualty || similarCasualty) && sharedEventToken(a, b)) return true;
  if ((sameCasualty || similarCasualty) && ratio >= 0.08 && overlap >= 10) return true;
  if (dayDistance <= 1 && sameCasualty && overlap >= 6) return true;
  return false;
}

function clean(items) {
  const removedAsNonEvent = [];
  const candidates = items
    .filter((item) => {
      if (isNonEvent(item)) {
        removedAsNonEvent.push(item);
        return false;
      }
      return true;
    })
    .map((item) => ({
      ...item,
      _day: dateValue(item.publishedAt),
      _tokens: shingles(item),
      _eventTokens: eventTokens(item),
    }))
    .sort((a, b) => a.publishedAt.localeCompare(b.publishedAt) || a.city.localeCompare(b.city));

  const clusters = [];
  for (const item of candidates) {
    const cluster = clusters.find((group) => group.some((member) => shouldCluster(item, member)));
    if (cluster) cluster.push(item);
    else clusters.push([item]);
  }

  const deduped = [];
  const mergedClusters = [];

  for (const cluster of clusters) {
    const sorted = [...cluster].sort((a, b) => scoreCanonical(b) - scoreCanonical(a));
    const canonical = sorted[0];
    const merged = {
      ...canonical,
      deaths: Math.max(...cluster.map((item) => item.deaths)),
      injuries: Math.max(...cluster.map((item) => item.injuries)),
      relatedReports: cluster
        .filter((item) => item.url !== canonical.url)
        .map((item) => ({
          title: item.title,
          url: item.url,
          publishedAt: item.publishedAt,
          deaths: item.deaths,
          injuries: item.injuries,
        })),
    };
    delete merged._day;
    delete merged._tokens;
    delete merged._eventTokens;
    if (!merged.relatedReports.length) delete merged.relatedReports;
    deduped.push(merged);

    if (cluster.length > 1) {
      mergedClusters.push({
        kept: canonical.title,
        city: canonical.city,
        publishedAt: canonical.publishedAt,
        count: cluster.length,
        merged: cluster.filter((item) => item.url !== canonical.url).map((item) => item.title),
      });
    }
  }

  deduped.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  return { deduped, removedAsNonEvent, mergedClusters };
}

const currentText = await fs.readFile(inputPath, "utf8");
const currentItems = JSON.parse(currentText);
let original = currentItems;
let sourcePath = inputPath;

try {
  const backupText = await fs.readFile(backupPath, "utf8");
  const backupItems = JSON.parse(backupText);
  const currentLooksCleaned =
    currentItems.length < backupItems.length || currentItems.some((item) => item.relatedReports);

  if (currentLooksCleaned) {
    original = backupItems;
    sourcePath = backupPath;
    console.log(`Using existing raw backup as source: ${backupPath}`);
  } else if (currentText !== backupText) {
    const stampedBackupPath = backupPath.replace(
      /\.json$/,
      `.${new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14)}.json`,
    );
    await fs.copyFile(inputPath, stampedBackupPath);
    console.log(`Backed up refreshed raw incidents to ${stampedBackupPath}`);
  } else {
    console.log(`Current incidents already match raw backup: ${backupPath}`);
  }
} catch {
  await fs.copyFile(inputPath, backupPath);
  console.log(`Backed up original incidents to ${backupPath}`);
}

const { deduped, removedAsNonEvent, mergedClusters } = clean(original);
await fs.writeFile(inputPath, JSON.stringify(deduped, null, 2) + "\n");
await fs.writeFile(
  reportPath,
  JSON.stringify(
    {
      before: original.length,
      after: deduped.length,
      sourcePath,
      removedAsNonEvent: removedAsNonEvent.length,
      mergedClusters: mergedClusters.length,
      removedTitles: removedAsNonEvent.map((item) => ({
        title: item.title,
        city: item.city,
        publishedAt: item.publishedAt,
        url: item.url,
      })),
      clusters: mergedClusters,
    },
    null,
    2,
  ) + "\n",
);

console.log(
  JSON.stringify(
    {
      before: original.length,
      after: deduped.length,
      sourcePath,
      removedAsNonEvent: removedAsNonEvent.length,
      mergedClusters: mergedClusters.length,
      backupPath,
      reportPath,
    },
    null,
    2,
  ),
);
