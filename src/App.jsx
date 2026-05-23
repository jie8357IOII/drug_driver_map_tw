import taiwanMap from "@svg-maps/taiwan";
import React, { useEffect, useMemo, useRef, useState } from "react";

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
const mainIslandBounds = [360, 250, 650, 980];
const iconMap = { death: "☠️", injury: "🩼" };

function toMonthLabel(month) {
  const [year, monthNum] = month.split("-");
  return `${year}/${monthNum}`;
}

function formatDate(dateText) {
  if (!dateText) return "";
  return dateText.replaceAll("-", "/");
}

function levelLabel(level) {
  if (level === "high") return "高";
  if (level === "medium") return "中";
  return "低";
}

function zoomedViewBox(zoom) {
  const [x, y, width, height] = mainIslandBounds;
  const nextWidth = width / zoom;
  const nextHeight = height / zoom;
  return `${x + (width - nextWidth) / 2} ${y + (height - nextHeight) / 2} ${nextWidth} ${nextHeight}`;
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

function Metric({ label, value, tone }) {
  return (
    <div className={`metric ${tone || ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function buildCityRanking(incidents, suspects, months) {
  const selectedMonthSet = new Set(months);
  return cities
    .map((city) => {
      const cityIncidents = incidents.filter((incident) => incident.city === city);
      const deaths = cityIncidents.reduce((sum, item) => sum + item.deaths, 0);
      const injuries = cityIncidents.reduce((sum, item) => sum + item.injuries, 0);
      const suspectTotal = suspects
        .filter((row) => row.city === city && selectedMonthSet.has(row.month))
        .reduce((sum, row) => sum + row.suspects, 0);
      const score = deaths * 3 + injuries + cityIncidents.length * 1.5 + suspectTotal / 260;
      return { city, deaths, injuries, events: cityIncidents.length, suspectTotal, score };
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
    <article
      className="incident-card hover-card"
      style={{
        left: `min(${position.x + 18}px, calc(100% - 340px))`,
        top: `${Math.max(position.y - 12, 12)}px`,
      }}
    >
      <div className="card-meta">
        <span>{incident.city}</span>
        <span>{formatDate(incident.publishedAt)}</span>
        <span>{incident.source}</span>
      </div>
      <h2>{incident.title}</h2>
      <div className="casualties">
        <span className="death-pill">死亡 {incident.deaths}</span>
        <span className="injury-pill">受傷 {incident.injuries}</span>
      </div>
      <p>{incident.summary}</p>
      <span className="open-hint">點擊圖示開啟新聞頁面</span>
    </article>
  );
}

function TaiwanMap({ incidents, visibleTypes, selectedCity, cityLevels, onSelectCity }) {
  const svgRef = useRef(null);
  const panelRef = useRef(null);
  const [cityPositions, setCityPositions] = useState({});
  const [hoverIncident, setHoverIncident] = useState(null);
  const [hoverPosition, setHoverPosition] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const nextPositions = {};
    svgRef.current?.querySelectorAll(".county-shape").forEach((element) => {
      const city = element.dataset.city;
      const box = element.getBBox();
      nextPositions[city] = { x: box.x + box.width / 2, y: box.y + box.height / 2, short: cityShortNames[city] || city };
    });
    setCityPositions(nextPositions);
  }, []);

  const markers = useMemo(() => {
    const items = [];
    const cityCounts = {};
    incidents.forEach((incident) => {
      const position = cityPositions[incident.city];
      if (!position) return;
      const count = cityCounts[incident.city] || 0;
      cityCounts[incident.city] = count + 1;
      const baseOffset = count * 12;

      if (visibleTypes.deaths && incident.deaths > 0) {
        for (let i = 0; i < incident.deaths; i += 1) {
          items.push({
            id: `${incident.id}-death-${i}`,
            type: "death",
            incident,
            x: position.x - 30 + i * 18 + (baseOffset % 34),
            y: position.y - 34 - Math.floor(baseOffset / 18) * 12,
          });
        }
      }

      if (visibleTypes.injuries && incident.injuries > 0) {
        for (let i = 0; i < incident.injuries; i += 1) {
          items.push({
            id: `${incident.id}-injury-${i}`,
            type: "injury",
            incident,
            x: position.x + 30 + i * 16 - (baseOffset % 28),
            y: position.y + 30 + Math.floor(baseOffset / 18) * 12,
          });
        }
      }
    });
    return items;
  }, [cityPositions, incidents, visibleTypes]);

  const updateHoverPosition = (event) => {
    const rect = panelRef.current?.getBoundingClientRect();
    setHoverPosition({ x: rect ? event.clientX - rect.left : 0, y: rect ? event.clientY - rect.top : 0 });
  };

  const openIncident = (incident) => {
    window.open(incident.url, "_blank", "noopener,noreferrer");
  };

  return (
    <section ref={panelRef} className="map-panel map-appear" aria-label="台灣毒駕死傷事件地圖">
      <div className="map-tools" aria-label="地圖縮放">
        <button type="button" aria-label="放大地圖" onClick={() => setZoom((value) => Math.min(2.25, value + 0.25))}>+</button>
        <button type="button" aria-label="縮小地圖" onClick={() => setZoom((value) => Math.max(1, value - 0.25))}>-</button>
        <button type="button" onClick={() => setZoom(1)}>重設</button>
      </div>

      <svg ref={svgRef} className="taiwan-map" viewBox={zoomedViewBox(zoom)} role="img" aria-label="台灣地圖">
        <defs>
          <filter id="softShadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="14" stdDeviation="12" floodColor="#241814" floodOpacity="0.18" />
          </filter>
        </defs>

        <g filter="url(#softShadow)">
          {mapLocations.map((location) => {
            const risk = cityLevels.get(location.city) || "low";
            return (
              <path
                key={location.id}
                className={`county-shape county-${risk} ${selectedCity === location.city ? "selected" : ""}`}
                data-city={location.city}
                d={location.path}
                role="button"
                tabIndex="0"
                onClick={() => onSelectCity(location.city)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") onSelectCity(location.city);
                }}
                aria-label={`${location.city} 風險${levelLabel(risk)}`}
              />
            );
          })}
        </g>

        {Object.entries(cityPositions).map(([city, position]) => (
          <g key={city} className="city-pin">
            <circle cx={position.x} cy={position.y} r="4.5" />
            <text x={position.x + 7} y={position.y + 4}>{position.short}</text>
          </g>
        ))}

        {markers.map((marker) => (
          <g
            key={marker.id}
            className={`map-icon ${marker.type}`}
            transform={`translate(${marker.x} ${marker.y})`}
            role="button"
            tabIndex="0"
            onClick={() => openIncident(marker.incident)}
            onMouseEnter={(event) => {
              setHoverIncident(marker.incident);
              updateHoverPosition(event);
            }}
            onMouseMove={updateHoverPosition}
            onMouseLeave={() => setHoverIncident(null)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") openIncident(marker.incident);
            }}
            aria-label={`${marker.incident.city} ${marker.type === "death" ? "死亡" : "受傷"}事件：${marker.incident.title}`}
          >
            <circle cx="0" cy="0" r="30" />
            <text x="0" y="12" textAnchor="middle">{iconMap[marker.type]}</text>
          </g>
        ))}
      </svg>

      {hoverIncident ? <IncidentHoverCard incident={hoverIncident} position={hoverPosition} /> : null}
    </section>
  );
}

function MiniTrend({ title, rows, valueKey, colorClass }) {
  const width = 340;
  const height = 116;
  const maxValue = Math.max(1, ...rows.map((row) => row[valueKey]));
  const pathData = rows
    .map((row, index) => {
      const x = 32 + (rows.length <= 1 ? 0 : (index / (rows.length - 1)) * 290);
      const y = 88 - (row[valueKey] / maxValue) * 64;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <div className="mini-trend">
      <div className="mini-title">
        <span>{title}</span>
        <b>最高 {maxValue}</b>
      </div>
      <svg className="trend-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title} 折線圖`}>
        <line x1="32" y1="88" x2="322" y2="88" />
        <path className={colorClass} d={pathData} />
        {rows.map((row, index) => {
          const x = 32 + (rows.length <= 1 ? 0 : (index / (rows.length - 1)) * 290);
          return index % 3 === 0 || index === rows.length - 1 ? (
            <text key={`${row.month}-${valueKey}`} x={x} y="108" textAnchor="middle">{row.month.slice(5)}</text>
          ) : null;
        })}
      </svg>
    </div>
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
        casualtyByMonth.set(month, (casualtyByMonth.get(month) || 0) + incident.deaths + incident.injuries);
      });

    return monthList.map((month) => ({
      month,
      suspects: suspects
        .filter((row) => row.month === month && (!city || row.city === city))
        .reduce((sum, row) => sum + row.suspects, 0),
      casualties: casualtyByMonth.get(month) || 0,
    }));
  }, [city, incidents, months, suspects]);

  const suspectTotal = rows.reduce((sum, row) => sum + row.suspects, 0);
  const casualtyTotal = rows.reduce((sum, row) => sum + row.casualties, 0);

  return (
    <article className="trend-card panel-pop">
      <div className="trend-header">
        <div>
          <span>縣市趨勢</span>
          <h2>{city || "全部縣市"}</h2>
        </div>
        <div className="trend-latest">
          <b>{casualtyTotal}</b>
          <small>篩選死傷數</small>
        </div>
      </div>

      {rows.length ? (
        <>
          <MiniTrend title={`毒品嫌疑犯人數，合計 ${suspectTotal}`} rows={rows} valueKey="suspects" colorClass="suspect-line" />
          <MiniTrend title={`新聞死傷數，合計 ${casualtyTotal}`} rows={rows} valueKey="casualties" colorClass="casualty-line" />
        </>
      ) : (
        <div className="empty-panel">尚未選取月份</div>
      )}
    </article>
  );
}

function RankingList({ ranking, selectedCity, onSelectCity }) {
  return (
    <section>
      <div className="panel-title">
        <span>縣市排名</span>
        <button type="button" onClick={() => onSelectCity("")}>全部縣市</button>
      </div>
      <ol className="risk-list ranking-list">
        {ranking.slice(0, 10).map((item, index) => {
          const level = rankingLevel(item, index);
          return (
            <li key={item.city} className={selectedCity === item.city ? "active" : ""}>
              <button type="button" onClick={() => onSelectCity(item.city)}>
                <div>
                  <strong>{index + 1}. {item.city}</strong>
                  <span>{item.events} 件，死亡 {item.deaths}，受傷 {item.injuries}</span>
                </div>
                <b className={`risk-${level}`}>{levelLabel(level)}</b>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function ControlPanel({ months, selectedMonths, setSelectedMonths, sources, selectedSources, setSelectedSources, visibleTypes, setVisibleTypes, ranking, selectedCity, onSelectCity }) {
  const toggleSet = (value, list, setter) => {
    setter(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  };

  return (
    <aside className="control-panel panel-pop" aria-label="地圖篩選與縣市排名">
      <section>
        <div className="panel-title">
          <span>年月</span>
          <div className="panel-actions">
            <button type="button" onClick={() => setSelectedMonths(months)}>全選</button>
            <button type="button" onClick={() => setSelectedMonths([])}>全不選</button>
          </div>
        </div>
        <div className="chips">
          {months.map((month) => (
            <label key={month} className={selectedMonths.includes(month) ? "chip active" : "chip"}>
              <input type="checkbox" checked={selectedMonths.includes(month)} onChange={() => toggleSet(month, selectedMonths, setSelectedMonths)} />
              {toMonthLabel(month)}
            </label>
          ))}
        </div>
      </section>

      <section>
        <div className="panel-title">
          <span>來源</span>
          <div className="panel-actions">
            <button type="button" onClick={() => setSelectedSources(sources)}>全選</button>
            <button type="button" onClick={() => setSelectedSources([])}>全不選</button>
          </div>
        </div>
        <div className="chips">
          {sources.map((source) => (
            <label key={source} className={selectedSources.includes(source) ? "chip active" : "chip"}>
              <input type="checkbox" checked={selectedSources.includes(source)} onChange={() => toggleSet(source, selectedSources, setSelectedSources)} />
              {source}
            </label>
          ))}
        </div>
      </section>

      <section>
        <div className="panel-title"><span>圖示</span></div>
        <div className="switches">
          <label>
            <input type="checkbox" checked={visibleTypes.deaths} onChange={() => setVisibleTypes((current) => ({ ...current, deaths: !current.deaths }))} />
            <span>骷顱頭：死亡</span>
          </label>
          <label>
            <input type="checkbox" checked={visibleTypes.injuries} onChange={() => setVisibleTypes((current) => ({ ...current, injuries: !current.injuries }))} />
            <span>拐杖：受傷</span>
          </label>
        </div>
      </section>

      <RankingList ranking={ranking} selectedCity={selectedCity} onSelectCity={onSelectCity} />
    </aside>
  );
}

function NewsListPage({ incidents, selectedCity }) {
  return (
    <section className="news-page panel-pop">
      <div className="news-header">
        <div>
          <span>新聞報導</span>
          <h2>{selectedCity || "全部縣市"}</h2>
        </div>
        <b>{incidents.length} 篇</b>
      </div>
      <div className="news-list">
        {incidents.length ? incidents.map((incident) => (
          <article key={incident.id} className="news-row">
            <div className="card-meta">
              <span>{incident.city}</span>
              <span>{formatDate(incident.publishedAt)}</span>
              <span>{incident.source}</span>
            </div>
            <h3>{incident.title}</h3>
            <p>{incident.summary}</p>
            <div className="news-row-footer">
              <span className="death-pill">死亡 {incident.deaths}</span>
              <span className="injury-pill">受傷 {incident.injuries}</span>
              <a href={incident.url} target="_blank" rel="noreferrer">閱讀原文</a>
            </div>
          </article>
        )) : <div className="empty-panel">目前篩選條件沒有新聞</div>}
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

  const months = useMemo(() => [...new Set(incidents.map((incident) => incident.publishedAt.slice(0, 7)))].sort().reverse(), [incidents]);
  const sources = useMemo(() => [...new Set(incidents.map((incident) => incident.source))].sort(), [incidents]);

  useEffect(() => {
    if (months.length && !didInitMonths.current) {
      setSelectedMonths(months.slice(0, 4));
      didInitMonths.current = true;
    }
  }, [months]);

  useEffect(() => {
    if (sources.length && !didInitSources.current) {
      setSelectedSources(sources);
      didInitSources.current = true;
    }
  }, [sources]);

  const monthSourceIncidents = useMemo(() => {
    return incidents.filter((incident) => {
      const month = incident.publishedAt.slice(0, 7);
      return selectedMonths.includes(month) && selectedSources.includes(incident.source);
    });
  }, [incidents, selectedMonths, selectedSources]);

  const visibleIncidents = useMemo(() => {
    return selectedCity ? monthSourceIncidents.filter((incident) => incident.city === selectedCity) : monthSourceIncidents;
  }, [monthSourceIncidents, selectedCity]);

  const ranking = useMemo(() => buildCityRanking(monthSourceIncidents, suspects, selectedMonths), [monthSourceIncidents, selectedMonths, suspects]);

  const cityLevels = useMemo(() => {
    return new Map(ranking.map((item, index) => [item.city, rankingLevel(item, index)]));
  }, [ranking]);

  const metrics = useMemo(() => {
    const deaths = visibleIncidents.reduce((sum, item) => sum + item.deaths, 0);
    const injuries = visibleIncidents.reduce((sum, item) => sum + item.injuries, 0);
    const topCity = ranking.find((item) => item.score > 0)?.city || "無資料";
    return { deaths, injuries, events: visibleIncidents.length, topCity };
  }, [ranking, visibleIncidents]);

  return (
    <main className="app-shell">
      <header className="site-header app-header">
        <p>新聞事件與公開統計整理</p>
        <h1>全台毒駕死傷地圖</h1>
        <span>骷顱頭代表死亡，拐杖代表受傷。月份、來源與縣市會同步影響地圖、排名、趨勢與新聞列表。</span>
        <nav className="view-tabs" aria-label="頁面切換">
          <button type="button" className={activeView === "map" ? "active" : ""} onClick={() => setActiveView("map")}>地圖</button>
          <button type="button" className={activeView === "news" ? "active" : ""} onClick={() => setActiveView("news")}>新聞列表</button>
        </nav>
      </header>

      <div className="metrics-row" aria-label="目前篩選期間統計">
        <Metric label={selectedCity ? `死亡：${selectedCity}` : "死亡"} value={metrics.deaths} tone="danger" />
        <Metric label="受傷" value={metrics.injuries} tone="warning" />
        <Metric label="新聞事件" value={metrics.events} />
        <Metric label="目前最高排名" value={metrics.topCity} tone="risk" />
      </div>

      <section className="hero-grid">
        <div className="map-column">
          {loading ? (
            <div className="loading">資料載入中</div>
          ) : activeView === "map" ? (
            <TaiwanMap
              incidents={visibleIncidents}
              visibleTypes={visibleTypes}
              selectedCity={selectedCity}
              cityLevels={cityLevels}
              onSelectCity={setSelectedCity}
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
          />
          <TrendCard city={selectedCity} months={selectedMonths} suspects={suspects} incidents={monthSourceIncidents} />
        </div>
      </section>

      <section className="source-note">
        <strong>資料說明</strong>
        <p>新聞事件代表媒體報導案例，不等同官方完整事故統計；毒品嫌疑犯人數來自附件公開統計，作為風險指標的背景因子。</p>
      </section>
    </main>
  );
}
