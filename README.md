# 全台毒駕死傷地圖 Taiwan Drug Driving Map

以新聞事件與公開統計資料為基礎，整理全台毒駕相關死傷事件，並透過互動式台灣地圖、縣市排名、趨勢圖與新聞列表，協助使用者快速理解各縣市毒駕風險分布。

> 本專案為資料視覺化作品，新聞事件不等同官方完整事故統計；公開統計資料則作為風險背景指標使用。

---

## 線上網站

GitHub Pages：

https://jie8357ioii.github.io/drug_driver_map_tw/

---

## 專案特色

- 互動式台灣地圖
- 依縣市呈現毒駕死傷事件
- 支援月份篩選
- 支援新聞來源篩選
- 死亡與受傷事件圖示切換
- 縣市風險排名
- 縣市趨勢分析
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
