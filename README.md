# 全台毒駕死傷地圖 Taiwan Drug Driving Map

以新聞事件與公開統計資料為基礎，整理全台毒駕相關死傷事件，並透過生命影響敘事、互動式台灣地圖、縣市趨勢、案件統計與新聞列表，協助使用者理解毒駕事件的地理分布、時間變化與人身影響。

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

建議使用 Node.js 20 以上版本。

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

- `includeInStats: false` 的新聞仍會保留在新聞列表，但不納入 KPI、地圖、排名與趨勢統計。
- `needsHumanReview: true` 代表資料可先展示，但建議回到新聞原文人工確認。
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

### 抓取新聞資料

```bash
npm run data:news
```

未帶日期時，檢查最近三個已結束的台北日曆日，包含零死傷的具體毒駕危險事件。
先完成搜尋分頁與原文讀取，再一次寫入；抓取、版型或日期驗證失敗時保留既有資料。

指定日期或回補區間：

```bash
npm run data:news -- --date 2026-05-26
npm run data:news -- --start 2026-05-26 --end 2026-05-27 --report /tmp/news-report.json
```

`--max-pages` 預設 20，超過時失敗並要求拆小區間，不會悄悄截斷。長期缺口請依週分批回補；預設三日回看不代表歷史資料已完整。

新資料是待複核候選：`needsHumanReview: true`、`includeInStats: false`，沒有明確數量時使用 `null`。目前採保守標題篩選：標題須能辨識具體交通危險；可能漏掉僅在內文交代事故的文章，可從執行報告逐篇核對。閱讀全文不代表規則判讀已經正確。人工核對事故、地點、死傷與重複報導後，才調整品質欄位；明確零死傷可收錄，未知不可當成零。

輸出檔必須先有有效的既有資料；檔案遺失或空陣列時停止，避免只用近期新聞重建整份資料。

重跑會保留既有紀錄與校正，依 URL、標題及 `relatedReports` 避免再次加入同篇報導。不會只憑同縣市、相同傷亡數就合併不同事故；同一事故的跨篇報導由 PR 複核確認。

```bash
npm test
npm run data:validate
```

### GitHub Actions 每日新聞更新

`Update LTN news` 每天台北時間 **00:17** 執行，也可在 Actions 手動執行。手動回補必須同時填入 `start_date` 與 `end_date`，且選擇 `main` 分支。

流程：抓取與來源判定 → 測試／資料檢查／建置 → 建立或累積同一個資料 PR → 人工複核與合併 → 既有 Pages 部署 → 線上 JSON 雜湊核對。

- 只有 `public/data/incidents.json` 會被自動提交，沒有新資料時不建立新 PR。
- 未合併的 PR 持續累積；保留人工修改與刪除，與 main 合併衝突時停止，不會強制推送。移除的來源網址由目前分支及已合併資料 PR 的 Git 歷史記住（包括 squash merge）；之後即使 PR 已合併也不自動加回。若要恢復誤刪資料，請人工加入。單純關閉未合併 PR 不代表永久拒絕其中所有新聞。
- 合併前核對完整 diff、原文及事件是否重複。新候選預設排除統計；確認城市與死傷後才設 `needsHumanReview: false`、`includeInStats: true`。
- 每次執行都有搜尋來源、收錄／排除／重複的摘要及 30 天 artifact。失敗有明確錯誤；「沒有新事故」與「無法取得資料」不混用。
- GitHub repository 的 **Settings → Actions → General → Workflow permissions → Allow GitHub Actions to create and approve pull requests** 必須開啟。預設權限仍可維持唯讀；只有更新 job 要求 contents／pull-requests write。不需要另外建立 PAT 或 AI 金鑰。
- 使用 `GITHUB_TOKEN` 建立的 PR，其 PR 檢查可能等待使用者批准；更新 job 本身已先跑測試、資料驗證與 build。若 GitHub 顯示 **Approve workflows to run**，批准後再確認檢查結果。
- GitHub 排程可能延遲；公開 repo 60 天無活動時可能被停用。請留意 Actions 失敗通知及排程狀態；停用或中斷超過三天後，手動補跑缺漏區間。
- 舊 Codex 每日任務維持暫停；`auto_scrap.md` 是舊流程筆記，不是這個 workflow 的執行來源。

規則見 [CONTEXT.md](CONTEXT.md)。排程與 token 行為依 [GitHub 排程文件](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule) 與 [workflow 觸發文件](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)。

---

### 在本機執行相同流程

Actions 與本機共用 `scripts/update_news_pr.sh`，完整入口是 `npm run news:pr`。只有定時觸發與 artifact 上傳留在 GitHub；抓取、複核紀錄、驗證、建置及建立／更新 PR 都能在本機執行。

**前置需求**：Node.js 22、npm、Git、GitHub CLI (`gh`)、`jq` 與 Bash（macOS／Linux；Windows 可用 WSL）。本機使用你登入的 GitHub 身分，需有此 repository 的推送及建立 PR 權限；不需要設定 `GITHUB_TOKEN`。

```bash
node --version
npm --version
git --version
gh --version
jq --version
gh auth login
gh auth setup-git
```

如果原目錄有尚未提交的程式或資料，請先使用另一份乾淨 clone。以下從你要存放專案的上層目錄執行，資料夾名稱可自行替換：

```bash
git clone https://github.com/jie8357IOII/drug_driver_map_tw.git drug-driver-news-runner
cd drug-driver-news-runner
npm ci
```

**完整流程：會推送資料分支並建立／更新 PR，不會直接合併或發布網站。**

```bash
# 與每日 Actions 相同：最近三個已結束的台北日曆日
npm run news:pr

# 回補單日
npm run news:pr -- --date 2026-05-26

# 回補一段區間；長期缺口請分批
npm run news:pr -- --start 2026-05-26 --end 2026-05-27

# 查看可用參數
npm run news:pr -- --help
```

完整流程會更新 `origin/main` 的遠端追蹤資訊，另開 `codex/news-run-*` 工作分支，保留既有資料 PR 的修改與刪除。成功後回到原分支；失敗時保留工作分支及報告供檢查，不會自動 stash、丟棄本機修改或強制推送。工作目錄不乾淨時直接停止。請避免同時啟動本機與雲端更新；發生推送競爭或合併衝突時先檢查，再重跑。

執行結束會印出 `Run reports: /絕對路徑`，其中 `news-report.json` 是完整來源判定紀錄，`news-report.md` 是閱讀版。GitHub 執行時相同檔案會成為 artifact。

**只在暫存副本試抓，不提交或推送：**

```bash
news_preview_dir=$(mktemp -d)
cp public/data/incidents.json "$news_preview_dir/incidents.json"
npm run data:news -- --date 2026-05-26 \
  --output "$news_preview_dir/incidents.json" \
  --report "$news_preview_dir/news-report.json"
npm run data:validate -- --output "$news_preview_dir/incidents.json"
cat "$news_preview_dir/news-report.json"
```

此試抓指令不會自動匯入 Git 歷史中的刪除決定；需要保留完整複核歷史時請使用 `news:pr`。單獨的 `data:news` 不指定 `--output` 會修改目前目錄的資料檔。

**分別執行 Actions 中的檢查與建置：**

```bash
npm test
npm run data:validate
GITHUB_PAGES=true npm run build
GITHUB_PAGES=true npm run preview
```

使用 Pages 設定建置後，本機預覽路徑為終端顯示的網址加上 `/drug_driver_map_tw/`（預設通常是 `http://localhost:4173/drug_driver_map_tw/`）。建置與預覽不會發布網站。資料 PR 經人工複核、合併到 `main` 後，才由 Pages workflow 部署並核對線上資料。

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
