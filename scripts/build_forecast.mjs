import fs from "node:fs/promises";
import path from "node:path";

const dataDir = path.resolve("public/data");
const cities = [
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
];

function addMonth(month, delta) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthsBetween(fromMonth, toMonth) {
  const [fromYear, fromNum] = fromMonth.split("-").map(Number);
  const [toYear, toNum] = toMonth.split("-").map(Number);
  return (toYear - fromYear) * 12 + (toNum - fromNum);
}

function normalize(value, max) {
  if (!max) return 0;
  return value / max;
}

function level(score) {
  if (score >= 68) return "high";
  if (score >= 38) return "medium";
  return "low";
}

function nextCalendarMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 2).padStart(2, "0")}`;
}

const [incidents, suspects] = await Promise.all([
  fs.readFile(path.join(dataDir, "incidents.json"), "utf8").then(JSON.parse),
  fs.readFile(path.join(dataDir, "drug_suspects_monthly.json"), "utf8").then(JSON.parse),
]);

const targetMonth = nextCalendarMonth();
const latestSuspectMonth = suspects.reduce((latest, row) => (row.month > latest ? row.month : latest), "0000-00");
const suspectMonths = [latestSuspectMonth, addMonth(latestSuspectMonth, -1), addMonth(latestSuspectMonth, -2)];
const previousSuspectMonths = [addMonth(latestSuspectMonth, -3), addMonth(latestSuspectMonth, -4), addMonth(latestSuspectMonth, -5)];
const incidentLatestMonth = incidents.reduce((latest, item) => {
  const month = item.publishedAt.slice(0, 7);
  return month > latest ? month : latest;
}, "0000-00");

const suspectAverage = new Map();
const suspectTrend = new Map();
const incidentPressure = new Map();
const injuryPressure = new Map();

for (const city of cities) {
  const recent = suspects
    .filter((row) => row.city === city && suspectMonths.includes(row.month))
    .map((row) => row.suspects);
  const previous = suspects
    .filter((row) => row.city === city && previousSuspectMonths.includes(row.month))
    .map((row) => row.suspects);

  const recentAverage = recent.length ? recent.reduce((sum, value) => sum + value, 0) / recent.length : 0;
  const previousAverage = previous.length ? previous.reduce((sum, value) => sum + value, 0) / previous.length : 0;

  suspectAverage.set(city, recentAverage);
  suspectTrend.set(city, Math.max(0, recentAverage - previousAverage));
  incidentPressure.set(city, 0);
  injuryPressure.set(city, 0);
}

for (const incident of incidents) {
  if (!incidentPressure.has(incident.city)) continue;
  const incidentMonth = incident.publishedAt.slice(0, 7);
  const recency = Math.max(0.2, 1 - monthsBetween(incidentMonth, incidentLatestMonth) * 0.06);
  incidentPressure.set(
    incident.city,
    incidentPressure.get(incident.city) + (incident.deaths * 2.4 + incident.injuries * 0.75) * recency,
  );
  injuryPressure.set(incident.city, injuryPressure.get(incident.city) + incident.injuries * recency);
}

const maxSuspects = Math.max(...suspectAverage.values());
const maxTrend = Math.max(...suspectTrend.values());
const maxIncident = Math.max(...incidentPressure.values());
const maxInjury = Math.max(...injuryPressure.values());

const forecastCities = cities
  .map((city) => {
    const incidentScore = normalize(incidentPressure.get(city), maxIncident);
    const injuryScore = normalize(injuryPressure.get(city), maxInjury);
    const suspectScore = normalize(suspectAverage.get(city), maxSuspects);
    const trendScore = normalize(suspectTrend.get(city), maxTrend);
    const deathRiskScore = Math.round((incidentScore * 0.52 + suspectScore * 0.32 + trendScore * 0.16) * 100);
    const injuryRiskScore = Math.round((injuryScore * 0.5 + suspectScore * 0.34 + trendScore * 0.16) * 100);
    const combined = Math.round(deathRiskScore * 0.58 + injuryRiskScore * 0.42);
    const factors = [];

    if (incidentScore > 0.45) factors.push("近期死傷事件");
    if (suspectScore > 0.65) factors.push("嫌疑犯人數高");
    if (trendScore > 0.35) factors.push("近月上升");
    if (!factors.length) factors.push("相對低量");

    return {
      city,
      deathRiskScore,
      injuryRiskScore,
      combinedRiskScore: combined,
      level: level(combined),
      factors,
    };
  })
  .sort((a, b) => b.combinedRiskScore - a.combinedRiskScore);

await fs.writeFile(
  path.join(dataDir, "forecast.json"),
  JSON.stringify(
    {
      targetMonth,
      model: "transparent-risk-index-v1",
      note: "風險指標依近期新聞死傷、縣市毒品嫌疑犯人數相對水位與近月趨勢計算，不代表精準事故機率。",
      cities: forecastCities,
    },
    null,
    2,
  ) + "\n",
);

console.log(`Wrote ${forecastCities.length} forecast rows for ${targetMonth}`);
