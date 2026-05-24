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
const iconMap = { death: "☠️", injury: "🩼" };

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

function isStatsIncident(incident) {
  return incident.dataQuality?.includeInStats !== false;
}

function qualityLabel(incident) {
  if (incident.dataQuality?.includeInStats === false) return "排除統計";
  if (incident.dataQuality?.flags?.includes("count_corrected")) return "已校正";
  if (incident.dataQuality?.needsHumanReview) return "需複核";
  return "可統計";
}

function qualityTone(incident) {
  if (incident.dataQuality?.includeInStats === false) return "excluded";
  if (incident.dataQuality?.flags?.includes("count_corrected")) return "corrected";
  if (incident.dataQuality?.needsHumanReview) return "review";
  return "ok";
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

async function loadJson(filePath, fallback) {
  try {
    const response = await fetch(filePath);
    if (!response.ok) throw new Error(`${filePath} ${response.status}`);
    return await response.json();
  } catch (error) {
    console.warn(error);
    return fallback;
  }
}

function useDashboardData() {
  const [data, setData] = useState({ incidents: [], suspects: [], loading: true });

  useEffect(() => {
    let alive = true;
    const baseUrl = import.meta.env.BASE_URL;

    Promise.all([
      loadJson(`${baseUrl}data/incidents.json`, []),
      loadJson(`${baseUrl}data/drug_suspects_monthly.json`, []),
    ]).then(([incidents, suspects]) => {
      if (alive) setData({ incidents, suspects, loading: false });
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

function buildCityRanking(incidents, suspects, months) {
  const selectedMonthSet = new Set(months);

  return cities
    .map((city) => {
      const cityIncidents = incidents.filter((incident) => incident.city === city);
      const deaths = cityIncidents.reduce((sum, item) => sum + Number(item.deaths || 0), 0);
      const injuries = cityIncidents.reduce((sum, item) => sum + Number(item.injuries || 0), 0);
      const suspectTotal = suspects
        .filter((row) => row.city === city && selectedMonthSet.has(row.month))
        .reduce((sum, row) => sum + Number(row.suspects || 0), 0);
      const score = deaths * 3 + injuries + cityIncidents.length * 1.5 + suspectTotal / 260;

      return {
        city,
        deaths,
        injuries,
        events: cityIncidents.length,
        suspectTotal,
        score,
      };
    })
    .sort((a, b) => b.score - a.score || b.deaths - a.deaths || b.injuries - a.injuries);
}

function rankingLevel(item, index) {
  if (item.score <= 0) return "low";
  if (index < 3 || item.deaths >= 3) return "high";
  if (index < 8 || item.deaths + item.injuries > 0) return "medium";
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
        <span>{formatDate(incident.publishedAt)}</span>
        <span>{incident.source}</span>
      </div>
      <h3>{incident.title}</h3>
      <p className="hover-stats">
        死亡 {incident.deaths}｜受傷 {incident.injuries}
      </p>
      <p>{incident.summary}</p>
      <small>點擊圖示開啟新聞頁面</small>
    </div>
  );
}

function CityIncidentBadge({ type, count, x, y, incident, onHover, onMove, onLeave, onSelectCity }) {
  const icon = iconMap[type];
  const label = type === "death" ? "死亡" : "受傷";
  const width = count >= 100 ? 82 : count >= 10 ? 72 : 62;
  const severity = count >= 10 ? "major" : count >= 3 ? "medium" : "minor";

  return (
    <g
      className={`city-incident-badge badge-${type} badge-${severity}`}
      tabIndex="0"
      role="button"
      aria-label={`${incident.city}${label}${count}人`}
      transform={`translate(${x} ${y})`}
      onClick={() => onSelectCity(incident.city)}
      onMouseEnter={(event) => onHover(event, incident)}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") onSelectCity(incident.city);
      }}
    >
      <rect x={-width / 2} y="-18" width={width} height="34" rx="17" />
      <text x="0" y="5" textAnchor="middle">
        {icon}×{count}
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

  const mapBounds = defaultMapBounds;

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

      current.deaths += Number(incident.deaths || 0);
      current.injuries += Number(incident.injuries || 0);
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
        aria-label="台灣毒駕事件地圖"
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
                aria-label={`${location.city} 風險${levelLabel(risk)}`}
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
        <h3>縣市排名</h3>
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
                {item.events} 件，死亡 {item.deaths}，受傷 {item.injuries}
              </span>
            </div>
            <em className={`level-badge ${level}`}>{levelLabel(level)}</em>
          </button>
        );
      })}
    </section>
  );
}


function DataStatusBar({ status }) {
  return (
    <section className="data-status-bar panel-pop" aria-label="資料狀態">
      <div>
        <span>資料更新</span>
        <strong>{status.latestDate || "尚無資料"}</strong>
      </div>
      <div>
        <span>新聞事件</span>
        <strong>{status.totalIncidents.toLocaleString()} 筆</strong>
      </div>
      <div>
        <span>統計月份</span>
        <strong>{status.monthRange || "尚無資料"}</strong>
      </div>
    </section>
  );
}

function InsightStrip({ insights }) {
  const items = [
    {
      label: "最高風險",
      value: insights.topRiskCity,
      text: `綜合死傷、事件數與毒品嫌疑犯背景數，目前排序最高。`,
    },
    {
      label: "死亡集中",
      value: insights.topDeathCity,
      text: `篩選期間內，新聞事件死亡人數最高的縣市。`,
    },
    {
      label: "受傷集中",
      value: insights.topInjuryCity,
      text: `篩選期間內，新聞事件受傷人數最高的縣市。`,
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
        <span className="legend-pill death-pill">☠️×數字</span>
        <p>死亡人數</p>
      </div>

      <div className="legend-row">
        <span className="legend-pill injury-pill">🩼×數字</span>
        <p>受傷人數</p>
      </div>

      <div className="legend-row">
        <span className="risk-dot high" />
        <p>高風險縣市</p>
      </div>

      <div className="legend-row">
        <span className="risk-dot medium" />
        <p>中風險縣市</p>
      </div>

      <div className="legend-row">
        <span className="risk-dot low" />
        <p>低風險縣市</p>
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
          <dd>死亡 {metrics.deaths}｜受傷 {metrics.injuries}</dd>
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
          <span>資料月份</span>
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
        <h2>{activeView === "map" ? "地圖控制" : activeView === "trend" ? "趨勢篩選" : activeView === "caseStats" ? "案件統計" : "新聞篩選"}</h2>
        <p>上方月份列與縣市選取會同步影響地圖、趨勢圖與新聞列表。</p>
      </div>

      <section className="tool-section focus-card">
        <h3>本期觀察重點</h3>
        <ul>
          <li>
            <span>最高風險</span>
            <strong>{insights.topRiskCity || "無資料"}</strong>
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
                  {toShortMonthLabel(row.month)} 死亡 {row.deaths}
                </title>
              </circle>
              <circle className="injury-dot" cx={x} cy={yTopOf(row.injuries)} r="4">
                <title>
                  {toShortMonthLabel(row.month)} 受傷 {row.injuries}
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
    const monthList = selectedMonths.length ? [...selectedMonths].sort() : [...months].sort();

    return monthList.map((month) => {
      const filteredIncidents = incidents.filter((incident) => {
        return incident.publishedAt?.slice(0, 7) === month && (!selectedCity || incident.city === selectedCity);
      });

      const deaths = filteredIncidents.reduce((sum, item) => sum + Number(item.deaths || 0), 0);
      const injuries = filteredIncidents.reduce((sum, item) => sum + Number(item.injuries || 0), 0);
      const suspectTotal = suspects
        .filter((row) => row.month === month && (!selectedCity || row.city === selectedCity))
        .reduce((sum, row) => sum + Number(row.suspects || 0), 0);

      return {
        month,
        deaths,
        injuries,
        suspects: suspectTotal,
      };
    });
  }, [months, selectedMonths, incidents, suspects, selectedCity]);

  const totals = useMemo(() => {
    return rows.reduce(
      (summary, row) => ({
        deaths: summary.deaths + row.deaths,
        injuries: summary.injuries + row.injuries,
        suspects: summary.suspects + row.suspects,
      }),
      { deaths: 0, injuries: 0, suspects: 0 }
    );
  }, [rows]);

  return (
    <section className="trend-page panel-pop">
      <div className="trend-page-header">
        <div>
          <span>縣市趨勢</span>
          <h2>{selectedCity || "全部縣市"}</h2>
          <p>
            死亡與受傷來自新聞事件整理；毒品嫌疑犯人數為公開統計背景資料。
            中間以波浪號區隔，代表兩者量級差距大，不建議直接相加比較。
          </p>

        </div>

        <div className="trend-summary">
          <div>
            <small>死亡</small>
            <b>{totals.deaths}</b>
          </div>
          <div>
            <small>受傷</small>
            <b>{totals.injuries}</b>
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
              死亡人數
            </span>
            <span>
              <i className="legend-injury" />
              受傷人數
            </span>
            <span>
              <i className="legend-suspect" />
              毒品嫌疑犯人數
            </span>
          </div>

          <TrendBreakChart rows={rows} />
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
          <span>毒駕者輪廓</span>
          <strong>{driverIdentity.length ? driverIdentity.join("・") : "身分資訊未明"}</strong>
        </div>

        <div className="profile-block">
          <small>毒駕載具</small>
          <ProfileTagList
            values={driver.primaryVehicleLabel || driver.primaryVehicleType}
            fallback="毒駕載具未明"
            tone="vehicle"
          />
        </div>

        <div className="profile-block">
          <small>毒品 / 檢測</small>
          <ProfileTagList
            values={[...(drug.keywords || []), ...(drug.testMethods || [])]}
            fallback="毒品類型未明"
            tone="drug"
          />
        </div>

        <div className="profile-block">
          <small>行為型態</small>
          <ProfileTagList values={crash.scenarioTypes || []} fallback="肇事型態未明" tone="scenario" />
        </div>
      </article>

      <article className="profile-card victim-profile">
        <div className="profile-card-head">
          <span>受害者輪廓</span>
          <strong>
            死亡 {incident.deaths}｜受傷 {incident.injuries}
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
        <p>僅統計目前可判讀之毒駕者資料，未明資料另列。</p>
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
        <span>毒駕者輪廓統計</span>
        <h2>{selectedCity || "全部縣市"}｜毒駕者年齡與性別</h2>
        <p>聚焦毒駕者本身，不混入受害者資料；切換縣市後會同步更新。</p>
      </div>

      <div className="offender-kpis">
        <article>
          <small>毒駕案件</small>
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
          title="毒駕者年齡分布"
          rows={ageRows}
          centerValue={ageKnownCount}
          centerLabel="年齡可判讀"
          tone="age"
        />
        <DonutChartCard
          title="毒駕者性別分布"
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
  const corrected = allIncidents.filter((item) => item.dataQuality?.flags?.includes("count_corrected")).length;
  const excluded = allIncidents.filter((item) => item.dataQuality?.includeInStats === false).length;
  const needsReview = allIncidents.filter((item) => item.dataQuality?.needsHumanReview).length;

  return (
    <section className="quality-summary-card panel-pop">
      <div>
        <span>資料品質</span>
        <h2>{selectedCity || "全部縣市"}｜統計口徑已更新</h2>
        <p>
          完整新聞列表保留所有案件；KPI、地圖、縣市排名與趨勢圖僅採用「建議納入統計」案件，
          避免後續報導、評論文章或重複報導影響死傷數。
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
          <small>已校正</small>
          <strong>{corrected}</strong>
        </article>
        <article>
          <small>排除統計</small>
          <strong>{excluded}</strong>
        </article>
        <article>
          <small>需複核</small>
          <strong>{needsReview}</strong>
        </article>
      </div>
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
    { label: "可統計", value: scopedAllIncidents.filter((item) => qualityTone(item) === "ok").length },
    { label: "已校正", value: scopedAllIncidents.filter((item) => qualityTone(item) === "corrected").length },
    { label: "需複核", value: scopedAllIncidents.filter((item) => qualityTone(item) === "review").length },
    { label: "排除統計", value: scopedAllIncidents.filter((item) => qualityTone(item) === "excluded").length },
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
        <StatBars title="毒駕載具" rows={vehicleRows} tone="vehicle" />
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

function NewsListPage({ incidents, selectedCity }) {
  return (
    <section className="news-page panel-pop">
      <div className="section-head">
        <span>新聞報導</span>
        <h2>{selectedCity || "全部縣市"}</h2>
        <p>{incidents.length} 篇</p>
      </div>

      <div className="news-list">
        {incidents.length ? (
          incidents.map((incident) => (
            <article className="news-card" key={incident.id}>
              <div className="news-meta">
                <span>{incident.city}</span>
                <span>{formatDate(incident.publishedAt)}</span>
                <span>{incident.source}</span>
                <QualityBadge incident={incident} />
              </div>
              <h3>{incident.title}</h3>
              <p>{incident.summary}</p>
              <IncidentProfilePanel incident={incident} />
              {incident.dataQuality?.reviewNote ? (
                <p className="news-quality-note">{incident.dataQuality.reviewNote}</p>
              ) : null}

              <div className="news-footer">
                <span>
                  死亡 {incident.deaths}｜受傷 {incident.injuries}
                </span>
                <a href={incident.url} target="_blank" rel="noreferrer">
                  閱讀原文
                </a>
              </div>
            </article>
          ))
        ) : (
          <div className="empty-panel">目前篩選條件沒有新聞</div>
        )}
      </div>
    </section>
  );
}

export default function App() {
  const { incidents, suspects, loading } = useDashboardData();
  const [activeView, setActiveView] = useState("map");
  const [selectedMonths, setSelectedMonths] = useState([]);
  const [selectedSources, setSelectedSources] = useState([]);
  const [visibleTypes, setVisibleTypes] = useState({ deaths: true, injuries: true });
  const [selectedCity, setSelectedCity] = useState("");
  const didInitMonths = useRef(false);
  const didInitSources = useRef(false);

  const months = useMemo(
    () => [...new Set(incidents.map((incident) => incident.publishedAt.slice(0, 7)))].sort().reverse(),
    [incidents]
  );

  const sources = useMemo(() => [...new Set(incidents.map((incident) => incident.source))].sort(), [incidents]);

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

  const selectedMonthIncidents = useMemo(() => {
    return incidents.filter((incident) => {
      const month = incident.publishedAt.slice(0, 7);
      return selectedMonths.includes(month) && selectedSources.includes(incident.source);
    });
  }, [incidents, selectedMonths, selectedSources]);

  const monthSourceIncidents = useMemo(
    () => selectedMonthIncidents.filter(isStatsIncident),
    [selectedMonthIncidents]
  );

  const visibleIncidents = useMemo(() => {
    const base = activeView === "news" ? selectedMonthIncidents : monthSourceIncidents;
    return selectedCity ? base.filter((incident) => incident.city === selectedCity) : base;
  }, [activeView, monthSourceIncidents, selectedCity, selectedMonthIncidents]);

  const ranking = useMemo(
    () => buildCityRanking(monthSourceIncidents, suspects, selectedMonths),
    [monthSourceIncidents, selectedMonths, suspects]
  );

  const cityLevels = useMemo(() => {
    return new Map(ranking.map((item, index) => [item.city, rankingLevel(item, index)]));
  }, [ranking]);

  const metrics = useMemo(() => {
    const deaths = visibleIncidents.reduce((sum, item) => sum + Number(item.deaths || 0), 0);
    const injuries = visibleIncidents.reduce((sum, item) => sum + Number(item.injuries || 0), 0);
    const topCity = ranking.find((item) => item.score > 0)?.city || "無資料";

    return {
      deaths,
      injuries,
      events: visibleIncidents.length,
      topCity,
    };
  }, [ranking, visibleIncidents]);

  const dataStatus = useMemo(() => {
    const dates = incidents.map((incident) => incident.publishedAt).filter(Boolean).sort();
    const latestDate = dates.length ? formatDate(dates.at(-1)) : "";
    const monthRange = months.length ? `${toShortMonthLabel(months.at(-1))} - ${toShortMonthLabel(months[0])}` : "";

    return {
      latestDate,
      monthRange,
      totalIncidents: incidents.length,
    };
  }, [incidents, months]);

  const insights = useMemo(() => {
    const citySummary = buildCityRanking(monthSourceIncidents, suspects, selectedMonths);
    const topRiskCity = citySummary.find((item) => item.score > 0)?.city || "無資料";
    const topDeathCity = [...citySummary].sort((a, b) => b.deaths - a.deaths || b.events - a.events)[0]?.deaths
      ? [...citySummary].sort((a, b) => b.deaths - a.deaths || b.events - a.events)[0].city
      : "無資料";
    const topInjuryCity = [...citySummary].sort((a, b) => b.injuries - a.injuries || b.events - a.events)[0]?.injuries
      ? [...citySummary].sort((a, b) => b.injuries - a.injuries || b.events - a.events)[0].city
      : "無資料";

    return {
      topRiskCity,
      topDeathCity,
      topInjuryCity,
    };
  }, [monthSourceIncidents, selectedMonths, suspects]);

  return (
    <div className="app-shell">
      <header className="app-hero">
        <div>
          <span>新聞事件與公開統計整理</span>
          <h1>全台毒駕死傷地圖</h1>
          <p>
            以品質校正後的新聞死傷事件與毒品嫌疑犯公開統計為基礎，建立可互動、可篩選、可追蹤趨勢的公共安全資料儀表板。
          </p>
        </div>

        <nav className="view-tabs" aria-label="頁面切換">
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
          <button type="button" className={activeView === "news" ? "active" : ""} onClick={() => setActiveView("news")}>
            新聞列表
          </button>
        </nav>
      </header>

      <DataStatusBar status={dataStatus} />

      <section className="metric-grid">
        <Metric label="新聞事件" value={metrics.events} tone="neutral" helper="目前篩選" />
        <Metric label="死亡人數" value={metrics.deaths} tone="danger" helper="新聞事件整理" />
        <Metric label="受傷人數" value={metrics.injuries} tone="warning" helper="新聞事件整理" />
        <Metric label="最高風險縣市" value={metrics.topCity} tone="accent" helper="綜合排序" />
      </section>

      <InsightStrip insights={insights} />

      <GlobalMonthBar
        months={months}
        selectedMonths={selectedMonths}
        setSelectedMonths={setSelectedMonths}
      />

      <section className={`hero-grid ${activeView === "trend" ? "trend-mode" : ""}`}>
        <div className="main-column">
          {loading ? (
            <div className="loading panel-pop">資料載入中</div>
          ) : activeView === "map" ? (
            <TaiwanMap
              incidents={visibleIncidents}
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
            <NewsListPage incidents={visibleIncidents} selectedCity={selectedCity} />
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

      <footer className="data-note data-footer panel-pop">
        <section>
          <span>資料來源</span>
          <h2>資料來源與免責聲明</h2>
          <p>
            本網站之毒品嫌疑犯人數資料整理自內政部警政署公開統計資料；新聞事件資料則依公開新聞報導人工整理，
            用於呈現毒駕相關死傷事件之地理分布與時間趨勢。
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
              新聞事件資料僅代表已公開報導且經整理之案例，不等同官方完整事故統計。毒品嫌疑犯人數為背景風險觀察指標，
              不代表毒駕事故發生數，也不應直接解讀為單一縣市之毒駕風險。
            </p>
          </article>

          <article>
            <h3>免責聲明</h3>
            <p>
              本網站之圖表、縣市排名與風險分級為資料視覺化結果，僅供公共議題觀察與參考，
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
