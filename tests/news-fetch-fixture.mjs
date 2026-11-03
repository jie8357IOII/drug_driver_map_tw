import fs from "node:fs/promises";
const fixture = JSON.parse(await fs.readFile(process.env.NEWS_TEST_FIXTURE, "utf8"));
if (fixture.now) {
  const RealDate = Date;
  globalThis.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [fixture.now])); }
    static now() { return new RealDate(fixture.now).getTime(); }
  };
}
globalThis.fetch = async (value) => {
  const url = new URL(value);
  const entry = url.hostname === "search.ltn.com.tw"
    ? fixture.search[Number(url.searchParams.get("page") || 1) - 1]
    : fixture.articles?.[url.href];
  if (entry === undefined) throw new Error(`Unexpected fixture request: ${url.href}`);
  return new Response(typeof entry === "string" ? entry : entry.body, {
    status: typeof entry === "string" ? 200 : entry.status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
};
