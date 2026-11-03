import { appendFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import { syncBuiltinESMExports } from "node:module";
import { officialFixtureResponse } from "./official-traffic-fixtures.mjs";

// CLI safety boundary: no test may contact a news site, API or deployment host.
function forbidden() {
  appendFileSync(process.env.NEWS_TEST_EFFECTS, "network\n");
  throw new Error("Network access is forbidden in news regression checks.");
}
globalThis.fetch = async (input) => {
  const url = new URL(input);
  if (process.env.NEWS_TEST_EMPTY_SEARCH === "1" && url.origin === "https://search.ltn.com.tw" && url.pathname === "/list") {
    return new Response("<html><body>約有 0 項結果</body></html>", { headers: { "content-type": "text/html; charset=utf-8" } });
  }
  if (process.env.NEWS_TEST_EMPTY_SEARCH === "1") {
    const official = officialFixtureResponse(input);
    if (official) return official;
  }
  return forbidden();
};
http.request = http.get = https.request = https.get = forbidden;
net.connect = net.createConnection = tls.connect = forbidden;
net.Socket.prototype.connect = forbidden;
syncBuiltinESMExports();
