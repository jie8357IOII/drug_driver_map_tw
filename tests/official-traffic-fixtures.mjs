// Synthetic reductions of the documented roadsafety.tw page/API shape.
// Counts exercise parser behavior; these are not a captured official dataset.
export const officialPageUrl = "https://roadsafety.tw/AccAgeI26CauseOrder?type=肇因分析";
export const officialNotice = "112-114年、115年1-8月查詢結果為初估值";
export const officialPage = `<html><body>
  <input id="hfBaseYear" value="112">
  <input id="hfMaxYearMonth" value="11508">
  <input id="hfUpdateDate" value="115/10/27">
  <input id="hfDashboardDataRange" value="112-114年、115年1-8月查詢結果為&#21021;&#20272;&#20540;">
  <select id="ddlCyear"><option value="112">112</option><option value="113">113</option><option value="114">114</option><option value="115">115</option></select>
  <select id="ddlI26"><option value="0">機車</option><option value="1">小型車</option><option value="4">大型車</option><option value="2">自行車(含電自、電輔)</option></select>
</body></html>`;

export const causeRows = [
  ...Array.from({ length: 94 }, (_, index) => ({ name: index === 0 ? "酒醉(後)駕駛失控" :
    index === 1 ? "吸食違禁物駕駛（疑似）" : `其他測試肇因${index}`, caseQty: 10000 - index,
    deathQty: 108, hurtQty: 2286, caseQtyL: 0, deathQtyL: 0, hurtQtyL: 0 })),
  { name: "酒醉(後)駕駛", caseQty: 2488, deathQty: 108, hurtQty: 2286, caseQtyL: 0, deathQtyL: 0, hurtQtyL: 0 },
  { name: "吸食違禁物駕駛", caseQty: 8, deathQty: 3, hurtQty: 11, caseQtyL: 0, deathQtyL: 0, hurtQtyL: 0 },
];

export function officialApiUrl(year, vehicleType) {
  return `https://roadsafety.tw/api/AccAgeI26CauseOrderAjax/GetResult?Cyear=${year - 1911}&CityKeyid=0&AreaKeyid=0&OrderType=1&Age=0&I26type=${vehicleType}`;
}

export function causeBytes(vehicleType) {
  const rows = structuredClone(causeRows);
  if (vehicleType === 1) rows[95].caseQty = 0;
  if (vehicleType === 4) rows.splice(95, 1);
  if (vehicleType === 2) rows.splice(94, 1);
  // Deliberately noncanonical JSON to distinguish raw hashes from reserialization.
  return " \n" + JSON.stringify(rows, null, 1) + "\n\n";
}

const responses = new Map([[new URL(officialPageUrl).href, officialPage]]);
for (const year of [2023, 2024, 2025, 2026]) for (const type of [0, 1, 4, 2]) {
  responses.set(officialApiUrl(year, type), causeBytes(type));
}

export function officialFixtureResponse(input) {
  const url = new URL(input);
  // Query order is immaterial, but every filter and supported year/type is required.
  url.searchParams.sort();
  for (const [expected, body] of responses) {
    const key = new URL(expected);
    key.searchParams.sort();
    if (url.href === key.href) return new Response(body);
  }
  return null;
}
