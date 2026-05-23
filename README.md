# 全台毒駕死傷地圖 Taiwan Drug Driving Map

以新聞事件與公開統計資料為基礎，整理全台毒駕相關死傷事件，並透過互動式台灣地圖、縣市排名、縣市趨勢與新聞列表，協助使用者快速理解各縣市毒駕風險分布。

> 本專案為資料視覺化作品。新聞事件不等同官方完整事故統計；毒品嫌疑犯人數則作為背景風險指標使用。

---

## 線上網站

GitHub Pages：

```txt
https://jie8357ioii.github.io/drug_driver_map_tw/
```

---

## 專案特色

- 互動式台灣地圖
- 依縣市呈現毒駕死傷事件
- 支援月份篩選
- 支援新聞來源篩選
- 死亡與受傷事件圖示切換
- 縣市風險排名
- 縣市趨勢表
- 新聞事件列表
- GitHub Pages 自動部署

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
  "url": "https://example.com/news"
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

---

### 清理新聞資料

```bash
npm run data:clean
```

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

### 地圖

地圖呈現全台縣市毒駕相關新聞事件。

- 骷顱頭代表死亡
- 拐杖代表受傷
- 點擊縣市可篩選資料
- 點擊事件圖示可開啟新聞原文
- 支援地圖放大、縮小與重設

---

### 縣市排名

縣市排名會依據以下資料綜合排序：

- 死亡人數
- 受傷人數
- 新聞事件數
- 毒品嫌疑犯人數

排名屬於專案內部視覺化邏輯，並非官方排名。

---

### 縣市趨勢

縣市趨勢建議呈現：

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
- 原文連結

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
- 加入資料更新時間
- 加入資料來源註記
- 加入行動版地圖操作優化
- 加入自動化新聞爬取與定期更新流程
- 加入縣市趨勢圖表
- 加入資料下載功能
- 加入 CI 自動檢查資料格式

---

## 授權

本專案採用 MIT License。
