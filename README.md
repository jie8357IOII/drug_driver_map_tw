# 台灣酒駕與毒駕新聞地圖

以新聞事件與公開統計資料為基礎，整理台灣酒駕與毒駕事件及相關新聞，並透過生命影響敘事、互動式台灣地圖、縣市趨勢、案件統計與新聞列表，協助使用者理解毒駕事件的地理分布、時間變化與人身影響。

> 本專案為資料視覺化作品。新聞事件不等同官方完整事故統計；毒品嫌疑犯人數則作為背景風險指標使用。

---

## 線上網站

GitHub Pages：

```txt
https://jie8357ioii.github.io/drug_driver_map_tw/
```

---

## 專案特色

- 生命影響頁：整理受害者家庭角色、可能家庭衝擊與外出安全提醒。
- 互動式地圖：依縣市呈現毒駕新聞事件死傷分布，支援縣市篩選、地圖縮放與拖曳。
- 全域月份篩選：可快速切換近 3 月、近 6 月或全部月份，並同步影響地圖、趨勢、統計與新聞列表。
- 縣市風險排序：綜合死亡人數、受傷人數、新聞事件數與毒品嫌疑犯背景數建立站內排序。
- 縣市趨勢頁：分開呈現新聞死傷數與毒品嫌疑犯公開統計，避免不同量級資料被誤讀。
- 案件統計頁：整理毒駕載具、毒品關鍵字、肇事型態、受害情境、脆弱族群與資料品質。
- 新聞列表頁：保留完整新聞資料、原文連結、資料品質標籤，以及毒駕者與受害者輪廓摘要。
- 手機版摘要列與頁面切換：在小螢幕上保留目前篩選、最新事故與主要分頁操作。
- GitHub Pages 自動部署

---

## 設計理念

本專案的核心不是把事故做成排行榜，而是讓使用者在資料中同時看見「問題的分布」與「被影響的人」。

設計上採取以下原則：

- 資料先於裝飾：畫面以可讀性、掃描效率與清楚的資料層級為優先，避免過度視覺化造成誤解。
- 生命不是數字：死亡與受傷不只呈現在 KPI，也透過家庭角色、日常情境與新聞脈絡提醒使用者，每筆資料背後都可能是一個家庭。
- 不製造恐懼：使用克制的文字與視覺語氣，避免血腥、獵奇或情緒勒索式呈現。
- 不替縣市貼標籤：縣市排序是站內觀察工具，不等同官方風險排名，也不代表某地一定更危險。
- 分清資料口徑：新聞事件、死傷統計與毒品嫌疑犯公開統計的來源與意義不同，趨勢圖刻意以量級區隔提醒使用者不要直接相加。
- 保留資料限制：新聞列表保留完整事件與品質標籤，讓使用者知道哪些資料已校正、需複核或不建議納入統計。

---

## 技術架構

本專案使用：

- React
- Vite
- JavaScript
- CSS
- GitHub Actions
- GitHub Pages
- `@svg-maps/taiwan` 台灣地圖資料

---

## 專案結構

```txt
.
├── .github/
│   └── workflows/
│       └── deploy.yml
├── public/
│   └── data/
│       ├── incidents.json
│       ├── drug_suspects_monthly.json
│       └── forecast.json
├── scripts/
│   ├── convert_excel.py
│   ├── scrape_news.mjs
│   ├── clean_incidents.mjs
│   └── build_forecast.mjs
├── src/
│   ├── App.jsx
│   └── ...
├── index.html
├── package.json
├── vite.config.js
└── README.md
```

---

## Build and Run

本專案使用 React + Vite 開發，請先確認本機已安裝 Node.js。

新聞流程與 Actions 使用 Node.js 22、Python 3.12；純網站開發只需 Node.js。

確認 Node.js 版本：

```bash
node -v
```

確認 npm 版本：

```bash
npm -v
```

---

### 1. Clone 專案

```bash
git clone https://github.com/jie8357IOII/drug_driver_map_tw.git
cd drug_driver_map_tw
```

---

### 2. 安裝依賴

建議使用：

```bash
npm ci
```

若不是從乾淨環境安裝，也可以使用：

```bash
npm install
```

---

### 3. 啟動本機開發環境

```bash
npm run dev
```

啟動後，終端機會顯示本機網址，通常是：

```txt
http://localhost:5173/
```

在瀏覽器開啟即可查看專案。

---

### 4. 建置正式版本

```bash
npm run build
```

建置完成後，會產生：

```txt
dist/
```

`dist/` 是正式部署用的靜態檔案資料夾。

---

### 5. 本機預覽正式版本

```bash
npm run preview
```

啟動後可在瀏覽器預覽正式 build 後的結果。

---

## 資料說明

### `public/data/incidents.json`

新聞事件資料，主要用於地圖標記、新聞列表、縣市死傷統計與趨勢表。

建議欄位格式：

```json
{
  "id": "incident-001",
  "city": "臺北市",
  "publishedAt": "2026-01-01",
  "source": "新聞來源",
  "title": "新聞標題",
  "summary": "事件摘要",
  "deaths": 0,
  "injuries": 1,
  "url": "https://example.com/news",
  "dataQuality": {
    "includeInStats": true,
    "needsHumanReview": false
  },
  "extractedDetails": {
    "driver": {},
    "drug": {},
    "crash": {},
    "victim": {},
    "context": {}
  },
  "humanImpact": {
    "victimFamilyRoles": [],
    "possibleHouseholdImpacts": []
  }
}
```

欄位說明：

| 欄位 | 說明 |
|---|---|
| `id` | 事件唯一 ID |
| `city` | 事件所屬縣市 |
| `publishedAt` | 新聞發布日期 |
| `source` | 新聞來源 |
| `title` | 新聞標題 |
| `summary` | 事件摘要 |
| `deaths` | 死亡人數 |
| `injuries` | 受傷人數 |
| `url` | 新聞連結 |
| `dataQuality` | 資料品質與是否納入統計 |
| `extractedDetails` | 從新聞文字萃取出的毒駕者、毒品、肇事與受害情境標籤 |
| `humanImpact` | 受害者家庭角色、社會角色與可能家庭影響 |

閱讀口徑：

- `includeInStats` 控制事件資格，地圖另看 `mapEligible`；傷亡按 `fieldStatus` 分別採用。相關新聞卡片來自 `news.json`，不因公開就進統計。
- `needsHumanReview: true` 表示仍有欄位待釐清；已確認的機器事件可計事件數，但不把未知人數當零。歷史未核對資料另外標記並排除已核對統計。
- `extractedDetails` 與 `humanImpact` 來自規則式萃取，屬於輔助理解的可觀察標籤，不是官方分類。

---

### `public/data/drug_suspects_monthly.json`

毒品嫌疑犯公開統計資料，作為縣市風險背景指標。

建議欄位格式：

```json
{
  "month": "2026-01",
  "city": "臺北市",
  "suspects": 123
}
```

欄位說明：

| 欄位 | 說明 |
|---|---|
| `month` | 統計月份 |
| `city` | 縣市 |
| `suspects` | 毒品嫌疑犯人數 |

---

### `public/data/forecast.json`

預測或延伸分析資料，可用於後續風險趨勢擴充。

---

## 資料處理指令

### Excel 轉換為 JSON

```bash
npm run data:excel
```

此指令會將：

```txt
public/data/q04010103_210702733.xlsx
```

轉換為：

```txt
public/data/drug_suspects_monthly.json
```

---

### 每日酒駕與毒駕新聞

每日台北時間 **00:17** 抓取，**08:17** 檢查是否需要補跑。使用 GitHub Actions，不依賴 Codex 排程；符合來源、人物與事件核對條件的資料自動部署，日常不再逐批人工合併資料 PR。

- 新聞區包含具體事件、政策、判決與統計報導；新聞篇數與事件數分開。
- jieba 繁體詞典＋專用詞典辨識用語，規則連結人物、車輛、酒精／毒品檢測、日期與傷亡，每項保留原文位置。詞典與 jieba 版本固定，HMM 關閉。
- 酒精數值保存單位、檢體與對象；拒測、待驗、排除、物品含毒及乘客結果不能當成駕駛陽性。
- 新聞可先公開來源標題與連結；未確認欄位標示待釐清。事件身分明確但人數未明時，可計事件數，未知人數不當成零。
- 同案後續連到原事件，不能將每篇傷亡加總。只有符合日期、具體地點、人物及車輛等條件才自動配對；歧義不新增統計事件。已核對值遇衝突時保留原值及新來源。
- 舊資料保留 ID、來源與修訂；未複核資料標記 `legacy`，排除已核對統計，另顯示待核對數量。不能把原本的 `includeInStats: true` 當作已驗證證據。
- 第一個來源為 LTN，日常搜尋最近七個已結束的台北日曆日；國外事件及僅頁尾提及「禁止酒駕」的無關文章不收錄。舊資料與歷史回看只涵蓋已取得來源的零散日期，最早至最晚日期不代表中間每日都已搜尋，也不是全台完整新聞或事故統計。

解析與網站共用 `incidents.json`（事件）、`news.json`（新聞卡片）及 `news-status.json`（檢查時間／缺值狀態）。`impairmentTypes` 可同時含 `alcohol`、`drug`，全部事件總數按 ID 去重。`occurredAt` 是事發日，`publishedAt` 是發布日。

截至 2026-11-03 的資料涵蓋紀錄：

| 資料 | 實際日期範圍 | 涵蓋意義 |
|---|---|---|
| 警政署毒品嫌疑人月檔 | 2023-01 至 2026-03 | 毒品嫌疑人背景統計，不是酒駕／毒駕事故資料。 |
| 既存新聞與歷史來源 | 2024-05-05 至 2026-11-02 | 零散來源的最早／最晚日期，不表示已逐日搜尋整段期間。 |
| 首次依設定關鍵字完成的新聞搜尋 | 2026-10-27 至 2026-11-02 | 僅 LTN 來源，不代表全台新聞或事故完整收錄。 |

月檔與新聞事件的統計對象不同；是否沿用毒品嫌疑人資料對齊，或另接酒駕／毒駕事故資料，仍待確認。目前不宣稱已完成 2023 年起的酒毒駕事故回補。

### 安裝本機新聞環境

從 repository 根目錄執行。Python 版本與 Actions 對齊；若使用其他安裝路徑，設定 `NEWS_PYTHON` 指向已安裝相同依賴的直譯器。

```bash
npm ci
python3.12 -m venv .venv-news
.venv-news/bin/python -m pip install -r requirements-news.txt
npm run news:update -- --help
```

`requirements-news.txt` 固定 jieba 0.42.1；繁體基底詞典隨庫保存並驗證 checksum，切詞時不用上網。詞典來源與 offset 契約見 [詞典說明](scripts/lexicon/README.md)。Windows 可用 WSL；原生 Windows 可將 `NEWS_PYTHON` 設為 venv 的 `Scripts/python.exe`。

### 抓取與離線重播（不發布）

```bash
# 與每日排程相同：檢查最近七個已結束的台北日曆日
npm run news:update -- --output .news-output/daily --dry-run

# 明確要求重抓歷史排除資料的來源；同時執行一般日期區間收集
# 日常排程不會自動重跑整批歷史排除資料
npm run news:update -- --recheck-excluded \
  --output .news-output/recheck-excluded --dry-run

# 指定發布日期區間；有既有水位時不能跳過尚未抓取日期
npm run news:update -- --from 2026-11-01 --to 2026-11-02 \
  --output .news-output/range --dry-run

# 單篇全文、人物與原文依據報告
npm run news:analyze -- \
  --url https://news.ltn.com.tw/news/society/breakingnews/5626487 \
  --output .news-output/single

# 固定原文離線重播，不再下載文章、不推進每日抓取水位
npm run news:replay -- --input .news-output/single/sources.json \
  --output .news-output/replay --dry-run

# 只驗證既有事件資料，與排程使用同一入口
npm run data:validate
```

`news:update` 與 `news:replay` 預設就不改公開資料、不提交 Git、不部署；`--dry-run` 可明示此意圖。`data:news` 是新入口的別名，舊 `--date/--start/--end` 改為 `--from/--to`。

快照目錄包含三份 `public/data/*.json`、`state.json`、`manifest.json`、`report.json`、`analysis.json`、`sources.json`。manifest 只雜湊三份公開資料與 state，並記錄產生快照時 base/state **原始 bytes** 的 hash；只有完整驗證通過才產生 `status: ready`。全文 sources 與完整分析僅供本機回看，不進網站或資料分支。

首次必須有非空的歷史 `incidents.json`。後續使用 `--base FILE --state FILE` 接續成功快照；明確指定卻不存在的 state 會失敗。每日缺口每次最多補七天，成功水位只沿連續日期前進；指定較舊日期回補與離線重播不將水位倒退。

每次指定 `--recheck-excluded`，都會在正常最近七日或指定區間搜尋之外，額外重新抓取歷史排除資料的主來源與相關報導 URL，產生 `manifest.mode: live` 的快照。有漏跑時仍先補連續日期缺口；歷史重查不單獨推進每日水位。

歷史 URL 抓取失敗時保留既有數值，並在稽核紀錄列出失敗原因；正常當期搜尋若有任何故障，仍停止整批快照發布。歷史回看結果與涵蓋範圍由 `report.json`、state 及公開 `news-status.json` 記錄；應區分實際檢查的日期區間與零散歷史來源，不將兩者合成全台連續涵蓋。`--dry-run` 仍會下載來源，只是不發布；要完全離線須使用已保存來源的 replay。

```bash
npm run news:update -- \
  --base .news-output/previous/public/data/incidents.json \
  --state .news-output/previous/state.json \
  --output .news-output/next --dry-run

# 保留人工拒收清單；URL JSON array，同時寫進下一版 state
npm run news:update -- --rejections rejected-news.json \
  --output .news-output/filtered --dry-run
```

### 發布同一份快照

先離線檢查，不需要 GitHub 登入或網路：

```bash
npm run news:publish -- --snapshot .news-output/daily --dry-run
```

正式發布需要本機 `main` 等於遠端 `main`、已提交的程式、Git／GitHub CLI 登入及 repository 寫入權限。Pages Source 必須選 **GitHub Actions**。快照必須來自最新的 `news-data` 基準；三份公開資料可因恢復基準而與 main 不同，程式不可有未提交變更。

```bash
gh auth login
gh auth setup-git

# 已存在 news-data 時：取出生成快照所需的最新基準到外部目錄
# 先用 git ls-remote --heads origin news-data 確認是否已初始化
mkdir -p .news-output/baseline
git fetch origin news-data
git show FETCH_HEAD:public/data/incidents.json > .news-output/baseline/incidents.json
git show FETCH_HEAD:state.json > .news-output/baseline/state.json
npm run news:update -- \
  --base .news-output/baseline/incidents.json \
  --state .news-output/baseline/state.json \
  --output .news-output/publish
npm run news:publish -- --snapshot .news-output/publish
```

首次沒有 `news-data`，可先在 Actions 手動執行 `Update and publish daily news` 初始化。若要從本機初始化，先在已與遠端同步的 main 匯出過往拒收決定，再使用 main 歷史資料、不帶 `--state` 產生快照：

```bash
bash scripts/bootstrap_news_rejections.sh --output .news-output/rejected-urls.json
npm run news:update -- --output .news-output/initial \
  --base public/data/incidents.json --rejections .news-output/rejected-urls.json
npm run news:publish -- --snapshot .news-output/initial
```

匯出程式只讀 main 完整歷史與已合併資料 PR，不讀未合併 PR、不切換分支或 push。Actions 首次執行也用同一程式；後續從 state 繼承拒收清單，不必每日匯出。初始化前的一般程式部署會明確停止，避免把 main 的舊資料當作最新版本。

本機 publisher 將**精確快照**上傳至 `news-upload/<hash>`，再 dispatch 主 workflow，在共同發布鎖下驗證、建置、保存與部署。`Submitted` 表示已送出；需等 Actions 的線上 hash 讀回成功才算發布完成。它不會在你的工作目錄切分支或繞過雲端鎖直接寫 `news-data`。

離線重播快照預設禁止正式發布；確認要採用歷史重播結果時，需明示 `--allow-replay`，仍須通過原始基準與資料驗證：

```bash
npm run news:publish -- --snapshot .news-output/replay --allow-replay
```

`news:pr` 已停用並提供遷移指引；舊未合併資料 PR 不會被偷偷合併或自動吞入新流程。

### GitHub Actions 設定與故障恢復

1. 將已驗證的程式合併至 `main`，Pages Source 設為 GitHub Actions；若 Pages environment 要求每次人工核准，需依自動發布目標調整設定。
2. 首次手動執行 `Update and publish daily news`。一般回補同時填 `start_date`、`end_date`；需要額外重抓歷史排除資料時，手動勾選 `recheck_excluded`（預設 `false`）。00:17／08:17 排程維持一般收集，不自動重跑整批歷史排除資料。本機上傳模式使用 `snapshot_ref`／`snapshot_sha`，不與日期或 `recheck_excluded` 混用。
3. `news-data` 持久保存快照與 state，不依賴暫存 cache。建置後先保存，再部署；部署失敗時下次優先重試同一快照。未完成的快照會阻擋不同新版本，請不填日期或 `snapshot_ref`、保持 `recheck_excluded=false` 重跑 workflow；舊快照發布成功後再另行要求歷史回看。抓取成功日與發布完成記錄分開。
4. 新聞更新與程式部署共用 Pages 發布鎖；程式部署也取最新 `news-data`，不把每日資料倒退成 main 舊版本。
5. 部署後核對三份 JSON hash、程式 commit SHA 與快照 ID；成功才保存 `published.json`。失敗保留既有網站及診斷報告，不把失敗當「今日無新新聞」。

GitHub 排程可能延遲或漏執行，公開 repo 長期無活動也可能停用；08:17 補跑降低影響，不能取代外部監測。請查看 Actions 狀態與網站的最近檢查時間。[GitHub schedule 文件](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)

### 可選 Gemini 擷取建議

**不設定金鑰即可完成本機規則與每日更新。** 有無法解析的關係時，可設定 `GEMINI_API_KEY`、`GEMINI_MODEL`；Actions 分別使用同名 secret 與 repository variable。模型需自行確認帳戶免費層可用，程式不會開啟付費或自動更換供應商，亦無法替 API 供應商保證免費額度。

`NEWS_API_MAX_REQUESTS` 控制每次執行的請求上限（預設 10，0 為不發請求）；快取按正文、標題、模型與提示版本保存於 state。額度錯誤或 API 故障記錄後延後處理，不阻擋可獨立完成的本機結果；不要將單次請求上限誤認為供應商的每日額度限制。

API 只產生附原文引句的關係建議，會核對引句及字串位置，保留於 `analysis.json`；**這不是已驗證語意，不會直接提高發布資格或覆寫傷亡**。未取得金鑰的環境只驗證停用路徑，不能宣稱已量測雲端模型效果。免費層的資料使用條件見 [官方定價](https://ai.google.dev/gemini-api/docs/pricing)。

### 檢查、建置與預覽

```bash
npm test
npm run data:validate
GITHUB_PAGES=true npm run build
GITHUB_PAGES=true npm run preview
```

Pages 預覽路徑為終端顯示網址加 `/drug_driver_map_tw/`。要預覽快照，可在建置完成後把該快照的三份 JSON 複製到 **dist/data/**，不修改 `public/data`；這只改本機建置結果，不會部署。

方法、限制與決策見 [每日規劃](docs/daily-alcohol-drug-news-plan.md)、[ADR-0002](docs/adr/0002-automatic-news-publication.md)，實際結果見 [39 篇原文回看與實作驗證](docs/news-implementation-2026-11-03.md)。已用於修規則的新聞是開發材料，不能當成獨立準確率證據。修改理解規則時須更新 `news_understanding.mjs` 的 `VERSION`，讓已讀過且正文未變的文章重新核對。

### 舊版一次性清理

`npm run data:clean` 是歷史資料整備工具，可能改用固定日期的原始備份重建；**不屬於每日流程，不要接在 `data:news` 後面執行**。每日更新自行保留既有資料與人工校正，不使用這支腳本。

---

### 建立預測資料

```bash
npm run data:forecast
```

---

### 執行完整資料流程

```bash
npm run data:all
```

目前 `data:all` 會執行：

```bash
npm run data:excel && npm run data:forecast
```

---

## GitHub Pages 部署

本專案使用 GitHub Actions 自動部署到 GitHub Pages。

部署流程：

1. Push 到 `main` branch
2. GitHub Actions 執行 `npm ci`
3. 執行 `npm run build`
4. 將 `dist/` 上傳為 Pages artifact
5. 部署到 GitHub Pages

---

### 手動觸發部署

也可以到 GitHub repository 頁面手動執行：

```txt
Actions → Deploy to GitHub Pages → Run workflow
```

---

### Push 後自動部署

```bash
git add .
git commit -m "Update project"
git push origin main
```

推送到 `main` branch 後，GitHub Actions 會自動 build 並部署。

---

## GitHub Pages 子路徑設定

由於本專案部署在：

```txt
https://jie8357ioii.github.io/drug_driver_map_tw/
```

因此 `vite.config.js` 需要設定 GitHub Pages 的 base path：

```js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: process.env.GITHUB_PAGES === "true" ? "/drug_driver_map_tw/" : "/",
  plugins: [react()],
});
```

在 GitHub Actions build 時，需要帶入：

```yaml
env:
  GITHUB_PAGES: "true"
```

---

## 讀取 public/data 的注意事項

Vite build 時，`public/` 內的檔案會被複製到 `dist/` 根目錄。

因此：

```txt
public/data/incidents.json
```

build 後會變成：

```txt
dist/data/incidents.json
```

在 GitHub Pages 上則會對應到：

```txt
/drug_driver_map_tw/data/incidents.json
```

讀取 `public/data` 裡的 JSON 檔案時，建議使用：

```js
const baseUrl = import.meta.env.BASE_URL;

fetch(`${baseUrl}data/incidents.json`);
fetch(`${baseUrl}data/drug_suspects_monthly.json`);
```

不要直接寫：

```js
fetch("/data/incidents.json");
```

否則部署到 GitHub Pages 後，瀏覽器會去讀：

```txt
https://jie8357ioii.github.io/data/incidents.json
```

但正確位置應該是：

```txt
https://jie8357ioii.github.io/drug_driver_map_tw/data/incidents.json
```

---

## GitHub Actions 部署設定範例

`.github/workflows/deploy.yml`：

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: ["main"]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build
        env:
          GITHUB_PAGES: "true"

      - name: Setup Pages
        uses: actions/configure-pages@v5
        with:
          enablement: true

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}

    runs-on: ubuntu-latest
    needs: build

    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

---

## 功能說明

### 生命影響

生命影響是目前預設首頁，目的不是先呈現排名，而是先提醒使用者：毒駕事件影響的是具體的人與家庭。

目前包含：

- 家庭角色整理：例如母親、父親、孩子、配偶、長者等新聞中可辨識的角色線索
- 可能家庭影響：例如照顧、陪伴、生活節奏與長期悲傷等面向
- 被打斷的日常：整理受害者當時可能正在做的事，如停等紅燈、過馬路、買菜、騎車回家等
- 外出安全提醒：以日常防護角度提醒使用者保持距離、提高警覺與保護自己
- 相關新聞串接：點擊生命影響卡片後，可切換到新聞列表查看對應新聞

---

### 地圖

地圖呈現各縣市毒駕相關新聞事件的死傷分布。

目前包含：

- 依縣市呈現死亡與受傷人數
- 骷顱頭標記代表死亡人數
- 拐杖標記代表受傷人數
- 點擊縣市可同步篩選地圖、趨勢、統計與新聞列表
- 點擊事件標記可聚焦對應縣市資料
- 支援放大、縮小、重設與拖曳地圖
- 側邊工具面板顯示目前篩選、本期觀察重點、地圖圖例與縣市排名

---

### 縣市排名

縣市排名會依據以下資料綜合排序：

- 死亡人數
- 受傷人數
- 新聞事件數
- 毒品嫌疑犯人數

排名屬於專案內部視覺化邏輯，並非官方排名，也不代表官方認定的風險排序。

---

### 縣市趨勢

縣市趨勢用來觀察「新聞死傷事件」與「毒品嫌疑犯公開統計」在時間上的變化。

目前包含：

- 依目前月份與縣市篩選顯示趨勢
- 死亡、受傷與毒品嫌疑犯三條趨勢線
- 以波浪區隔新聞死傷數與毒品嫌疑犯數，提醒兩者量級不同
- 頁首摘要顯示目前範圍內死亡、受傷與毒品嫌疑犯總數

資料表概念如下：

| 縣市 | 月份 | 死亡人數 | 受傷人數 | 量級區隔 | 毒品嫌疑犯人數 | 新聞事件數 |
|---|---:|---:|---:|---:|---:|---:|
| 新北市 | 26/05 | 1 | 3 | ～～ | 1,245 | 2 |
| 桃園市 | 26/05 | 0 | 2 | ～～ | 986 | 1 |

閱讀方式：

- 死亡人數與受傷人數：新聞事件整理
- 毒品嫌疑犯人數：公開統計背景資料
- `～～`：代表兩者量級差距大，不建議直接相加比較

月份建議使用短格式：

```txt
26/05
26/04
26/03
```

避免使用者誤讀完整日期。

---

### 案件統計

案件統計頁聚焦新聞資料中可被規則式判讀的案件輪廓，協助理解資料內容，但不把它視為官方事故分類。

目前包含：

- 資料品質摘要：完整資料、納入統計、已校正、排除統計與需複核數量
- 毒駕者輪廓統計：年齡分布、性別分布，以及可判讀資料比例
- 毒駕載具統計
- 毒品關鍵字統計
- 肇事型態統計
- 受害情境統計
- 脆弱族群統計
- 縣市切換後，案件統計會同步更新為該縣市範圍

閱讀提醒：

- 這些統計來自新聞標題、摘要與相關報導標題的規則式萃取
- 載具、毒品、肇事型態與受害情境屬於「可觀察標籤」
- 標示為需複核的案件，建議回到新聞原文人工確認

---

### 新聞列表

新聞列表呈現目前篩選條件下的事件資料。

包含：

- 縣市
- 日期
- 新聞來源
- 新聞標題
- 事件摘要
- 死亡人數
- 受傷人數
- 資料品質標籤
- 毒駕者輪廓摘要
- 受害者輪廓摘要
- 被影響的日常與家庭角色提示
- 原文連結

新聞列表會保留完整新聞資料；KPI、地圖、縣市排名與趨勢圖則只採用建議納入統計的案件，避免後續報導、評論文章或重複報導影響死傷數。

---

## 常見問題

### 1. GitHub Pages 部署成功，但畫面沒有資料

通常是 JSON 路徑錯誤。

錯誤寫法：

```js
fetch("/data/incidents.json");
```

在 GitHub Pages 上會讀到：

```txt
https://jie8357ioii.github.io/data/incidents.json
```

但正確位置應該是：

```txt
https://jie8357ioii.github.io/drug_driver_map_tw/data/incidents.json
```

建議改成：

```js
fetch(`${import.meta.env.BASE_URL}data/incidents.json`);
```

---

### 2. `public/data` 會不會被部署？

會。

Vite build 時，`public/` 內的檔案會被複製到 `dist/` 根目錄。

---

### 3. 為什麼本機有資料，但 GitHub Pages 沒資料？

常見原因是本機在根目錄 `/` 執行，但 GitHub Pages 是部署在 `/drug_driver_map_tw/` 子路徑。

本機可讀：

```txt
/data/incidents.json
```

GitHub Pages 應該讀：

```txt
/drug_driver_map_tw/data/incidents.json
```

因此需要使用：

```js
import.meta.env.BASE_URL
```

---

### 4. `npm ci` 和 `npm install` 差在哪？

- `npm ci`：適合 CI/CD 與乾淨環境，會依照 `package-lock.json` 安裝
- `npm install`：適合一般開發環境，可能會更新 `package-lock.json`

本專案在 GitHub Actions 中建議使用：

```bash
npm ci
```

---

### 5. 如何確認資料檔案是否成功部署？

部署完成後，可以直接打開：

```txt
https://jie8357ioii.github.io/drug_driver_map_tw/data/incidents.json
```

如果瀏覽器看到 JSON 內容，代表資料檔案已成功部署。

---

## 資料限制

本專案資料有以下限制：

- 新聞事件為媒體報導案例，不代表完整官方事故統計
- 不同新聞來源對地點、死傷人數與事件細節的描述可能不同
- 毒品嫌疑犯人數為背景風險指標，不代表毒駕事故發生率
- 縣市風險排名為專案內部視覺化邏輯，不應直接視為官方風險排序
- 新聞資料若未持續更新，頁面呈現結果會受到資料新鮮度影響

---

## 後續可擴充方向

- 加入官方交通事故資料
- 加入年份切換
- 加入縣市詳細頁
- 加入資料來源註記
- 加入自動化新聞爬取與定期更新流程
- 加入資料下載功能
- 加入 CI 自動檢查資料格式
- 加入資料萃取結果人工校對介面
- 加入新聞事件去重與合併流程的可視化報告

---

## 授權

本專案採用 MIT License。
