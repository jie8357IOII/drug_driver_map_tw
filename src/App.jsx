import taiwanMap from "@svg-maps/taiwan";
import React, { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

const cityNameByMapId = {
  "changhua-county": "彰化縣",
  "chiayi-city": "嘉義市",
  "chiayi-county": "嘉義縣",
  "hualien-county": "花蓮縣",
  "hsinchu-city": "新竹市",
  "hsinchu-county": "新竹縣",
  "kaohsiung-city": "高雄市",
  "keelung-city": "基隆市",
  "kinmen-county": "金門縣",
  "lienchiang-county": "連江縣",
  "miaoli-county": "苗栗縣",
  "nantou-county": "南投縣",
  "new-taipei-city": "新北市",
  "penghu-county": "澎湖縣",
  "pingtung-county": "屏東縣",
  "taichung-city": "臺中市",
  "tainan-city": "臺南市",
  "taipei-city": "臺北市",
  "taitung-county": "臺東縣",
  "taoyuan-city": "桃園市",
  "yilan-county": "宜蘭縣",
  "yunlin-county": "雲林縣",
};

const cityShortNames = {
  基隆市: "基隆",
  臺北市: "北市",
  新北市: "新北",
  桃園市: "桃園",
  新竹縣: "竹縣",
  新竹市: "竹市",
  苗栗縣: "苗栗",
  臺中市: "台中",
  彰化縣: "彰化",
  南投縣: "南投",
  雲林縣: "雲林",
  嘉義縣: "嘉縣",
  嘉義市: "嘉市",
  臺南市: "台南",
  高雄市: "高雄",
  屏東縣: "屏東",
  宜蘭縣: "宜蘭",
  花蓮縣: "花蓮",
  臺東縣: "台東",
  澎湖縣: "澎湖",
  金門縣: "金門",
  連江縣: "連江",
};

const cities = Object.values(cityNameByMapId);
const mapLocations = taiwanMap.locations.map((location) => ({
  ...location,
  city: cityNameByMapId[location.id],
}));

const offshoreCities = new Set(["澎湖縣", "金門縣", "連江縣"]);

function getSvgMapBounds(locations, padding = 96) {
  const points = [];

  locations.forEach((location) => {
    const numbers = String(location.path).match(/-?\d+(?:\.\d+)?/g)?.map(Number) || [];

    for (let index = 0; index < numbers.length - 1; index += 2) {
      points.push({
        x: numbers[index],
        y: numbers[index + 1],
      });
    }
  });

  if (!points.length && taiwanMap.viewBox) {
    const fallback = String(taiwanMap.viewBox).split(/\s+/).map(Number);
    if (fallback.length === 4 && fallback.every(Number.isFinite)) return fallback;
  }

  if (!points.length) return [0, 0, 1000, 1200];

  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));

  return [
    minX - padding,
    minY - padding,
    maxX - minX + padding * 2,
    maxY - minY + padding * 2,
  ];
}

const mainlandMapLocations = mapLocations.filter((location) => !offshoreCities.has(location.city));
// 初始地圖固定聚焦完整本島，保留足夠 padding，避免本島被裁切或放太大。
const defaultMapBounds = getSvgMapBounds(mainlandMapLocations, 132);
const iconMap = { death: "☠️", injury: "🩼", event: "件" };
const newsKindLabels = { incident: "事件", policy: "政策", judicial: "判決／司法", statistics: "統計", other: "其他" };

function toMonthLabel(month) {
  const [year, monthNum] = month.split("-");
  return `${year}/${monthNum}`;
}

function toShortMonthLabel(month) {
  const [year, monthNum] = month.split("-");
  return `${year.slice(2)}/${monthNum}`;
}

function formatDate(dateText) {
  if (!dateText) return "";
  return dateText.replaceAll("-", "/");
}

const statusTimeFormatter = new Intl.DateTimeFormat("zh-TW", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function formatStatusTime(timestamp) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? "" : `${statusTimeFormatter.format(date)}（台北時間）`;
}

function isStatsIncident(incident) {
  const quality = incident.dataQuality || {};
  if (quality.includeInStats !== true) return false;
  if (quality.verificationStatus === "machine_checked") return quality.eventCountValid === true;
  if (quality.verificationStatus === "manual_checked") return quality.eventCountValid !== false;
  if (quality.verificationStatus) return false;
  // Compatibility for unmigrated records; explicit legacy rows remain excluded.
  const review = quality.needsHumanReview === true || incident.needsHumanReview === true;
  return !review && (quality.needsHumanReview === false || incident.needsHumanReview === false);
}

function hasPendingFields(incident) {
  return incident.dataQuality?.needsHumanReview === true || incident.needsHumanReview === true ||
    ["deaths", "injuries"].some((field) => ["unknown", "conflict"].includes(incident.dataQuality?.fieldStatus?.[field]));
}

function isLegacyIncident(incident) {
  return !incident.dataQuality?.verificationStatus || incident.dataQuality.verificationStatus === "legacy";
}

function isMapIncident(incident) {
  return isStatsIncident(incident) && cities.includes(incident.city) &&
    (incident.dataQuality?.mapEligible === true ||
      (isLegacyIncident(incident) && incident.dataQuality?.mapEligible !== false));
}

function impairmentTypes(item, legacy = false) {
  return Array.isArray(item.impairmentTypes) ? item.impairmentTypes : legacy ? ["drug"] : [];
}

function impairmentLabel(item, legacy = false) {
  const types = impairmentTypes(item, legacy);
  const labels = types.map((type) => ({ alcohol: "酒駕", drug: "毒駕" })[type]).filter(Boolean);
  return labels.length ? labels.join("＋") : "類別待釐清";
}

function matchesImpairment(item, filter, legacy = false) {
  const types = impairmentTypes(item, legacy);
  return filter === "all" || (filter === "both" ? types.includes("alcohol") && types.includes("drug") : types.includes(filter));
}

function uniqueIncidents(items) {
  return [...new Map(items.map((item, index) => [item.id || `unidentified-${index}`, item])).values()];
}

function casualtyValue(incident, field) {
  const status = incident.dataQuality?.fieldStatus?.[field];
  // In records, a conflict retains the previous checked value; no retained value is null.
  if (!["checked", "conflict"].includes(status) && (status !== undefined || !isLegacyIncident(incident))) return null;
  const value = incident[field];
  return Number.isInteger(value) && value >= 0 ? value : null;
}

function casualtyText(incident, field) {
  const value = casualtyValue(incident, field);
  if (incident.dataQuality?.fieldStatus?.[field] === "conflict") {
    return value === null ? "未明（衝突待釐清，無既有核對值）" : `${value}（沿用既有核對值，新報數值待釐清）`;
  }
  return value ?? "未明";
}

function incidentTotals(incidents) {
  return uniqueIncidents(incidents).reduce((totals, incident) => {
    totals.events += 1;
    for (const field of ["deaths", "injuries"]) {
      const value = casualtyValue(incident, field);
      if (value === null) totals[`${field}Missing`] += 1;
      else {
        totals[field] += value;
        if (incident.dataQuality?.fieldStatus?.[field] === "conflict") totals[`${field}Retained`] += 1;
      }
    }
    return totals;
  }, { events: 0, deaths: 0, injuries: 0, deathsMissing: 0, injuriesMissing: 0, deathsRetained: 0, injuriesRetained: 0 });
}

function casualtyCoverage(totals, field) {
  const retained = totals[`${field}Retained`];
  return `${totals[`${field}Missing`]} 件未明${retained ? `；${retained} 件衝突沿用既有核對值` : ""}`;
}

function casualtySummary(totals) {
  return `已知死亡 ${totals.deaths}（${casualtyCoverage(totals, "deaths")}）／受傷 ${totals.injuries}（${casualtyCoverage(totals, "injuries")}）`;
}

function articleFeed(articles, incidents) {
  const byUrl = new Map();
  for (const incident of incidents) {
    for (const report of [incident, ...(incident.relatedReports || [])]) {
      if (!report.url) continue;
      const previous = byUrl.get(report.url);
      byUrl.set(report.url, {
        id: report.url, title: report.title || incident.title, url: report.url,
        source: report.source || incident.source, publishedAt: report.publishedAt || incident.publishedAt,
        kind: "incident", status: "needs_clarification", legacy: isLegacyIncident(incident),
        impairmentTypes: [...new Set([...(previous?.impairmentTypes || []), ...impairmentTypes(incident, isLegacyIncident(incident))])],
        eventIds: [...new Set([...(previous?.eventIds || []), incident.id])], city: incident.city, issues: [],
      });
    }
  }
  for (const article of articles) {
    const archivedEventIds = byUrl.get(article.url)?.eventIds || [];
    byUrl.set(article.url || article.id, { ...article, legacy: false, archivedEventIds });
  }
  return [...byUrl.values()].sort((a, b) => String(b.publishedAt || "").localeCompare(String(a.publishedAt || "")));
}

function qualityLabel(incident) {
  if (isLegacyIncident(incident)) return isStatsIncident(incident) ? "歷史資料（舊口徑）" : "歷史待核對";
  const status = incident.dataQuality?.verificationStatus;
  const label = status === "manual_checked" ? "人工核對" : status === "machine_checked" ? "機器規則核對" : "待釐清";
  if (!isStatsIncident(incident)) return `${label}・排除統計`;
  return hasPendingFields(incident) ? `${label}・事件可計數，部分欄位待釐清` : label;
}

function qualityTone(incident) {
  if (hasPendingFields(incident)) return "review";
  return isStatsIncident(incident) ? (isLegacyIncident(incident) ? "corrected" : "ok") : "review";
}

function countValues(items, selector, limit = 8) {
  const counter = new Map();

  items.forEach((item) => {
    const values = selector(item);
    const list = Array.isArray(values) ? values : values ? [values] : [];

    list.filter(Boolean).forEach((value) => {
      counter.set(value, (counter.get(value) || 0) + 1);
    });
  });

  return [...counter.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, "zh-Hant"))
    .slice(0, limit);
}


function driverAgeLabel(ageGroup) {
  switch (ageGroup) {
    case "under_18":
      return "18歲以下";
    case "18-24":
      return "18–24";
    case "25-34":
      return "25–34";
    case "35-44":
      return "35–44";
    case "45-54":
      return "45–54";
    case "55-64":
      return "55–64";
    case "65+":
      return "65歲以上";
    default:
      return "年齡未明";
  }
}

function driverGenderLabel(gender) {
  if (gender === "male") return "男性";
  if (gender === "female") return "女性";
  return "性別未明";
}

function levelLabel(level) {
  if (level === "high") return "高";
  if (level === "medium") return "中";
  return "低";
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clampMapPan(zoom, pan, bounds = defaultMapBounds) {
  const [, , width, height] = bounds;
  const nextWidth = width / zoom;
  const nextHeight = height / zoom;
  const maxPanX = Math.max(0, (width - nextWidth) / 2);
  const maxPanY = Math.max(0, (height - nextHeight) / 2);

  return {
    x: clampNumber(pan.x, -maxPanX, maxPanX),
    y: clampNumber(pan.y, -maxPanY, maxPanY),
  };
}

function zoomedViewBox(zoom, pan = { x: 0, y: 0 }, bounds = defaultMapBounds) {
  const [x, y, width, height] = bounds;
  const nextWidth = width / zoom;
  const nextHeight = height / zoom;
  const clampedPan = clampMapPan(zoom, pan, bounds);

  return `${x + (width - nextWidth) / 2 + clampedPan.x} ${y + (height - nextHeight) / 2 + clampedPan.y} ${nextWidth} ${nextHeight}`;
}

async function loadJson(filePath, fallback, optional = false) {
  try {
    const response = await fetch(filePath, { cache: "no-store" });
    if (optional && response.status === 404) return fallback;
    if (!response.ok) throw new Error(`${filePath} ${response.status}`);
    return await response.json();
  } catch (error) {
    console.warn(error);
    return fallback;
  }
}

function useDashboardData() {
  const [data, setData] = useState({ incidents: [], suspects: [], articles: [], newsStatus: null, newsBuild: null, loading: true });

  useEffect(() => {
    let alive = true;
    const baseUrl = import.meta.env.BASE_URL;

    // Pages caches stable data URLs across deployments. Read the current build
    // first, then give every news file the same snapshot-specific cache key.
    loadJson(`${baseUrl}news-build.json?check=${Date.now()}`, null, true).then(async (newsBuild) => {
      const version = encodeURIComponent(newsBuild?.snapshotId || Date.now());
      const [incidents, suspects, news, newsStatus] = await Promise.all([
        loadJson(`${baseUrl}data/incidents.json?v=${version}`, []),
        loadJson(`${baseUrl}data/drug_suspects_monthly.json`, []),
        loadJson(`${baseUrl}data/news.json?v=${version}`, null),
        loadJson(`${baseUrl}data/news-status.json?v=${version}`, null),
      ]);
      if (alive) setData({
        incidents: uniqueIncidents(Array.isArray(incidents) ? incidents : []),
        suspects: Array.isArray(suspects) ? suspects : [],
        articles: Array.isArray(news?.articles) ? news.articles : [], newsStatus, newsBuild, loading: false,
      });
    });

    return () => {
      alive = false;
    };
  }, []);

  return data;
}

function Metric({ label, value, tone, helper }) {
  return (
    <article className={`metric-card ${tone || ""}`}>
      <i className="metric-glow" aria-hidden="true" />
      <span>{label}</span>
      <strong>{value}</strong>
      {helper ? <small>{helper}</small> : null}
    </article>
  );
}

function LatestIncidentMetric({ incident }) {
  return (
    <article className="metric-card latest-incident-card accent">
      <i className="metric-glow" aria-hidden="true" />
      <span>最近刊登的統計事件</span>
      <strong>
        {incident ? incident.city || "縣市未明" : "無資料"}
      </strong>
      {incident ? (
        <a href={incident.url} target="_blank" rel="noreferrer" title={incident.title}>
          {incident.title}
        </a>
      ) : (
        <small>目前沒有符合篩選條件的事故</small>
      )}
      {incident ? <small>發生：{formatDate(incident.occurredAt) || "未明"}｜發布：{formatDate(incident.publishedAt) || "未明"}</small> : null}
    </article>
  );
}

function buildCityRanking(incidents) {
  return cities
    .map((city) => {
      const cityIncidents = incidents.filter((incident) => incident.city === city);
      const totals = incidentTotals(cityIncidents);
      const score = totals.events;

      return {
        city,
        ...totals,
        score,
      };
    })
    .sort((a, b) => b.score - a.score || b.deaths - a.deaths || b.injuries - a.injuries);
}

function rankingLevel(item, index) {
  if (item.score <= 0) return "low";
  if (index < 3) return "high";
  if (index < 8) return "medium";
  return "low";
}

function IncidentHoverCard({ incident, position }) {
  return (
    <div
      className="incident-hover-card"
      style={{
        left: `${Math.min(position.x + 18, 620)}px`,
        top: `${Math.max(position.y - 18, 16)}px`,
      }}
    >
      <div className="hover-meta">
        <span>{incident.city}</span>
        <span>發布 {formatDate(incident.publishedAt)}</span>
        <span>{incident.source}</span>
      </div>
      <h3>{incident.title}</h3>
      <p className="hover-stats">
        此事件：死亡 {casualtyText(incident, "deaths")}｜受傷 {casualtyText(incident, "injuries")}
      </p>
      <p>發生日期：{formatDate(incident.occurredAt) || "未明"}</p>
      <QualityBadge incident={incident} />
      <small>標記為縣市彙總，並非事故座標；此處列最近刊登的事件。點擊可篩選縣市。</small>
    </div>
  );
}

function CityIncidentBadge({ type, count, x, y, incident, onHover, onMove, onLeave, onSelectCity }) {
  const icon = iconMap[type];
  const label = type === "event" ? "事件" : type === "death" ? "已知死亡" : "已知受傷";
  const width = count >= 100 ? 82 : count >= 10 ? 72 : 62;
  const severity = count >= 10 ? "major" : count >= 3 ? "medium" : "minor";

  return (
    <g
      className={`city-incident-badge badge-${type} badge-${severity}`}
      tabIndex="0"
      role="button"
      aria-label={`${incident.city}彙總${label}${count}${type === "event" ? "件" : "人"}`}
      transform={`translate(${x} ${y})`}
      onClick={() => onSelectCity(incident.city)}
      onMouseEnter={(event) => onHover(event, incident)}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelectCity(incident.city);
        }
      }}
    >
      <rect x={-width / 2} y="-18" width={width} height="34" rx="17" />
      <text x="0" y="5" textAnchor="middle">
        {type === "event" ? `${count} 件` : `${icon}×${count}`}
      </text>
    </g>
  );
}

function TaiwanMap({ incidents, visibleTypes, selectedCity, cityLevels, onSelectCity }) {
  const svgRef = useRef(null);
  const panelRef = useRef(null);
  const dragStateRef = useRef(null);
  const wasDraggingRef = useRef(false);
  const [cityPositions, setCityPositions] = useState({});
  const [hoverIncident, setHoverIncident] = useState(null);
  const [hoverPosition, setHoverPosition] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  const mapBounds = useMemo(() => offshoreCities.has(selectedCity)
    ? getSvgMapBounds(mapLocations.filter((location) => location.city === selectedCity), 40)
    : defaultMapBounds, [selectedCity]);

  useEffect(() => {
    const nextPositions = {};

    svgRef.current?.querySelectorAll(".county-shape").forEach((element) => {
      const city = element.dataset.city;
      const box = element.getBBox();
      nextPositions[city] = {
        x: box.x + box.width / 2,
        y: box.y + box.height / 2,
        short: cityShortNames[city] || city,
      };
    });

    setCityPositions(nextPositions);
  }, []);

  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [mapBounds]);

  useEffect(() => {
    if (zoom === 1) {
      setPan({ x: 0, y: 0 });
      return;
    }

    setPan((current) => clampMapPan(zoom, current, mapBounds));
  }, [zoom, mapBounds]);

  const viewBox = useMemo(() => zoomedViewBox(zoom, pan, mapBounds), [zoom, pan, mapBounds]);

  const cityBadges = useMemo(() => {
    const grouped = new Map();

    incidents.forEach((incident) => {
      const current = grouped.get(incident.city) || {
        city: incident.city,
        deaths: 0,
        injuries: 0,
        events: [],
        latestIncident: incident,
      };

      current.deaths += casualtyValue(incident, "deaths") ?? 0;
      current.injuries += casualtyValue(incident, "injuries") ?? 0;
      current.events.push(incident);

      if (
        !current.latestIncident?.publishedAt ||
        incident.publishedAt > current.latestIncident.publishedAt
      ) {
        current.latestIncident = incident;
      }

      grouped.set(incident.city, current);
    });

    return [...grouped.values()]
      .map((item) => {
        const position = cityPositions[item.city];
        if (!position) return null;

        return {
          ...item,
          x: position.x,
          y: position.y,
        };
      })
      .filter(Boolean);
  }, [cityPositions, incidents]);

  const updateHoverPosition = (event) => {
    const rect = panelRef.current?.getBoundingClientRect();
    setHoverPosition({
      x: rect ? event.clientX - rect.left : 0,
      y: rect ? event.clientY - rect.top : 0,
    });
  };

  const handleSelectCity = (city) => {
    if (wasDraggingRef.current) return;
    onSelectCity(city);
  };

  const handleBadgeHover = (event, incident) => {
    setHoverIncident(incident);
    updateHoverPosition(event);
  };

  const handlePointerDown = (event) => {
    if (zoom <= 1) return;
    if (event.button !== undefined && event.button !== 0) return;

    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;

    const [, , viewWidth, viewHeight] = viewBox.split(" ").map(Number);

    dragStateRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPan: pan,
      viewWidth,
      viewHeight,
      rectWidth: rect.width,
      rectHeight: rect.height,
      moved: false,
    };

    setIsDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event) => {
    const dragState = dragStateRef.current;
    if (!dragState) return;

    const deltaX = event.clientX - dragState.startClientX;
    const deltaY = event.clientY - dragState.startClientY;

    if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
      dragState.moved = true;
      wasDraggingRef.current = true;
    }

    const nextPan = {
      x: dragState.startPan.x - deltaX * (dragState.viewWidth / dragState.rectWidth),
      y: dragState.startPan.y - deltaY * (dragState.viewHeight / dragState.rectHeight),
    };

    setPan(clampMapPan(zoom, nextPan, mapBounds));
    event.preventDefault();
  };

  const endPointerDrag = (event) => {
    const dragState = dragStateRef.current;
    if (!dragState) return;

    wasDraggingRef.current = Boolean(dragState.moved);
    dragStateRef.current = null;
    setIsDragging(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);

    window.setTimeout(() => {
      wasDraggingRef.current = false;
    }, 0);
  };

  return (
    <section className="map-panel panel-pop" ref={panelRef}>
      <div className="map-toolbar">
        <div>
          <span>互動地圖</span>
          <h2>{selectedCity || "全台縣市"}</h2>
          <p className="map-aggregation-note">縣市彙總，非事故座標；含零死傷與傷亡未明事件。離島可由縣市篩選查看彙總。</p>
        </div>

        <div className="zoom-control-wrap">
          <div className="zoom-controls" aria-label="地圖縮放">
            <button type="button" onClick={() => setZoom((value) => Math.min(2.75, value + 0.25))}>
              +
            </button>
            <button type="button" onClick={() => setZoom((value) => Math.max(1, value - 0.25))}>
              -
            </button>
            <button
              type="button"
              onClick={() => {
                setZoom(1);
                setPan({ x: 0, y: 0 });
              }}
            >
              重設
            </button>
          </div>
          <small className="map-drag-hint">{zoom > 1 ? "拖曳地圖查看細節" : "放大後可拖曳"}</small>
        </div>
      </div>

      <svg
        ref={svgRef}
        className={`taiwan-map ${zoom > 1 ? "is-draggable" : ""} ${isDragging ? "is-dragging" : ""}`}
        viewBox={viewBox}
        role="img"
        aria-label="台灣酒駕與毒駕事件縣市彙總地圖"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endPointerDrag}
        onPointerCancel={endPointerDrag}
        onPointerLeave={endPointerDrag}
      >
        <defs>
          <filter id="badgeShadow" x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="0" dy="8" stdDeviation="6" floodColor="#1f2522" floodOpacity="0.18" />
          </filter>
        </defs>

        <g className="map-layer">
          {mapLocations.map((location) => {
            const risk = cityLevels.get(location.city) || "low";
            return (
              <path
                key={location.id}
                className={`county-shape risk-${risk} ${selectedCity === location.city ? "selected" : ""}`}
                data-city={location.city}
                d={location.path}
                tabIndex="0"
                onClick={() => handleSelectCity(location.city)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") handleSelectCity(location.city);
                }}
                aria-label={`${location.city} 新聞事件數排序${levelLabel(risk)}`}
              />
            );
          })}

          {Object.entries(cityPositions).map(([city, position]) => (
            <text key={city} className="city-label" x={position.x} y={position.y}>
              {position.short}
            </text>
          ))}

          {cityBadges.map((item) => (
            <g key={item.city} className={`city-badge-pair ${selectedCity === item.city ? "selected" : ""}`}>
              <CityIncidentBadge
                type="event"
                count={item.events.length}
                x={item.x + 38}
                y={item.y - 34}
                incident={item.latestIncident}
                onHover={handleBadgeHover}
                onMove={updateHoverPosition}
                onLeave={() => setHoverIncident(null)}
                onSelectCity={handleSelectCity}
              />
              {visibleTypes.deaths && item.deaths > 0 ? (
                <CityIncidentBadge
                  type="death"
                  count={item.deaths}
                  x={item.x - 38}
                  y={item.y - 34}
                  incident={item.latestIncident}
                  onHover={handleBadgeHover}
                  onMove={updateHoverPosition}
                  onLeave={() => setHoverIncident(null)}
                  onSelectCity={handleSelectCity}
                />
              ) : null}

              {visibleTypes.injuries && item.injuries > 0 ? (
                <CityIncidentBadge
                  type="injury"
                  count={item.injuries}
                  x={item.x + 42}
                  y={item.y + 32}
                  incident={item.latestIncident}
                  onHover={handleBadgeHover}
                  onMove={updateHoverPosition}
                  onLeave={() => setHoverIncident(null)}
                  onSelectCity={handleSelectCity}
                />
              ) : null}
            </g>
          ))}
        </g>
      </svg>

      {hoverIncident ? <IncidentHoverCard incident={hoverIncident} position={hoverPosition} /> : null}
    </section>
  );
}

function MiniTrend({ title, rows, valueKey, colorClass }) {
  const width = 340;
  const height = 116;
  const maxValue = Math.max(1, ...rows.map((row) => Number(row[valueKey] || 0)));
  const pathData = rows
    .map((row, index) => {
      const x = 32 + (rows.length <= 1 ? 0 : (index / (rows.length - 1)) * 290);
      const y = 88 - (Number(row[valueKey] || 0) / maxValue) * 64;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <article className="mini-trend">
      <div className="mini-trend-title">
        <span>{title}</span>
        <strong>最高 {maxValue.toLocaleString()}</strong>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
        <line x1="32" y1="88" x2="322" y2="88" className="trend-axis" />
        <path d={pathData} className={`mini-line ${colorClass}`} />
        {rows.map((row, index) => {
          const x = 32 + (rows.length <= 1 ? 0 : (index / (rows.length - 1)) * 290);
          return index % 2 === 0 || index === rows.length - 1 ? (
            <text key={row.month} x={x} y="108" textAnchor="middle" className="mini-x-label">
              {toShortMonthLabel(row.month)}
            </text>
          ) : null;
        })}
      </svg>
    </article>
  );
}

function TrendCard({ city, months, suspects, incidents }) {
  const rows = useMemo(() => {
    const monthList = [...months].sort();
    const casualtyByMonth = new Map();

    incidents
      .filter((incident) => !city || incident.city === city)
      .forEach((incident) => {
        const month = incident.publishedAt.slice(0, 7);
        casualtyByMonth.set(
          month,
          (casualtyByMonth.get(month) || 0) + Number(incident.deaths || 0) + Number(incident.injuries || 0)
        );
      });

    return monthList.map((month) => ({
      month,
      suspects: suspects
        .filter((row) => row.month === month && (!city || row.city === city))
        .reduce((sum, row) => sum + Number(row.suspects || 0), 0),
      casualties: casualtyByMonth.get(month) || 0,
    }));
  }, [city, incidents, months, suspects]);

  const suspectTotal = rows.reduce((sum, row) => sum + row.suspects, 0);
  const casualtyTotal = rows.reduce((sum, row) => sum + row.casualties, 0);

  return (
    <section className="trend-card panel-pop">
      <div className="section-head">
        <span>趨勢摘要</span>
        <h2>{city || "全部縣市"}</h2>
      </div>

      <div className="trend-total">
        <strong>{casualtyTotal}</strong>
        <span>篩選死傷數</span>
        <strong>{suspectTotal.toLocaleString()}</strong>
        <span>毒品嫌疑犯背景數</span>
      </div>

      {rows.length ? (
        <>
          <MiniTrend title="毒品嫌疑犯人數" rows={rows} valueKey="suspects" colorClass="teal" />
          <MiniTrend title="新聞死傷數" rows={rows} valueKey="casualties" colorClass="red" />
        </>
      ) : (
        <div className="empty-panel">尚未選取月份</div>
      )}
    </section>
  );
}

function RankingList({ ranking, selectedCity, onSelectCity }) {
  return (
    <section className="ranking-list">
      <div className="ranking-title">
        <h3>可定位新聞事件數排序</h3>
        <button type="button" onClick={() => onSelectCity("")}>
          全部縣市
        </button>
      </div>

      {ranking.slice(0, 10).map((item, index) => {
        const level = rankingLevel(item, index);

        return (
          <button
            type="button"
            key={item.city}
            className={`ranking-item ${selectedCity === item.city ? "active" : ""}`}
            onClick={() => onSelectCity(item.city)}
          >
            <div>
              <strong>
                {index + 1}. {item.city}
              </strong>
              <span>
                {item.events} 件｜{casualtySummary(item)}
              </span>
            </div>
            <em className={`level-badge ${level}`}>{levelLabel(level)}</em>
          </button>
        );
      })}
    </section>
  );
}


function DataStatusBar({ status, build }) {
  const hasBuild = typeof build?.snapshotId === "string" && typeof build?.codeSha === "string";
  return (
    <section className="data-status-bar publication-status panel-pop" aria-label="資料狀態">
      <div>
        <span>最近檢查</span>
        <strong>{formatStatusTime(status.lastCheckedAt) || "尚無檢查紀錄"}</strong>
      </div>
      <div>
        <span>最近資料變更</span>
        <strong>{formatStatusTime(status.lastChangedAt) || "尚無變更紀錄"}</strong>
      </div>
      <div>
        <span>目前網站版本</span>
        {hasBuild ? <>
          <strong title={build.snapshotId}>資料 {build.snapshotId.slice(0, 12)}</strong>
          <small className="build-code-version" title={build.codeSha}>程式 {build.codeSha.slice(0, 12)}</small>
        </> : <strong>版本資訊尚未提供</strong>}
      </div>
      <p className="publication-coverage">
        來源範圍：{status.sourceCoverage?.join("、") || "未提供"}（非全台所有新聞）｜
        檢查狀態：{status.status === "success" ? "完成" : status.status || "未提供"}｜
        全站待釐清：{Number.isInteger(status.pendingCount) ? `${status.pendingCount} 項` : "未提供"}。
        檢查完成不代表全部判讀正確；機器規則核對與人工核對分開標示。
      </p>
    </section>
  );
}

function coverageDateRange(from, to) {
  if (!from && !to) return "未登錄";
  return `${formatDate(from) || "起日未登錄"} ～ ${formatDate(to) || "迄日未登錄"}`;
}

function OfficialTrafficPanel({ officialTraffic, searches, months, setSelectedMonths }) {
  const [yearChoice, setYearChoice] = useState("");
  const rows = Array.isArray(officialTraffic?.rows) ? officialTraffic.rows : [];
  const years = [...new Set(rows.map((row) => row.year))].sort((a, b) => b - a);
  const selectedYear = years.includes(Number(yearChoice)) ? Number(yearChoice) : years[0];
  const yearRows = rows.filter((row) => row.year === selectedYear);
  const fromMonth = officialTraffic?.fromMonth;
  const toMonth = officialTraffic?.toMonth;
  const hasPeriod = /^\d{4}-\d{2}$/.test(fromMonth || "") && /^\d{4}-\d{2}$/.test(toMonth || "") && fromMonth <= toMonth;
  const comparisonMonths = hasPeriod ? months.filter((month) => month >= fromMonth && month <= toMonth) : [];
  const hasSearchOverlap = hasPeriod && searches.some(({ from, to }) =>
    /^\d{4}-\d{2}-\d{2}$/.test(from || "") && /^\d{4}-\d{2}-\d{2}$/.test(to || "") && from <= to &&
    from.slice(0, 7) <= toMonth && to.slice(0, 7) >= fromMonth
  );
  const caseCount = (value) => Number.isInteger(value) && value >= 0 ? value.toLocaleString("zh-TW") : "未提供";

  return (
    <section className="coverage-official" aria-labelledby="coverage-official-heading">
      <div className="official-traffic-heading">
        <h3 id="coverage-official-heading">官方事故肇因件數｜第一當事者</h3>
        {officialTraffic ? <span className={`quality-badge ${officialTraffic.status === "current" ? "ok" : "review"}`}>
          {officialTraffic.status === "stale" ? "沿用上次資料" : officialTraffic.status === "current" ? "最近更新成功" : "更新狀態未提供"}
        </span> : null}
      </div>
      {!officialTraffic ? <p className="coverage-empty">尚未接入官方酒／毒交通事故肇因資料，尚無可顯示的官方件數與可套用期間。</p> : <>
        {officialTraffic.status === "stale" ? <div className="official-traffic-stale" role="status">
          <strong>本次更新未成功，保留上次取得的官方資料。</strong>
          <p>錯誤：{officialTraffic.error || "未提供錯誤訊息"}</p>
        </div> : null}
        <dl className="official-traffic-metadata">
          <div><dt>來源</dt><dd>{officialTraffic.sourceUrl ? <a href={officialTraffic.sourceUrl} target="_blank" rel="noreferrer">交通部道安資訊查詢網</a> : "未提供來源連結"}</dd></div>
          <div><dt>統計範圍</dt><dd>{officialTraffic.scope || "未提供"}</dd></div>
          <div><dt>已接入官方期間（非全部歷史）</dt><dd>{hasPeriod ? `${toMonthLabel(fromMonth)} ～ ${toMonthLabel(toMonth)}` : "未提供"}</dd></div>
          <div><dt>官方頁面更新日期</dt><dd>{formatDate(officialTraffic.sourceUpdatedAt) || "未提供"}</dd></div>
          <div><dt>最近檢查時間</dt><dd>{formatStatusTime(officialTraffic.checkedAt) || "未提供"}</dd></div>
          <div><dt>目前資料取得時間</dt><dd>{formatStatusTime(officialTraffic.fetchedAt) || "未提供"}</dd></div>
        </dl>
        <p className="coverage-caveat"><strong>官方說明：</strong>{officialTraffic.notice || "未提供初估或修訂說明，請查閱官方來源。"}</p>
        <p>
          非所有涉酒／毒事故；不含非第一當事者涉酒毒，亦未涵蓋行人／其他未列車種。
          官方肇因分組與新聞收錄不是同一母體，不能與新聞件數計算覆蓋率。
          各車種分列，不合計為全國酒／毒事故總數。
        </p>
        <div className="official-traffic-controls">
          <label>官方資料年份
            <select value={selectedYear ?? ""} disabled={!years.length} onChange={(event) => setYearChoice(event.target.value)}>
              {years.length ? years.map((year) => <option key={year} value={year}>{year} 年</option>) : <option value="">未提供年份</option>}
            </select>
          </label>
          <p>年份選擇只切換下表。全國、全年齡的官方資料不隨新聞縣市、月份或酒／毒類別篩選改變。</p>
        </div>
        {yearRows.length ? <div className="table-scroll official-traffic-table-wrap" tabIndex="0" role="region" aria-label="官方事故肇因件數表，可橫向捲動">
          <table className="official-traffic-table">
            <caption>{selectedYear} 年｜依第一當事者肇因分組，月份範圍逐列標示</caption>
            <thead><tr><th scope="col">車種</th><th scope="col">資料月份</th><th scope="col">酒醉(後)駕駛（件）</th><th scope="col">吸食違禁物駕駛（件）</th><th scope="col">來源</th></tr></thead>
            <tbody>{yearRows.map((row) => <tr key={`${row.year}-${row.vehicleType}`}>
              <th scope="row">{row.vehicle}</th>
              <td>{coverageDateRange(row.fromMonth, row.toMonth)}</td>
              <td className="official-case-count">{caseCount(row.alcoholCases)}</td>
              <td className="official-case-count">{caseCount(row.drugCases)}</td>
              <td>{row.sourceUrl ? <a href={row.sourceUrl} target="_blank" rel="noreferrer" aria-label={`${row.year} 年${row.vehicle}官方查詢資料`}>查詢資料</a> : "未提供"}</td>
            </tr>)}</tbody>
          </table>
        </div> : <p className="coverage-empty">尚無可顯示的年度車種資料，不能視為零件。</p>}
        <p>「未提供」表示未取得可核對的精確肇因列，來源明示零件時才顯示 0。本表僅列事故件數，未提供死傷指標。</p>
        {hasPeriod && !hasSearchOverlap ? <p className="coverage-caveat">
          已接入官方事故期間內尚無已登錄的完整新聞搜尋區間，不能視為已補齊同期間新聞。
        </p> : null}
        <div className="coverage-period-actions" role="group" aria-label="官方事故期間篩選" aria-describedby="coverage-period-help">
          <button type="button" disabled={!hasPeriod} onClick={() => setSelectedMonths(comparisonMonths)}>套用官方事故期間</button>
          <button type="button" disabled={!months.length} onClick={() => setSelectedMonths(months)}>全部新聞月份</button>
        </div>
        <p id="coverage-period-help">
          依上方已接入官方事故期間篩選現有新聞月份，採新聞發布日，不是事件發生日。
          {comparisonMonths.length ? `目前有 ${comparisonMonths.length} 個月份交集。` : "目前沒有月份交集，套用後顯示無資料，不代表零事件。"}
          這不表示已補齊同期間新聞；不補入未搜尋月份、不填零事件。
          期間外新聞仍保留，可用「全部新聞月份」恢復查看。
        </p>
      </>}
    </section>
  );
}

function DataCoveragePanel({ newsStatus, selectedMonths, months, setSelectedMonths }) {
  const [reviewFilter, setReviewFilter] = useState("all");
  const coverage = newsStatus?.coverage;
  const searches = Array.isArray(coverage?.searches) ? coverage.searches : [];
  const recordDates = coverage?.recordDates || {};
  const history = coverage?.historyReview;
  const rows = Array.isArray(history?.rows) ? history.rows : [];
  const visibleRows = rows.filter((row) => reviewFilter === "all" || row.status === reviewFilter);
  const sources = [...new Set([
    ...(Array.isArray(newsStatus?.sourceCoverage) ? newsStatus.sourceCoverage : []),
    ...searches.map((search) => search.source),
  ].filter(Boolean))];
  const sourceLabel = (source) => source === "LTN" ? "自由時報（LTN）" : source || "來源未登錄";
  const countLabel = (value) => Number.isInteger(value) && value >= 0 ? `${value} 筆` : "未登錄";

  return (
    <section className="coverage-panel panel-pop" aria-labelledby="coverage-heading">
      <div className="coverage-heading">
        <h2 id="coverage-heading">資料來源與涵蓋範圍</h2>
        <p>登錄來源：{sources.length ? sources.map(sourceLabel).join("、") : "未登錄"}</p>
      </div>
      <p className="coverage-caveat">
        本站依下列來源、關鍵字與搜尋區間整理新聞，不涵蓋全台所有媒體或所有事件。
        有資料的日期跨度，不代表期間每天都已完整搜尋，也不代表沒有收錄的日期沒有事件。
      </p>

      <div className="coverage-grid">
        <section className="coverage-searches">
          <h3>已完成搜尋的新聞發布日期區間</h3>
          {searches.length ? <ul className="coverage-search-list">
            {searches.map((search, index) => {
              const keywords = Array.isArray(search.keywords) ? search.keywords.filter((word) => typeof word === "string" && word.trim()) : [];
              return <li key={`${search.source}-${search.from}-${search.to}-${index}`}>
                <strong>{sourceLabel(search.source)}｜{coverageDateRange(search.from, search.to)}</strong>
                <p>搜尋關鍵字：{keywords.length ? keywords.join("、") : "未登錄"}</p>
                <small>檢查時間：{formatStatusTime(search.checkedAt) || "未登錄"}</small>
              </li>;
            })}
          </ul> : <p className="coverage-empty">未登錄實際搜尋區間與關鍵字；不能從既有資料的最早、最晚日期推定搜尋範圍。</p>}
        </section>

        <section className="coverage-record-dates">
          <h3>既有資料日期跨度</h3>
          <dl>
            <div><dt>新聞發布日期</dt><dd>{coverageDateRange(recordDates.publishedFrom, recordDates.publishedTo)}</dd></div>
            <div><dt>事件發生日期</dt><dd>{coverageDateRange(recordDates.occurredFrom, recordDates.occurredTo)}</dd></div>
          </dl>
          <p>這裡只列已收錄資料的日期邊界；發生日期未明的事件無法提供該日期。
            歷史原文重新核對，也不等於已補齊整段期間的新聞搜尋。</p>
        </section>
      </div>

      <OfficialTrafficPanel
        officialTraffic={newsStatus?.officialTraffic}
        searches={searches}
        months={months}
        setSelectedMonths={setSelectedMonths}
      />

      <div className="coverage-selection">
        <strong>目前選取的新聞發布月份（{selectedMonths.length} 個）</strong>
        <p>{selectedMonths.length ? [...selectedMonths].sort().map(toMonthLabel).join("、") : "目前未選取可用的新聞月份，列表與趨勢無資料；不代表這段期間沒有事件。"}</p>
        <small>月份篩選依新聞發布日，不是事件發生日；選取月份不會擴大上述實際搜尋範圍。</small>
      </div>

      <details className="coverage-history">
        <summary>
          <strong>歷史資料重新核對</strong>
          <span>{history ? `本輪 ${countLabel(history.total)}｜自動通過 ${countLabel(history.accepted)}｜仍待釐清 ${countLabel(history.pending)}` : "尚未登錄複核結果"}</span>
        </summary>
        {history ? <>
          <p>複核時間：{formatStatusTime(history.checkedAt) || "未登錄"}。自動通過代表機器核對通過，不是人工審查或司法認定。</p>
          <p>以下為全站本輪歷史複核紀錄，不隨月份、縣市或酒／毒類別篩選變動；逐筆保留結果、原因與來源。</p>
          <div className="coverage-review-controls">
            <label>複核結果
              <select value={reviewFilter} onChange={(event) => setReviewFilter(event.target.value)}>
                <option value="all">全部結果</option>
                <option value="pending">仍待釐清</option>
                <option value="accepted">自動核對通過</option>
              </select>
            </label>
            <span>已登錄明細 {rows.length} 筆，目前顯示 {visibleRows.length} 筆</span>
          </div>
          {visibleRows.length ? <ol className="coverage-review-list" tabIndex="0" aria-label="歷史複核逐筆結果，可捲動查看">
            {visibleRows.map((row, index) => {
              const urls = [...new Set([row.url, ...(Array.isArray(row.sourceUrls) ? row.sourceUrls : [])])]
                .filter((url) => typeof url === "string" && /^https?:\/\//i.test(url));
              const reasons = Array.isArray(row.reasons)
                ? row.reasons.filter((reason) => typeof reason === "string" && /[\u3400-\u9fff]/u.test(reason)) : [];
              return <li key={row.incidentId || row.url || index}>
                <article className="coverage-review-card">
                  <div className="coverage-review-heading">
                    <span className={`quality-badge ${row.status === "accepted" ? "ok" : "review"}`}>
                      {row.status === "accepted" ? "自動核對通過" : row.status === "pending" ? "仍待釐清" : "結果未登錄"}
                    </span>
                    <h4>{urls.includes(row.url) ? <a href={row.url} target="_blank" rel="noreferrer">{row.title || "未登錄新聞標題"}</a> : row.title || "未登錄新聞標題"}</h4>
                  </div>
                  {reasons.length ? <ul className="coverage-review-reasons">
                    {reasons.map((reason, reasonIndex) => <li key={reasonIndex}>{reason}</li>)}
                  </ul> : <p>未登錄中文原因說明；請參閱來源報導核對。</p>}
                  <div className="coverage-review-sources" aria-label="本筆複核來源">
                    {urls.length ? urls.map((url, sourceIndex) => <a key={url} href={url} target="_blank" rel="noreferrer">
                      來源 {sourceIndex + 1}{url === row.url ? "（原始報導）" : ""}
                    </a>) : <span>未登錄來源連結</span>}
                  </div>
                </article>
              </li>;
            })}
          </ol> : <p className="coverage-empty">{rows.length ? "此分類沒有已登錄的複核紀錄。" : "未登錄逐筆複核明細，不能將缺少明細視為全部通過。"}</p>}
        </> : <p className="coverage-empty">尚未登錄歷史資料的重新核對結果；舊資料仍依各筆統計資格處理。</p>}
      </details>
    </section>
  );
}

function InsightStrip({ insights }) {
  const items = [
    {
      label: "可定位事件最多",
      value: insights.topEventCity,
      text: `依納入地圖的新聞事件數排序；不是酒駕、毒駕風險排名。`,
    },
    {
      label: "死亡集中",
      value: insights.topDeathCity,
      text: `篩選期間內，可定位新聞事件的已知死亡人數最高；未明欄位不加總。`,
    },
    {
      label: "受傷集中",
      value: insights.topInjuryCity,
      text: `篩選期間內，可定位新聞事件的已知受傷人數最高；未明欄位不加總。`,
    },
  ];

  return (
    <section className="insight-strip">
      {items.map((item) => (
        <article className="insight-card panel-pop" key={item.label}>
          <span>{item.label}</span>
          <strong>{item.value || "無資料"}</strong>
          <p>{item.text}</p>
        </article>
      ))}
    </section>
  );
}

function MapLegend({ activeView }) {
  if (activeView !== "map") return null;

  return (
    <section className="tool-section map-legend">
      <h3>地圖圖例</h3>
      <div className="legend-row">
        <span className="legend-pill event-pill">數字 件</span>
        <p>縣市事件總數（含零死傷／未明）</p>
      </div>

      <div className="legend-row">
        <span className="legend-pill death-pill">☠️×數字</span>
        <p>已知死亡人數</p>
      </div>

      <div className="legend-row">
        <span className="legend-pill injury-pill">🩼×數字</span>
        <p>已知受傷人數</p>
      </div>

      <div className="legend-row">
        <span className="risk-dot high" />
        <p>新聞事件數排序前 3 名</p>
      </div>

      <div className="legend-row">
        <span className="risk-dot medium" />
        <p>新聞事件數排序第 4–8 名</p>
      </div>

      <div className="legend-row">
        <span className="risk-dot low" />
        <p>其他縣市／無符合事件</p>
      </div>
    </section>
  );
}

function CurrentFilterSummary({ selectedCity, selectedMonths, metrics }) {
  return (
    <section className="tool-section filter-summary">
      <h3>目前篩選</h3>

      <dl>
        <div>
          <dt>縣市</dt>
          <dd>{selectedCity || "全部縣市"}</dd>
        </div>
        <div>
          <dt>月份</dt>
          <dd>{selectedMonths.length} 個</dd>
        </div>
        <div>
          <dt>事件</dt>
          <dd>{metrics.events} 筆</dd>
        </div>
        <div>
          <dt>死傷</dt>
          <dd>{casualtySummary(metrics)}</dd>
        </div>
      </dl>
    </section>
  );
}


function MonthPicker({ months, selectedMonths, setSelectedMonths, toggleSet }) {
  const selectedSet = new Set(selectedMonths);

  return (
    <section className="month-picker-panel" aria-label="資料月份">
      <div className="month-picker-header">
        <h3>資料月份</h3>
        <div className="month-picker-actions">
          <button type="button" onClick={() => setSelectedMonths(months.slice(0, 3))}>
            近3月
          </button>
          <button type="button" onClick={() => setSelectedMonths(months.slice(0, 6))}>
            近6月
          </button>
          <button type="button" onClick={() => setSelectedMonths(months)}>
            全部
          </button>
        </div>
      </div>

      <div className="month-picker-scroll" role="list" aria-label="月份清單">
        {months.map((month) => (
          <label
            key={month}
            className={`month-picker-chip ${selectedSet.has(month) ? "checked" : ""}`}
            role="listitem"
          >
            <input
              type="checkbox"
              checked={selectedSet.has(month)}
              onChange={() => toggleSet(month, selectedMonths, setSelectedMonths)}
            />
            <span>{toShortMonthLabel(month)}</span>
          </label>
        ))}
      </div>
    </section>
  );
}

function GlobalMonthBar({ months, selectedMonths, setSelectedMonths }) {
  const toggleMonth = (month) => {
    setSelectedMonths((current) =>
      current.includes(month) ? current.filter((item) => item !== month) : [...current, month]
    );
  };

  return (
    <section className="global-month-bar panel-pop" aria-label="全域月份篩選">
      <div className="global-month-head">
        <div>
          <span>新聞發布月份</span>
          <strong>{selectedMonths.length === months.length ? "全部月份" : `已選 ${selectedMonths.length} 個月份`}</strong>
        </div>

        <div className="global-month-actions">
          <button type="button" onClick={() => setSelectedMonths(months.slice(0, 3))}>
            近3月
          </button>
          <button type="button" onClick={() => setSelectedMonths(months.slice(0, 6))}>
            近6月
          </button>
          <button type="button" onClick={() => setSelectedMonths(months)}>
            全部
          </button>
        </div>
      </div>

      <div className="global-month-scroll" role="list" aria-label="月份清單">
        {months.map((month) => (
          <button
            type="button"
            key={month}
            className={`global-month-chip ${selectedMonths.includes(month) ? "checked" : ""}`}
            onClick={() => toggleMonth(month)}
            role="listitem"
          >
            {toShortMonthLabel(month)}
          </button>
        ))}
      </div>
    </section>
  );
}

function MobileSummaryBar({ status, metrics, latestIncident, selectedCity }) {
  return (
    <section className="mobile-summary-bar panel-pop" aria-label="手機版資料摘要">
      <div>
        <span>最近檢查：{formatStatusTime(status.lastCheckedAt) || "未提供"}</span>
        <strong>
          {selectedCity || "全部縣市"}｜{metrics.events}件｜{casualtySummary(metrics)}
        </strong>
      </div>

      {latestIncident ? (
        <a href={latestIncident.url} target="_blank" rel="noreferrer">
          最近刊登：{latestIncident.city}｜發布 {formatDate(latestIncident.publishedAt)}｜發生 {formatDate(latestIncident.occurredAt) || "未明"}
        </a>
      ) : (
        <small>目前篩選條件沒有最新事故</small>
      )}
    </section>
  );
}

function PageContextBar({ activeView, selectedCity, metrics, selectedMonths, months, newsCount }) {
  const cityText = selectedCity || "全部縣市";
  const monthText = selectedMonths.length === months.length ? "全部月份" : `已選 ${selectedMonths.length} 個月份`;

  const content = {
    life: {
      title: "生命影響",
      text: `${cityText}｜看見受害者與家庭影響`,
    },
    map: {
      title: "地圖",
      text: `${cityText}｜${metrics.events}件納入統計｜${casualtySummary(metrics)}`,
    },
    trend: {
      title: "縣市趨勢",
      text: `${cityText}｜發布月份：${monthText}｜已知死傷與毒品嫌疑犯背景資料`,
    },
    caseStats: {
      title: "案件統計",
      text: `${cityText}｜${metrics.events}件納入統計`,
    },
    news: {
      title: "新聞列表",
      text: `${cityText}｜完整新聞 ${newsCount} 篇｜含排除統計與後續報導`,
    },
  }[activeView] || {
    title: "資料檢視",
    text: `${cityText}｜${monthText}`,
  };

  return (
    <section className="page-context-bar panel-pop" aria-label="目前分頁摘要">
      <span>{content.title}</span>
      <strong>{content.text}</strong>
    </section>
  );
}



function ControlPanel({
  months,
  selectedMonths,
  setSelectedMonths,
  sources,
  selectedSources,
  setSelectedSources,
  visibleTypes,
  setVisibleTypes,
  ranking,
  selectedCity,
  onSelectCity,
  showRanking = true,
  activeView,
  metrics,
  insights,
}) {
  const toggleSet = (value, list, setter) => {
    setter(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  };

  return (
    <aside className="control-panel tool-panel panel-pop">
      <div className="tool-panel-head">
        <span>工具面板</span>
        <h2>{activeView === "life" ? "生命影響" : activeView === "map" ? "地圖控制" : activeView === "trend" ? "趨勢篩選" : activeView === "caseStats" ? "案件統計" : "新聞篩選"}</h2>
        <p>上方月份列與縣市選取會同步影響地圖、趨勢圖與新聞列表。</p>
      </div>

      <section className="tool-section focus-card">
        <h3>本期觀察重點</h3>
        <ul>
          <li>
            <span>可定位事件最多</span>
            <strong>{insights.topEventCity || "無資料"}</strong>
          </li>
          <li>
            <span>死亡最高</span>
            <strong>{insights.topDeathCity || "無資料"}</strong>
          </li>
          <li>
            <span>受傷最高</span>
            <strong>{insights.topInjuryCity || "無資料"}</strong>
          </li>
        </ul>
      </section>

      <CurrentFilterSummary
        selectedCity={selectedCity}
        selectedMonths={selectedMonths}
        metrics={metrics}
      />




      <MapLegend activeView={activeView} />

      {showRanking ? (
        <RankingList ranking={ranking} selectedCity={selectedCity} onSelectCity={onSelectCity} />
      ) : null}
    </aside>
  );
}

function TrendBreakChart({ rows }) {
  const width = 920;
  const height = 420;
  const chartLeft = 58;
  const chartRight = 880;
  const topAreaTop = 42;
  const topAreaBottom = 158;
  const bottomAreaTop = 250;
  const bottomAreaBottom = 366;

  const maxCasualty = Math.max(1, ...rows.map((row) => Math.max(Number(row.deaths || 0), Number(row.injuries || 0))));
  const maxSuspects = Math.max(1, ...rows.map((row) => Number(row.suspects || 0)));

  const xOf = (index) => {
    if (rows.length <= 1) return chartLeft;
    return chartLeft + (index / (rows.length - 1)) * (chartRight - chartLeft);
  };

  const yTopOf = (value) => topAreaBottom - (value / maxCasualty) * (topAreaBottom - topAreaTop);
  const yBottomOf = (value) => bottomAreaBottom - (value / maxSuspects) * (bottomAreaBottom - bottomAreaTop);

  const buildPath = (key, yGetter) =>
    rows
      .map((row, index) => {
        const x = xOf(index);
        const y = yGetter(Number(row[key] || 0));
        return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");

  return (
    <div className="trend-break-chart-wrap">
      <svg
        className="trend-break-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="死亡、受傷與毒品嫌疑犯人數縣市趨勢折線圖"
      >
        <line className="axis-line" x1={chartLeft} y1={topAreaBottom} x2={chartRight} y2={topAreaBottom} />
        <line className="axis-line" x1={chartLeft} y1={bottomAreaBottom} x2={chartRight} y2={bottomAreaBottom} />

        <text className="axis-label" x="16" y={topAreaTop + 8}>
          死傷
        </text>
        <text className="axis-label" x="16" y={bottomAreaTop + 8}>
          嫌疑犯
        </text>

        <text className="axis-number" x="18" y={topAreaTop + 6}>
          {maxCasualty}
        </text>
        <text className="axis-number" x="18" y={topAreaBottom + 4}>
          0
        </text>
        <text className="axis-number" x="18" y={bottomAreaTop + 6}>
          {maxSuspects.toLocaleString()}
        </text>
        <text className="axis-number" x="18" y={bottomAreaBottom + 4}>
          0
        </text>

        <text className="wave-break" x={width / 2} y="212" textAnchor="middle">
          ～～～～～～～～～～～～～～～～～～～～
        </text>

        <path className="trend-line death-line" d={buildPath("deaths", yTopOf)} />
        <path className="trend-line injury-line" d={buildPath("injuries", yTopOf)} />
        <path className="trend-line suspect-line" d={buildPath("suspects", yBottomOf)} />

        {rows.map((row, index) => {
          const x = xOf(index);

          return (
            <g key={row.month}>
              <circle className="death-dot" cx={x} cy={yTopOf(row.deaths)} r="4">
                <title>
                  {toShortMonthLabel(row.month)} 已知死亡 {row.deaths}；{casualtyCoverage(row, "deaths")}
                </title>
              </circle>
              <circle className="injury-dot" cx={x} cy={yTopOf(row.injuries)} r="4">
                <title>
                  {toShortMonthLabel(row.month)} 已知受傷 {row.injuries}；{casualtyCoverage(row, "injuries")}
                </title>
              </circle>
              <circle className="suspect-dot" cx={x} cy={yBottomOf(row.suspects)} r="4">
                <title>
                  {toShortMonthLabel(row.month)} 毒品嫌疑犯 {row.suspects.toLocaleString()}
                </title>
              </circle>

              <text className="x-label" x={x} y="402" textAnchor="middle">
                {toShortMonthLabel(row.month)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function CityTrendPage({ months, selectedMonths, incidents, suspects, selectedCity }) {
  const rows = useMemo(() => {
    const monthList = [...selectedMonths].sort();

    return monthList.map((month) => {
      const filteredIncidents = incidents.filter((incident) => {
        return incident.publishedAt?.slice(0, 7) === month && (!selectedCity || incident.city === selectedCity);
      });

      const totals = incidentTotals(filteredIncidents);
      const suspectTotal = suspects
        .filter((row) => row.month === month && (!selectedCity || row.city === selectedCity))
        .reduce((sum, row) => sum + Number(row.suspects || 0), 0);

      return {
        month,
        ...totals,
        suspects: suspectTotal,
      };
    });
  }, [months, selectedMonths, incidents, suspects, selectedCity]);

  const totals = useMemo(() => {
    return rows.reduce(
      (summary, row) => ({
        deaths: summary.deaths + row.deaths,
        injuries: summary.injuries + row.injuries,
        deathsMissing: summary.deathsMissing + row.deathsMissing,
        injuriesMissing: summary.injuriesMissing + row.injuriesMissing,
        deathsRetained: summary.deathsRetained + row.deathsRetained,
        injuriesRetained: summary.injuriesRetained + row.injuriesRetained,
        suspects: summary.suspects + row.suspects,
      }),
      { deaths: 0, injuries: 0, deathsMissing: 0, injuriesMissing: 0, deathsRetained: 0, injuriesRetained: 0, suspects: 0 }
    );
  }, [rows]);

  return (
    <section className="trend-page panel-pop">
      <div className="trend-page-header">
        <div>
          <span>縣市趨勢</span>
          <h2>{selectedCity || "全部縣市"}</h2>
          <p>
            事件依新聞發布月份歸組，並非事故發生月份。只加總已知傷亡，未明欄位不填零。
            新報數值衝突時保留既有核對值並揭露件數，沒有既有值則列未明。
            毒品嫌疑犯人數為獨立的公開統計背景資料，不是酒駕或毒駕事故數，也不受酒／毒類型篩選影響。
          </p>

        </div>

        <div className="trend-summary">
          <div>
            <small>已知死亡</small>
            <b>{totals.deaths}</b>
            <small>{casualtyCoverage(totals, "deaths")}</small>
          </div>
          <div>
            <small>已知受傷</small>
            <b>{totals.injuries}</b>
            <small>{casualtyCoverage(totals, "injuries")}</small>
          </div>
          <div>
            <small>毒品嫌疑犯</small>
            <b>{totals.suspects.toLocaleString()}</b>
          </div>
        </div>
      </div>

      {rows.length ? (
        <>
          <div className="trend-legend">
            <span>
              <i className="legend-death" />
              已知死亡人數
            </span>
            <span>
              <i className="legend-injury" />
              已知受傷人數
            </span>
            <span>
              <i className="legend-suspect" />
              毒品嫌疑犯人數
            </span>
          </div>

          <TrendBreakChart rows={rows} />
          <details className="trend-data-details">
            <summary>逐月已知人數、缺值與衝突保留件數</summary>
            <div className="table-scroll">
              <table>
                <caption>按新聞發布月份；沒有符合事件與傷亡未明分開呈現</caption>
                <thead><tr><th>發布月</th><th>事件</th><th>已知死亡／欄位狀態</th><th>已知受傷／欄位狀態</th></tr></thead>
                <tbody>{rows.map((row) => <tr key={row.month}>
                  <th scope="row">{toMonthLabel(row.month)}</th><td>{row.events}</td>
                  <td>{row.deaths} 人／{casualtyCoverage(row, "deaths")}</td><td>{row.injuries} 人／{casualtyCoverage(row, "injuries")}</td>
                </tr>)}</tbody>
              </table>
            </div>
          </details>
        </>
      ) : (
        <div className="empty-panel">目前篩選條件沒有趨勢資料</div>
      )}
    </section>
  );
}



function genderLabel(value) {
  if (value === "male") return "男性";
  if (value === "female") return "女性";
  return null;
}

function profileTags(values, fallback) {
  const list = Array.isArray(values) ? values.filter(Boolean) : values ? [values] : [];
  return list.length ? list.slice(0, 5) : [fallback];
}

function ProfileTagList({ values, fallback, tone }) {
  return (
    <div className="profile-tags">
      {profileTags(values, fallback).map((value) => (
        <span className={`profile-tag ${tone || ""}`} key={value}>
          {value}
        </span>
      ))}
    </div>
  );
}

function IncidentProfilePanel({ incident }) {
  const driver = incident.extractedDetails?.driver || {};
  const drug = incident.extractedDetails?.drug || {};
  const crash = incident.extractedDetails?.crash || {};
  const victim = incident.extractedDetails?.victim || {};
  const context = incident.extractedDetails?.context || {};

  const driverIdentity = [
    driver.age ? `${driver.age}歲` : null,
    genderLabel(driver.gender),
    driver.ageGroup ? `年齡層 ${driver.ageGroup}` : null,
  ].filter(Boolean);

  const victimContext = [
    ...(victim.vulnerableGroups || []),
    context.familyImpact ? "家庭受影響" : null,
    context.schoolImpact ? "校園/學生相關" : null,
    context.publicPlaceImpact ? "公共場域波及" : null,
  ].filter(Boolean);

  return (
    <section className="incident-profile-panel">
      <article className="profile-card driver-profile">
        <div className="profile-card-head">
          <span>涉案駕駛輪廓</span>
          <strong>{driverIdentity.length ? driverIdentity.join("・") : "身分資訊未明"}</strong>
        </div>

        <div className="profile-block">
          <small>涉案載具</small>
          <ProfileTagList
            values={driver.primaryVehicleLabel || driver.primaryVehicleType}
            fallback="涉案載具未明"
            tone="vehicle"
          />
        </div>

        {impairmentTypes(incident, isLegacyIncident(incident)).includes("drug") ? <div className="profile-block">
          <small>毒品 / 檢測</small>
          <ProfileTagList
            values={[...(drug.keywords || []), ...(drug.testMethods || [])]}
            fallback="毒品類型未明"
            tone="drug"
          />
        </div> : null}

        <div className="profile-block">
          <small>行為型態</small>
          <ProfileTagList values={crash.scenarioTypes || []} fallback="肇事型態未明" tone="scenario" />
        </div>
      </article>

      <article className="profile-card victim-profile">
        <div className="profile-card-head">
          <span>受害者輪廓</span>
          <strong>
            死亡 {casualtyText(incident, "deaths")}｜受傷 {casualtyText(incident, "injuries")}
          </strong>
        </div>

        <div className="profile-block">
          <small>正在做什麼 / 受害情境</small>
          <ProfileTagList values={victim.activities || []} fallback="受害情境未明" tone="victim" />
        </div>

        <div className="profile-block">
          <small>脆弱族群 / 家庭影響</small>
          <ProfileTagList values={victimContext} fallback="未揭露明確輪廓" tone="vulnerable" />
        </div>

        <div className="profile-block">
          <small>場域</small>
          <ProfileTagList values={context.placeTypes || []} fallback="場域未明" tone="place" />
        </div>
      </article>
    </section>
  );
}


const dailyLifeCopy = {
  "停等紅燈/待轉": { text: "只是停在紅燈前，等待下一段路。", icon: "🚦" },
  "行人/過馬路": { text: "只是走在應該被保護的斑馬線與路口。", icon: "🚶" },
  "倒垃圾": { text: "只是做一件日常不過的小事。", icon: "🗑️" },
  "買菜": { text: "只是出門準備一家人的餐桌。", icon: "🛒" },
  "資源回收": { text: "只是推著回收車，完成一天的生活。", icon: "♻️" },
  "學生/環島車隊": { text: "只是和同學一起完成一段青春旅程。", icon: "🎒" },
  "警務執勤": { text: "只是正在完成守護道路的工作。", icon: "👮" },
  "教師": { text: "只是正在往返教學與生活的路上。", icon: "📚" },
  "家庭同行": { text: "只是和家人一起出門。", icon: "👨‍👩‍👧" },
  "騎乘機車": { text: "只是騎在每天都會經過的路上。", icon: "🏍️" },
  "下車救援": { text: "只是想停下來幫助別人。", icon: "🫶" },
  "店家/商圈": { text: "只是出現在平常人來人往的地方。", icon: "🏪" },
};

function lifeActivityRows(incidents, limit = 7) {
  return countValues(incidents, (item) => item.extractedDetails?.victim?.activities || [], limit).map((row) => ({
    ...row,
    text: dailyLifeCopy[row.label]?.text || "那原本也可能只是很平凡的一天。",
    icon: dailyLifeCopy[row.label]?.icon || "•",
  }));
}

function InterruptedDailyLifeSection({ incidents, onFocusNews }) {
  const rows = lifeActivityRows(incidents, 7);
  if (!rows.length) return null;

  return (
    <section className="life-section panel-pop">
      <div className="life-section-head">
        <span>被打斷的日常</span>
        <h2>他們當時正在……</h2>
        <p>
          這些不是抽象的事故數字。新聞裡的受害者，可能只是正在等紅燈、過馬路、買菜、倒垃圾、騎車回家，或和家人一起出門。
        </p>
      </div>

      <div className="life-card-grid">
        {rows.map((row) => (
          <button
            type="button"
            className="life-card clickable-card"
            key={row.label}
            onClick={() =>
              onFocusNews?.({
                type: "victimActivity",
                value: row.label,
                label: `被打斷的日常｜${row.label}`,
              })
            }
          >
            <div className="life-card-visual" aria-hidden="true">
              <span className="life-card-bgicon">{row.icon}</span>
              <span className="life-card-icon">{row.icon}</span>
            </div>
            <strong>{row.label}</strong>
            <p>{row.text}</p>
            <small>{row.value} 起新聞提及｜查看相關新聞 →</small>
          </button>
        ))}
      </div>
    </section>
  );
}

function AffectedDailyLife({ incident }) {
  const activities = incident.extractedDetails?.victim?.activities || [];
  const vulnerableGroups = incident.extractedDetails?.victim?.vulnerableGroups || [];
  const context = incident.extractedDetails?.context || {};
  const contextTags = [
    ...(activities || []),
    ...(vulnerableGroups || []),
    context.familyImpact ? "家庭受影響" : null,
    context.schoolImpact ? "校園/學生相關" : null,
    context.publicPlaceImpact ? "公共場域波及" : null,
  ].filter(Boolean);

  if (!contextTags.length) return null;

  const firstActivity = activities[0];

  return (
    <section className="affected-life-note">
      <span>被影響的日常</span>
      <p>
        {firstActivity && dailyLifeCopy[firstActivity]?.text
          ? dailyLifeCopy[firstActivity].text
          : "這起事件背後，可能是一段原本平凡的日常。"}
      </p>
      <ProfileTagList values={contextTags.slice(0, 6)} fallback="新聞未揭露受害者情境" tone="life" />
    </section>
  );
}


const familyRoleMeta = {
  母親: { icon: "👩", narrative: "有些人失去的，不只是家人，也是孩子每天依靠的那個人。" },
  父親: { icon: "👨", narrative: "有些家庭少了一位父親，留下的是陪伴與支撐突然中斷的空缺。" },
  女兒: { icon: "👧", narrative: "有些家庭失去的，是本來還會繼續長大的女兒。" },
  兒子: { icon: "👦", narrative: "有些家庭失去的，是原本還有很多未來的兒子。" },
  "配偶/伴侶": { icon: "💍", narrative: "有些人失去的是每天共同生活、互相依靠的伴侶。" },
  "祖父母/長者": { icon: "🧓", narrative: "有些家庭少了一位長輩，少的不只是家人，也是熟悉的陪伴。" },
  "孩子/未成年": { icon: "🧒", narrative: "有些家庭承受的，是孩子突然被奪走的未來。" },
  "兄弟姊妹": { icon: "🫂", narrative: "有些家庭失去的，是陪伴彼此長大的手足。" },
  家庭同行: { icon: "🏠", narrative: "有些案件中，多位家人同時被捲入，整個家庭都被迫改變。" },
};

const householdImpactMeta = {
  "孩子照顧與陪伴角色中斷": "孩子日常照顧與陪伴可能出現空缺。",
  "家庭節奏與情感支持改變": "家庭原本的節奏、情感支持與日常分工都可能被迫重整。",
  "家庭支柱與陪伴角色中斷": "家庭支柱與陪伴來源可能突然消失。",
  "父母與手足長期創傷": "留下來的家人，往往要面對長期悲傷與創傷。",
  "家庭陪伴與未來想像被迫中斷": "原本關於未來的想像與陪伴，被迫停在這一天。",
  "伴侶支持系統改變": "伴侶之間的支持與照顧關係可能突然改變。",
  "生活與可能的經濟壓力上升": "生活支援與可能的經濟壓力，可能因此提高。",
  "長輩陪伴與照護關係改變": "長輩的陪伴與照護關係，可能因此中斷。",
  "家庭情感支持出現空缺": "熟悉的家庭情感支持，可能從此少了一塊。",
  "父母長期創傷與照顧失衡": "父母可能同時承受悲傷與照顧失衡。",
  "家庭未來期待被迫中斷": "原本對孩子與家庭的未來期待，被迫中斷。",
  "手足與家庭陪伴出現空缺": "手足之間的陪伴與家庭互動，可能出現長期空缺。",
  "家人長期創傷": "家人可能需要長時間面對創傷與失落。",
  "多位家人同時受影響": "不只是個人受害，整個家庭都可能一起承受衝擊。",
  "家庭生活秩序可能被迫重整": "家庭的生活安排與照顧分工，可能被迫重新調整。",
  "長期悲傷與生活重建壓力": "家人除了悲傷，也可能承受長期的生活重建壓力。",
};

function familyRoleRows(incidents, limit = 8) {
  return countValues(incidents, (item) => item.humanImpact?.victimFamilyRoles || [], limit).map((row) => ({
    ...row,
    icon: familyRoleMeta[row.label]?.icon || "👤",
    text: familyRoleMeta[row.label]?.narrative || "每一個角色背後，都是一個原本在家庭裡扮演重要位置的人。",
  }));
}

function householdImpactRows(incidents, limit = 6) {
  return countValues(incidents, (item) => item.humanImpact?.possibleHouseholdImpacts || [], limit).map((row) => ({
    ...row,
    text: householdImpactMeta[row.label] || row.label,
  }));
}

function FamilyRoleSection({ incidents, onFocusNews }) {
  const roleRows = familyRoleRows(incidents, 8);
  const impactRows = householdImpactRows(incidents, 6);
  if (!roleRows.length) return null;

  return (
    <section className="family-impact-section panel-pop">
      <div className="family-impact-head">
        <span>家中少了誰</span>
        <h2>受害者不只是數字，也是某個家的角色</h2>
        <p>以下內容來自新聞文字中的家庭角色線索，讓人看見：這些事故帶走的，可能是一位母親、一位父親、一個孩子，或一位陪伴家人的長輩。</p>
      </div>

      <div className="family-role-grid">
        {roleRows.map((row) => (
          <button
            type="button"
            className="family-role-card clickable-card"
            key={row.label}
            onClick={() =>
              onFocusNews?.({
                type: "familyRole",
                value: row.label,
                label: `家中少了誰｜${row.label}`,
              })
            }
          >
            <div className="family-role-visual" aria-hidden="true">
              <span className="family-role-bgicon">{row.icon}</span>
              <span className="family-role-icon">{row.icon}</span>
            </div>
            <strong>{row.label}</strong>
            <p>{row.text}</p>
            <small>{row.value} 起新聞提及｜查看相關新聞 →</small>
          </button>
        ))}
      </div>

      {impactRows.length ? (
        <div className="household-impact-panel">
          <div>
            <span>對這個家未來的影響</span>
            <p>我們無法替每個家庭下結論，但從新聞角色線索可以看見，事故可能留下的，不只是悲傷，也包含照顧、陪伴、生活節奏與重建壓力。</p>
          </div>
          <ul>
            {impactRows.map((row) => (
              <li key={row.label}>
                <button
                  type="button"
                  className="household-impact-button"
                  onClick={() =>
                    onFocusNews?.({
                      type: "householdImpact",
                      value: row.label,
                      label: `家庭影響｜${row.label}`,
                    })
                  }
                >
                  <strong>{row.label}</strong>
                  <p>{row.text}</p>
                  <small>{row.value} 起新聞提及｜查看相關新聞 →</small>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function FamilyImpactNote({ incident }) {
  const familyRoles = incident.humanImpact?.victimFamilyRoles || [];
  const socialRoles = incident.humanImpact?.victimSocialRoles || [];
  const impacts = incident.humanImpact?.possibleHouseholdImpacts || [];
  const evidence = incident.humanImpact?.sourceText || [];

  if (!familyRoles.length && !socialRoles.length && !impacts.length) return null;

  return (
    <section className="family-impact-note">
      <span>這個家少了誰</span>
      <ProfileTagList values={[...familyRoles, ...socialRoles].slice(0, 6)} fallback="新聞未揭露家庭角色" tone="family" />
      {impacts.length ? (
        <div className="family-impact-copy">
          <strong>可能留下的影響</strong>
          <ul>
            {impacts.slice(0, 3).map((item) => (
              <li key={item}>{householdImpactMeta[item] || item}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {evidence.length ? <small>新聞提及：{evidence[0]}</small> : null}
    </section>
  );
}

function SafetyReminderSection() {
  const reminders = [
    "過馬路前，多停一秒，再看一次來車方向。",
    "等紅燈或待轉時，留意後方與側邊異常靠近的車。",
    "騎車與開車時，注意蛇行、暴衝、逆向或異常停走車輛，先保持距離。",
    "夜間外出，盡量選擇明亮路段，避免停留在視線死角。",
    "看到疑似毒駕、酒駕或危險駕駛，先保護自己，再通報警方。",
  ];

  return (
    <section className="safety-section panel-pop">
      <div>
        <span>外出安全提醒</span>
        <h2>在路上，請多留一秒</h2>
        <p>安全不該只靠運氣。每一次多看一眼、保持距離、提高警覺，都可能讓自己與身邊的人更安全。</p>
      </div>

      <ul>{reminders.map((item) => <li key={item}>{item}</li>)}</ul>
    </section>
  );
}

function WhyRecordSection() {
  return (
    <section className="why-record-section panel-pop">
      <span>為什麼記錄</span>
      <h2>不是為了製造恐懼，而是提醒彼此珍惜生命</h2>
      <p>
        我們記錄這些事件，不是為了替任何縣市貼上標籤，也不是為了把悲劇變成排名。
        我們記錄酒駕與毒駕事件，也關注受影響的人與日常生活。
      </p>
      <p>
        有人只是正在回家，有人只是停等紅燈，有人只是陪家人出門，也有人只是正在工作。
        透過資料，我們希望看見問題；透過記錄，我們希望提醒彼此：生命不是數字，安全不該只靠運氣。
      </p>
    </section>
  );
}

function QualityBadge({ incident }) {
  return <span className={`quality-badge ${qualityTone(incident)}`}>{qualityLabel(incident)}</span>;
}

function StatBars({ title, rows, tone = "" }) {
  const max = Math.max(1, ...rows.map((row) => row.value));

  return (
    <article className={`stats-card ${tone}`}>
      <h3>{title}</h3>

      {rows.length ? (
        <div className="stats-bars">
          {rows.map((row) => (
            <div className="stats-row" key={row.label}>
              <div>
                <span>{row.label}</span>
                <strong>{row.value}</strong>
              </div>
              <i style={{ width: `${Math.max(8, (row.value / max) * 100)}%` }} />
            </div>
          ))}
        </div>
      ) : (
        <p className="stats-empty">目前資料不足</p>
      )}
    </article>
  );
}

function DonutChartCard({ title, rows, centerValue, centerLabel, tone = "" }) {
  const palette = ["#8c2d2d", "#0c746b", "#d38b25", "#7c3aed", "#2563eb", "#4f554f", "#d97706", "#9f1239"];
  const total = Math.max(1, rows.reduce((sum, row) => sum + row.value, 0));
  const circumference = 2 * Math.PI * 42;
  let cumulative = 0;

  return (
    <article className={`donut-card ${tone}`}>
      <div className="donut-card-head">
        <h3>{title}</h3>
        <p>僅統計目前可判讀之涉案駕駛資料，未明資料另列。</p>
      </div>

      <div className="donut-card-body">
        <div className="donut-visual" aria-hidden="true">
          <svg viewBox="0 0 120 120" className="donut-svg">
            <circle cx="60" cy="60" r="42" className="donut-base" />
            {rows.map((row, index) => {
              const fraction = row.value / total;
              const dash = fraction * circumference;
              const gap = circumference - dash;
              const segment = (
                <circle
                  key={row.label}
                  cx="60"
                  cy="60"
                  r="42"
                  fill="none"
                  stroke={palette[index % palette.length]}
                  strokeWidth="12"
                  strokeDasharray={`${dash} ${gap}`}
                  strokeDashoffset={-cumulative}
                  strokeLinecap="butt"
                  transform="rotate(-90 60 60)"
                />
              );
              cumulative += dash;
              return segment;
            })}
          </svg>

          <div className="donut-center">
            <strong>{centerValue}</strong>
            <span>{centerLabel}</span>
          </div>
        </div>

        <div className="donut-legend">
          {rows.map((row, index) => {
            const pct = Math.round((row.value / total) * 1000) / 10;
            return (
              <div className="donut-legend-row" key={row.label}>
                <div>
                  <i style={{ background: palette[index % palette.length] }} />
                  <span>{row.label}</span>
                </div>
                <strong>{row.value} 筆・{pct}%</strong>
              </div>
            );
          })}
        </div>
      </div>
    </article>
  );
}

function OffenderDemographicsSection({ statsIncidents, selectedCity }) {
  const ageRows = countValues(
    statsIncidents,
    (item) => driverAgeLabel(item.extractedDetails?.driver?.ageGroup),
    8
  );
  const genderRows = countValues(
    statsIncidents,
    (item) => driverGenderLabel(item.extractedDetails?.driver?.gender),
    3
  );

  const ageKnownCount = statsIncidents.filter(
    (item) => driverAgeLabel(item.extractedDetails?.driver?.ageGroup) !== "年齡未明"
  ).length;
  const genderKnownCount = statsIncidents.filter(
    (item) => driverGenderLabel(item.extractedDetails?.driver?.gender) !== "性別未明"
  ).length;

  return (
    <section className="offender-demographics panel-pop">
      <div className="section-head compact">
        <span>涉案駕駛輪廓統計</span>
        <h2>{selectedCity || "全部縣市"}｜涉案駕駛年齡與性別</h2>
        <p>依可統計事件的既有駕駛欄位計件，不代表所有當事人人數；缺少欄位列為未明。</p>
      </div>

      <div className="offender-kpis">
        <article>
          <small>納入統計事件</small>
          <strong>{statsIncidents.length}</strong>
        </article>
        <article>
          <small>年齡可判讀</small>
          <strong>{ageKnownCount}</strong>
        </article>
        <article>
          <small>性別可判讀</small>
          <strong>{genderKnownCount}</strong>
        </article>
      </div>

      <div className="offender-demographics-grid">
        <DonutChartCard
          title="涉案駕駛年齡分布（事件筆數）"
          rows={ageRows}
          centerValue={ageKnownCount}
          centerLabel="年齡可判讀"
          tone="age"
        />
        <DonutChartCard
          title="涉案駕駛性別分布（事件筆數）"
          rows={genderRows}
          centerValue={genderKnownCount}
          centerLabel="性別可判讀"
          tone="gender"
        />
      </div>
    </section>
  );
}

function QualitySummaryCard({ allIncidents, statsIncidents, selectedCity }) {
  const machineChecked = statsIncidents.filter((item) => item.dataQuality?.verificationStatus === "machine_checked").length;
  const excluded = allIncidents.filter((item) => !isStatsIncident(item)).length;
  const legacyPending = allIncidents.filter((item) => isLegacyIncident(item) && !isStatsIncident(item)).length;

  return (
    <section className="quality-summary-card panel-pop">
      <div>
        <span>資料品質</span>
        <h2>{selectedCity || "全部縣市"}｜統計口徑已更新</h2>
        <p>
          全部分頁採用同一事件資格，事件未確認的紀錄不納入。已確認事件即使部分欄位待釐清，仍計入事件數；傷亡逐欄採用已核對值，衝突時保留既有核對值。
          新聞文章不直接增加事件數，同案按事件 ID 去重。
          歷史資料沿用明確標為可統計且無待複核的舊紀錄，不視為本次機器核對；其他歷史紀錄仍可在新聞列表查看。
        </p>
      </div>

      <div className="quality-kpis">
        <article>
          <small>完整資料</small>
          <strong>{allIncidents.length}</strong>
        </article>
        <article>
          <small>納入統計</small>
          <strong>{statsIncidents.length}</strong>
        </article>
        <article>
          <small>機器規則核對</small>
          <strong>{machineChecked}</strong>
        </article>
        <article>
          <small>排除統計</small>
          <strong>{excluded}</strong>
        </article>
        <article>
          <small>歷史待核對</small>
          <strong>{legacyPending}</strong>
        </article>
      </div>
    </section>
  );
}


function LifeImpactPage({ incidents, selectedCity, onFocusNews }) {
  return (
    <section className="life-impact-page">
      <section className="life-impact-hero panel-pop">
        <span>生命影響</span>
        <h2>{selectedCity || "全部縣市"}｜家中少了誰？</h2>
        <p>
          酒駕與毒駕事件所影響的，可能是一位母親、一位父親、
          一個孩子、一位伴侶，或是一個家庭原本熟悉的日常。
        </p>
      </section>

      <FamilyRoleSection incidents={incidents} onFocusNews={onFocusNews} />

      <SafetyReminderSection />

      <WhyRecordSection />
    </section>
  );
}

function CaseStatsPage({ allIncidents, statsIncidents, selectedCity }) {
  const scopedAllIncidents = useMemo(() => {
    return selectedCity ? allIncidents.filter((item) => item.city === selectedCity) : allIncidents;
  }, [allIncidents, selectedCity]);

  const scopedStatsIncidents = useMemo(() => {
    return selectedCity ? statsIncidents.filter((item) => item.city === selectedCity) : statsIncidents;
  }, [selectedCity, statsIncidents]);

  const vehicleRows = countValues(
    scopedStatsIncidents,
    (item) =>
      item.extractedDetails?.driver?.primaryVehicleLabel ||
      item.extractedDetails?.driver?.primaryVehicleType,
    8
  );

  const drugRows = countValues(
    scopedStatsIncidents,
    (item) => item.extractedDetails?.drug?.keywords || [],
    8
  );

  const scenarioRows = countValues(
    scopedStatsIncidents,
    (item) => item.extractedDetails?.crash?.scenarioTypes || [],
    8
  );

  const victimRows = countValues(
    scopedStatsIncidents,
    (item) => item.extractedDetails?.victim?.activities || [],
    8
  );

  const vulnerableRows = countValues(
    scopedStatsIncidents,
    (item) => item.extractedDetails?.victim?.vulnerableGroups || [],
    8
  );

  const qualityRows = [
    { label: "機器規則核對・可統計", value: scopedStatsIncidents.filter((item) => item.dataQuality?.verificationStatus === "machine_checked").length },
    { label: "人工核對・可統計", value: scopedStatsIncidents.filter((item) => item.dataQuality?.verificationStatus === "manual_checked").length },
    { label: "歷史資料・舊口徑", value: scopedStatsIncidents.filter(isLegacyIncident).length },
    { label: "歷史待核對", value: scopedAllIncidents.filter((item) => isLegacyIncident(item) && !isStatsIncident(item)).length },
    { label: "其他排除統計", value: scopedAllIncidents.filter((item) => !isLegacyIncident(item) && !isStatsIncident(item)).length },
  ];

  return (
    <section className="case-stats-page">
      {selectedCity ? (
        <div className="case-scope-pill panel-pop">
          目前案件統計範圍：<strong>{selectedCity}</strong>
        </div>
      ) : null}

      <QualitySummaryCard
        allIncidents={scopedAllIncidents}
        statsIncidents={scopedStatsIncidents}
        selectedCity={selectedCity}
      />

      <OffenderDemographicsSection statsIncidents={scopedStatsIncidents} selectedCity={selectedCity} />

      <div className="case-stats-grid">
        <StatBars title="涉案載具" rows={vehicleRows} tone="vehicle" />
        <StatBars title="毒品關鍵字" rows={drugRows} tone="drug" />
        <StatBars title="肇事型態" rows={scenarioRows} tone="scenario" />
        <StatBars title="受害情境" rows={victimRows} tone="victim" />
        <StatBars title="脆弱族群" rows={vulnerableRows} tone="vulnerable" />
        <StatBars title="資料品質" rows={qualityRows} tone="quality" />
      </div>

      <div className="quality-note-panel panel-pop">
        <h3>閱讀提醒</h3>
        <p>
          本頁統計來自新聞標題、摘要與相關報導標題的規則式萃取。載具、毒品、肇事型態與受害情境屬於
          「可觀察標籤」，不是法院認定或官方完整事故分類。標示為「需複核」的案件，建議後續再回到新聞原文人工確認。
        </p>
      </div>
    </section>
  );
}

function NewsListPage({ articles, incidentsById, selectedCity, newsFocusFilter, onClearFocus, newsKind, setNewsKind, reviewFilter, setReviewFilter }) {
  const filtered = articles.filter((article) => {
    const linked = [...new Set([...(article.eventIds || []), ...(article.archivedEventIds || [])])].map((id) => incidentsById.get(id)).filter(Boolean);
    const legacyPending = linked.some((item) => isLegacyIncident(item) && !isStatsIncident(item));
    const pending = article.status !== "verified" || linked.some((item) => !isStatsIncident(item) || hasPendingFields(item));
    return (newsKind === "all" || article.kind === newsKind) &&
      (reviewFilter === "all" || (reviewFilter === "legacy" ? legacyPending : pending));
  });

  return (
    <section className="news-page panel-pop">
      <div className="section-head">
        <span>新聞報導</span>
        <h2>{selectedCity || "全部縣市"}</h2>
        <p>{filtered.length} 篇來源報導；篇數不等於事件數。待釐清文章不生成事實摘要；關聯事件的已核對資料另列。</p>
      </div>

      <div className="news-filters">
        <label>新聞類型<select value={newsKind} onChange={(event) => setNewsKind(event.target.value)}>
          <option value="all">全部類型</option>
          {Object.entries(newsKindLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <label>核對狀態<select value={reviewFilter} onChange={(event) => setReviewFilter(event.target.value)}>
          <option value="all">全部狀態</option><option value="pending">待釐清／待核對</option><option value="legacy">歷史待核對</option>
        </select></label>
      </div>

      {newsFocusFilter ? (
        <div className="news-focus-banner">
          <div>
            <span>目前查看</span>
            <strong>{newsFocusFilter.label}</strong>
          </div>
          <button type="button" onClick={onClearFocus}>
            清除篩選
          </button>
        </div>
      ) : null}

      <div className="news-list">
        {filtered.length ? (
          filtered.map((article) => {
            const linked = [...new Set([...(article.eventIds || []), ...(article.archivedEventIds || [])])].map((id) => incidentsById.get(id)).filter(Boolean);
            const legacyPending = linked.some((item) => isLegacyIncident(item) && !isStatsIncident(item));
            const pendingEvents = linked.filter((item) => !isLegacyIncident(item) && !isStatsIncident(item));
            const readableEvents = linked.filter(isStatsIncident);
            const canShowDetails = article.status === "verified" || article.legacy;
            return <article className="news-card" key={article.url || article.id}>
              <div className="news-meta">
                <span>{newsKindLabels[article.kind] || "其他"}</span>
                <span>{article.city || "全國／縣市未明"}</span>
                <span>發布 {formatDate(article.publishedAt) || "未明"}</span>
                <span>{article.source || "來源未提供"}</span>
                <span>{impairmentLabel(article)}{article.legacy ? "（歷史分類）" : ""}</span>
                <span className={`quality-badge ${article.status === "verified" ? "ok" : "review"}`}>
                  {article.legacy ? legacyPending ? "歷史待核對" : "歷史來源" : article.status === "verified" ? "已通過新聞發布條件" : "待釐清"}
                </span>
                {!article.legacy && legacyPending ? <span className="quality-badge review">另有歷史待核對紀錄</span> : null}
              </div>
              <h3><a href={article.url} target="_blank" rel="noreferrer">{article.title}</a></h3>
              {article.status !== "verified" && !article.legacy ? <p className="news-status-note">本篇有資訊待釐清，僅刊登來源；下方若有關聯事件，列出的是已核對資料，不將本篇未確認的新主張加入統計。</p> : null}
              {legacyPending ? <p className="news-status-note">保留歷史來源；其中 {linked.filter((item) => isLegacyIncident(item) && !isStatsIncident(item)).length} 筆歷史紀錄待核對，已排除統計。</p> : null}
              {pendingEvents.length ? <p className="news-status-note">另有 {pendingEvents.length} 筆關聯事件未達統計條件，暫不呈現事實摘要或加總傷亡。</p> : null}
              {readableEvents.length ? <div className="news-events">
                <strong>關聯事件已核對資料</strong>
                {readableEvents.map((incident) => <section className="news-event" key={incident.id}>
                  <div className="news-event-head"><strong>{incident.city || "縣市未明"}｜{impairmentLabel(incident, isLegacyIncident(incident))}</strong><QualityBadge incident={incident} /></div>
                  <p>發生：{formatDate(incident.occurredAt) || "未明"}｜來源發布：{formatDate(incident.publishedAt) || "未明"}</p>
                  <p>死亡 {casualtyText(incident, "deaths")}｜受傷 {casualtyText(incident, "injuries")} {isMapIncident(incident) ? "・可納縣市彙總" : "・未納地圖"}</p>
                  <small>事件 ID：{incident.id}；同案後續報導不另計一件。</small>
                  {canShowDetails && (incident.extractedDetails || incident.humanImpact) ? <details className="event-detail-tags">
                    <summary>查看既有事件標籤</summary>
                    <p>標籤來自資料整理，不等於司法認定；歷史資料未經本次機器重新核對。</p>
                    <IncidentProfilePanel incident={incident} />
                    <AffectedDailyLife incident={incident} />
                    <FamilyImpactNote incident={incident} />
                  </details> : null}
                </section>)}
              </div> : null}
              <div className="news-footer">
                <span>{article.issues?.length ? `${article.issues.length} 項待釐清紀錄` : "請以原文及後續報導核對"}</span>
                <a href={article.url} target="_blank" rel="noreferrer">
                  閱讀原文
                </a>
              </div>
            </article>;
          })
        ) : (
          <div className="empty-panel">目前篩選條件沒有新聞</div>
        )}
      </div>
    </section>
  );
}

export default function App() {
  const { incidents, suspects, articles, newsStatus, newsBuild, loading } = useDashboardData();
  const [activeView, setActiveView] = useState("news");
  const [impairmentFilter, setImpairmentFilter] = useState("all");
  const [newsKind, setNewsKind] = useState("all");
  const [reviewFilter, setReviewFilter] = useState("all");
  const [selectedMonths, setSelectedMonths] = useState([]);
  const [selectedSources, setSelectedSources] = useState([]);
  const [visibleTypes, setVisibleTypes] = useState({ deaths: true, injuries: true });
  const [selectedCity, setSelectedCity] = useState("");
  const [newsFocusFilter, setNewsFocusFilter] = useState(null);
  const didInitMonths = useRef(false);
  const didInitSources = useRef(false);
  const mainContentRef = useRef(null);
  const didAutoScrollRef = useRef(false);
  const newsArticles = useMemo(() => articleFeed(articles, incidents), [articles, incidents]);
  const incidentsById = useMemo(() => new Map(incidents.map((incident) => [incident.id, incident])), [incidents]);

  const months = useMemo(
    () => [...new Set([...incidents, ...newsArticles].map((item) => item.publishedAt?.slice(0, 7)).filter(Boolean))].sort().reverse(),
    [incidents, newsArticles]
  );

  const sources = useMemo(() => [...new Set([...incidents, ...newsArticles].map((item) => item.source).filter(Boolean))].sort(), [incidents, newsArticles]);

  useEffect(() => {
    if (months.length && !didInitMonths.current) {
      setSelectedMonths(months);
      didInitMonths.current = true;
    }
  }, [months]);

  useEffect(() => {
    if (sources.length && !didInitSources.current) {
      setSelectedSources(sources);
      didInitSources.current = true;
    }
  }, [sources]);

  useEffect(() => {
    if (!didAutoScrollRef.current) {
      didAutoScrollRef.current = true;
      return;
    }

    if (window.matchMedia("(max-width: 760px)").matches) {
      window.requestAnimationFrame(() => {
        mainContentRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    }
  }, [activeView]);

  const selectedMonthIncidents = useMemo(() => {
    return incidents.filter((incident) => {
      const month = incident.publishedAt?.slice(0, 7);
      return selectedMonths.includes(month) && selectedSources.includes(incident.source) &&
        matchesImpairment(incident, impairmentFilter, isLegacyIncident(incident));
    });
  }, [incidents, selectedMonths, selectedSources, impairmentFilter]);

  const monthSourceIncidents = useMemo(
    () => selectedMonthIncidents.filter(isStatsIncident),
    [selectedMonthIncidents]
  );

  const cityFilteredAllIncidents = useMemo(() => {
    return selectedCity ? selectedMonthIncidents.filter((incident) => incident.city === selectedCity) : selectedMonthIncidents;
  }, [selectedCity, selectedMonthIncidents]);

  const visibleIncidents = useMemo(() => {
    return selectedCity ? monthSourceIncidents.filter((incident) => incident.city === selectedCity) : monthSourceIncidents;
  }, [monthSourceIncidents, selectedCity]);

  const mapIncidents = useMemo(() => visibleIncidents.filter(isMapIncident), [visibleIncidents]);

  const focusedNewsIncidents = useMemo(() => {
    if (!newsFocusFilter) return cityFilteredAllIncidents;

    return cityFilteredAllIncidents.filter((incident) => {
      if (newsFocusFilter.type === "familyRole") {
        return incident.humanImpact?.victimFamilyRoles?.includes(newsFocusFilter.value);
      }

      if (newsFocusFilter.type === "householdImpact") {
        return incident.humanImpact?.possibleHouseholdImpacts?.includes(newsFocusFilter.value);
      }

      if (newsFocusFilter.type === "victimActivity") {
        return incident.extractedDetails?.victim?.activities?.includes(newsFocusFilter.value);
      }

      return true;
    });
  }, [cityFilteredAllIncidents, newsFocusFilter]);

  const visibleArticles = useMemo(() => {
    const focusedIds = new Set(focusedNewsIncidents.map((item) => item.id));
    return newsArticles.filter((article) => {
      const linkedIds = [...(article.eventIds || []), ...(article.archivedEventIds || [])];
      const cityMatches = !selectedCity || article.city === selectedCity || linkedIds.some((id) => incidentsById.get(id)?.city === selectedCity);
      return selectedMonths.includes(article.publishedAt?.slice(0, 7)) && selectedSources.includes(article.source) &&
        matchesImpairment(article, impairmentFilter) && cityMatches &&
        (!newsFocusFilter || linkedIds.some((id) => focusedIds.has(id)));
    });
  }, [newsArticles, focusedNewsIncidents, selectedCity, incidentsById, selectedMonths, selectedSources, impairmentFilter, newsFocusFilter]);

  const handleFocusNews = (filter) => {
    setNewsFocusFilter(filter);
    setNewsKind("all");
    setReviewFilter("all");
    setActiveView("news");
  };

  const ranking = useMemo(
    () => buildCityRanking(monthSourceIncidents.filter(isMapIncident)),
    [monthSourceIncidents]
  );

  const cityLevels = useMemo(() => {
    return new Map(ranking.map((item, index) => [item.city, rankingLevel(item, index)]));
  }, [ranking]);

  const metrics = useMemo(() => {
    const topCity = ranking.find((item) => item.score > 0)?.city || "無資料";

    return {
      ...incidentTotals(visibleIncidents),
      topCity,
    };
  }, [ranking, visibleIncidents]);

  const latestIncident = useMemo(() => {
    return [...visibleIncidents]
      .filter(isStatsIncident)
      .sort((a, b) => String(b.publishedAt || "").localeCompare(String(a.publishedAt || "")))[0];
  }, [visibleIncidents]);

  const visibleNewsCount = visibleArticles.length;
  const excludedCount = cityFilteredAllIncidents.length - visibleIncidents.length;
  const legacyPendingCount = cityFilteredAllIncidents.filter((item) => isLegacyIncident(item) && !isStatsIncident(item)).length;
  const legacyStatsCount = visibleIncidents.filter(isLegacyIncident).length;

  const dataStatus = newsStatus || {};

  const insights = useMemo(() => {
    const citySummary = ranking;
    const topEventCity = citySummary.find((item) => item.score > 0)?.city || "無資料";
    const topDeathCity = [...citySummary].sort((a, b) => b.deaths - a.deaths || b.events - a.events)[0]?.deaths
      ? [...citySummary].sort((a, b) => b.deaths - a.deaths || b.events - a.events)[0].city
      : "無資料";
    const topInjuryCity = [...citySummary].sort((a, b) => b.injuries - a.injuries || b.events - a.events)[0]?.injuries
      ? [...citySummary].sort((a, b) => b.injuries - a.injuries || b.events - a.events)[0].city
      : "無資料";

    return {
      topEventCity,
      topDeathCity,
      topInjuryCity,
    };
  }, [ranking]);

  return (
    <div className="app-shell">
      <header className="app-hero">
        <div>
          <span>新聞事件與公開統計整理</span>
          <h1>酒駕與毒駕新聞觀察</h1>
          <p>
            看見事件，也看見被影響的人。每一個死亡與受傷，背後都可能是一段正在回家的路、一次平凡的出門，
            或一個家庭再也回不去的日常。
          </p>
        </div>

        <nav className="view-tabs" aria-label="頁面切換">
          <button type="button" className={activeView === "life" ? "active" : ""} onClick={() => setActiveView("life")}>
            生命影響
          </button>
          <button type="button" className={activeView === "map" ? "active" : ""} onClick={() => setActiveView("map")}>
            地圖
          </button>
          <button
            type="button"
            className={activeView === "trend" ? "active" : ""}
            onClick={() => setActiveView("trend")}
          >
            縣市趨勢
          </button>
          <button
            type="button"
            className={activeView === "caseStats" ? "active" : ""}
            onClick={() => setActiveView("caseStats")}
          >
            案件統計
          </button>
          <button
            type="button"
            className={activeView === "news" ? "active" : ""}
            onClick={() => {
              setNewsFocusFilter(null);
              setActiveView("news");
            }}
          >
            新聞列表
          </button>
        </nav>
      </header>

      <DataStatusBar status={dataStatus} build={newsBuild} />

      <DataCoveragePanel
        newsStatus={dataStatus}
        selectedMonths={selectedMonths}
        months={months}
        setSelectedMonths={setSelectedMonths}
      />

      <section className="global-news-filters panel-pop" aria-label="共同資料篩選">
        <label>酒／毒類別<select value={impairmentFilter} onChange={(event) => setImpairmentFilter(event.target.value)}>
          <option value="all">全部（同案只計一次）</option><option value="alcohol">酒駕（含同案兩者）</option>
          <option value="drug">毒駕（含同案兩者）</option><option value="both">同案涉及酒駕與毒駕</option>
        </select></label>
        <label>縣市<select value={selectedCity} onChange={(event) => setSelectedCity(event.target.value)}>
          <option value="">全部縣市／全國新聞</option>{cities.map((city) => <option key={city} value={city}>{city}</option>)}
        </select></label>
        <fieldset><legend>新聞來源</legend>{sources.map((source) => <label key={source}>
          <input type="checkbox" checked={selectedSources.includes(source)} onChange={() => setSelectedSources((current) => current.includes(source) ? current.filter((value) => value !== source) : [...current, source])} />{source}
        </label>)}</fieldset>
        <p>月份篩選以新聞發布日為準；發生日另列。兩類可重疊，全部事件按 ID 去重，分類數不能直接相加。</p>
      </section>

      <section className="stats-eligibility-note panel-pop" aria-label="統計資格與排除紀錄">
        <div>
          <strong>目前範圍：{metrics.events} 件納入統計，{excludedCount} 筆排除</strong>
          <p>排除中含 {legacyPendingCount} 筆「歷史待核對」，來源仍保留。納入中有 {legacyStatsCount} 件歷史舊口徑資料，未升格為機器核對。
            已確認事件的個別欄位待釐清不阻擋計件；傷亡衝突沿用既有核對值，沒有既有值則列未明。
            新聞文章本身不計件；政策、判決、統計報導不直接增加事件。符合地圖條件 {mapIncidents.length} 件。</p>
        </div>
        <button type="button" onClick={() => { setNewsFocusFilter(null); setNewsKind("all"); setReviewFilter("legacy"); setActiveView("news"); }}>查看歷史待核對</button>
      </section>

      <section className="metric-grid">
        <Metric label="納入統計事件" value={metrics.events} tone="neutral" helper="同案按 ID 去重；各分頁相同口徑" />
        <Metric label="已知死亡人數" value={metrics.deaths} tone="danger" helper={`${casualtyCoverage(metrics, "deaths")}；未明欄位不加總`} />
        <Metric label="已知受傷人數" value={metrics.injuries} tone="warning" helper={`${casualtyCoverage(metrics, "injuries")}；未明欄位不加總`} />
        <LatestIncidentMetric incident={latestIncident} />
      </section>

      <InsightStrip insights={insights} />

      <MobileSummaryBar
        status={dataStatus}
        metrics={metrics}
        latestIncident={latestIncident}
        selectedCity={selectedCity}
      />

      <InterruptedDailyLifeSection incidents={visibleIncidents} onFocusNews={handleFocusNews} />

      <div className="desktop-month-wrap">
        <GlobalMonthBar
          months={months}
          selectedMonths={selectedMonths}
          setSelectedMonths={setSelectedMonths}
        />
      </div>

      <div ref={mainContentRef} className="main-content-anchor">
        <PageContextBar
          activeView={activeView}
          selectedCity={selectedCity}
          metrics={metrics}
          selectedMonths={selectedMonths}
          months={months}
          newsCount={visibleNewsCount}
        />
      </div>

      <section className={`hero-grid ${activeView === "trend" ? "trend-mode" : ""}`}>
        <div className="main-column">
          {loading ? (
            <div className="loading panel-pop">資料載入中</div>
          ) : activeView === "life" ? (
            <LifeImpactPage
              incidents={visibleIncidents}
              selectedCity={selectedCity}
              onFocusNews={handleFocusNews}
            />
          ) : activeView === "map" ? (
            <TaiwanMap
              incidents={mapIncidents}
              visibleTypes={visibleTypes}
              selectedCity={selectedCity}
              cityLevels={cityLevels}
              onSelectCity={setSelectedCity}
            />
          ) : activeView === "trend" ? (
            <CityTrendPage
              months={months}
              selectedMonths={selectedMonths}
              incidents={monthSourceIncidents}
              suspects={suspects}
              selectedCity={selectedCity}
            />
          ) : activeView === "caseStats" ? (
            <CaseStatsPage
              allIncidents={selectedMonthIncidents}
              statsIncidents={monthSourceIncidents}
              selectedCity={selectedCity}
            />
          ) : (
            <NewsListPage
              articles={visibleArticles}
              incidentsById={incidentsById}
              selectedCity={selectedCity}
              newsFocusFilter={newsFocusFilter}
              onClearFocus={() => setNewsFocusFilter(null)}
              newsKind={newsKind}
              setNewsKind={setNewsKind}
              reviewFilter={reviewFilter}
              setReviewFilter={setReviewFilter}
            />
          )}
        </div>

        <div className="side-column">
          <ControlPanel
            months={months}
            selectedMonths={selectedMonths}
            setSelectedMonths={setSelectedMonths}
            sources={sources}
            selectedSources={selectedSources}
            setSelectedSources={setSelectedSources}
            visibleTypes={visibleTypes}
            setVisibleTypes={setVisibleTypes}
            ranking={ranking}
            selectedCity={selectedCity}
            onSelectCity={setSelectedCity}
            showRanking={activeView === "map"}
            activeView={activeView}
            metrics={metrics}
            insights={insights}
          />

        </div>
      </section>

      <div className="mobile-month-wrap">
        <GlobalMonthBar
          months={months}
          selectedMonths={selectedMonths}
          setSelectedMonths={setSelectedMonths}
        />
      </div>

      <footer className="data-note data-footer panel-pop">
        <section>
          <span>資料來源</span>
          <h2>資料來源與免責聲明</h2>
          <p>
            本網站之毒品嫌疑犯人數資料整理自內政部警政署公開統計資料；酒駕與毒駕新聞依來源報導整理，
            區分機器規則核對、人工核對、歷史資料與待釐清狀態。新聞通過發布條件不等於司法認定。
          </p>
        </section>

        <section className="footer-grid">
          <article>
            <h3>主要資料來源</h3>
            <ul>
              <li>內政部警政署全球資訊網｜警政統計</li>
              <li>內政部警政署統計室公開資料</li>
              <li>公開新聞報導資料</li>
            </ul>
          </article>

          <article>
            <h3>資料說明</h3>
            <p>
              新聞事件資料僅代表來源涵蓋且經整理之案例，不等同官方完整事故統計。毒品嫌疑犯人數只作獨立背景資料，
              不代表酒駕或毒駕事故數，不參與地圖事件數排序，也不代表縣市風險。
            </p>
          </article>

          <article>
            <h3>免責聲明</h3>
            <p>
              本網站之圖表與縣市事件數排序為資料視覺化結果，僅供公共議題觀察與參考，
              不代表內政部警政署或其他政府機關之官方結論、排名或評等。
            </p>
          </article>
        </section>

        <p className="footer-note">
          使用者引用、轉載或延伸使用本網站資料時，應自行查證原始資料來源與最新官方資訊。
        </p>
      </footer>
    </div>
  );
}
