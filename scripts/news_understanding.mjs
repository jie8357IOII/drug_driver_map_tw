import crypto from "node:crypto";
import { tokenizeArticle } from "./news_tokenizer.mjs";

// This module owns interpretation. Source readers and publishers must not redo
// its actor attribution, event partitioning, polarity or casualty arithmetic.
export const VERSION = "local-events-v2";
const NUMBER = "[0-9零〇一二兩三四五六七八九十百]+";
const SURNAMES = "王李張劉陳楊黃趙吳周徐孫馬朱胡郭何高林羅鄭梁謝宋唐許韓馮鄧曹彭曾蕭田董潘袁蔡蔣余杜葉程蘇魏呂丁任沈姚盧姜崔鍾譚陸汪范金石廖賴江侯邱洪邵孟白秦邢郝孔戴莫湯康毛殷段雷黎龍薛卓莊游詹施紀柯溫翁鄒巫傅連簡顏龔涂池藍尹阮倪成武童辜萬柳易符饒嚴韋巫";
const CITY_ALIASES = {
  新北市: "新北市", 臺北市: "臺北市", 台北市: "臺北市", 桃園市: "桃園市",
  臺中市: "臺中市", 台中市: "臺中市", 臺南市: "臺南市", 台南市: "臺南市", 高雄市: "高雄市",
  宜蘭縣: "宜蘭縣", 新竹縣: "新竹縣", 新竹市: "新竹市", 苗栗縣: "苗栗縣", 彰化縣: "彰化縣",
  南投縣: "南投縣", 雲林縣: "雲林縣", 嘉義縣: "嘉義縣", 嘉義市: "嘉義市", 屏東縣: "屏東縣",
  臺東縣: "臺東縣", 台東縣: "臺東縣", 花蓮縣: "花蓮縣", 澎湖縣: "澎湖縣", 基隆市: "基隆市",
  金門縣: "金門縣", 連江縣: "連江縣", 新北: "新北市", 臺北: "臺北市", 台北: "臺北市", 北市: "臺北市",
  桃園: "桃園市", 臺中: "臺中市", 台中: "臺中市", 臺南: "臺南市", 台南: "臺南市", 高雄: "高雄市",
  宜蘭: "宜蘭縣", 苗栗: "苗栗縣", 彰化: "彰化縣", 南投: "南投縣", 雲林: "雲林縣", 屏東: "屏東縣",
  臺東: "臺東縣", 台東: "臺東縣", 花蓮: "花蓮縣", 澎湖: "澎湖縣", 基隆: "基隆市", 金門: "金門縣",
  連江: "連江縣", 嘉縣: "嘉義縣", 嘉市: "嘉義市", 竹縣: "新竹縣", 竹市: "新竹市",
};
const CITY = new RegExp(Object.keys(CITY_ALIASES).sort((a, b) => b.length - a.length).join("|"), "g");
const SUBSTANCES = [
  ["甲基安非他命", /甲基安非[他它]命/g], ["安非他命", /(?<!甲基)安非[他它]命/g],
  ["安毒", /安毒/g], ["K他命", /愷他命|氯胺酮|[Kk]他命|拉[Kk]/g],
  ["依托咪酯", /依[托託]咪酯/g], ["喪屍煙彈", /喪屍[煙菸]彈/g], ["大麻", /大麻/g],
  ["海洛因", /海洛因/g], ["甲基卡西酮", /甲基卡西酮/g], ["可卡因", /可卡因|古柯鹼/g],
  ["MDMA", /MDMA|搖頭丸/gi], ["毒咖啡包", /毒(?:品)?咖啡包/g],
];
const VEHICLE = /微型電動二輪車|電動自行車|電動機車|自行車|腳踏車|小貨車|大貨車|貨車|機車|轎車|汽車|休旅車|小客車|白牌車|賓士車|BMW(?:車)?|公車|計程車/g;
const DRIVING = /騎乘|騎(?:車|機車|自行車|微型)|駕駛|駕車|開車|開著|(?:酒駕|毒駕)上路/;
const DANGER = /撞|衝入|衝進|翻車|自摔|捲(?:入)?車底|車禍|(?:墜落|滑落).{0,10}邊坡|逆向|失控|闖紅燈|不能安全駕駛|危險駕駛|拒檢.{0,12}(?:逃|衝)|綠燈.{0,15}(?:不走|不動|未起步)|未依規定開啟大燈|不開燈|車燈未亮|路口未停讓/;
const DEAD = /死亡|身亡|喪命|不治|慘死|輾斃|撞死|宣告死亡/;
const FAMILY = /姊姊|姐姐|妹妹|妻子|丈夫|女兒|岳父|岳母|父親|母親/g;
const unique = (items) => [...new Set(items)];
const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
const evidence = (s) => ({ sentenceId: s.id, quote: s.text, field: s.field, start: s.start, end: s.end });
const hash = (value) => crypto.createHash("sha1").update(value).digest("hex").slice(0, 12);
const evUnique = (items) => [...new Map(items.map((e) => [e.sentenceId, e])).values()];

function number(value) {
  if (/^\d+$/.test(value)) return Number(value);
  const digits = { 零: 0, 〇: 0, 一: 1, 二: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  let total = 0, digit = 0;
  for (const c of value) {
    if (c === "百" || c === "十") { total += (digit || 1) * (c === "百" ? 100 : 10); digit = 0; }
    else if (digits[c] !== undefined) digit = digits[c];
    else return null;
  }
  return total + digit;
}

function sentences(article, lexical) {
  const result = [{ id: "title", paragraph: -1, text: article.title, scope: "title", field: "title", start: 0, end: article.title.length,
    tokens: lexical.fields.title }];
  let offset = 0;
  for (const [p, raw] of article.body.split("\n").entries()) {
    for (const [i, match] of [...raw.matchAll(/[^。！？!?；;]+[。！？!?；;]?/g)].entries()) {
      const value = match[0].trim();
      if (!value) continue;
      const start = offset + match.index + match[0].indexOf(value), end = start + value.length;
      let scope = "event";
      if (/呼籲|提醒民眾|提醒用路人|宣導|根據.*統計|統計本|累計取締|去年.*共.*件|平均.*件|^☆|飲酒過量.*禁止酒駕|施用毒品後駕車嚴重影響|為防制.{0,12}(?:酒|毒)駕.*每月規劃|此次修法大幅|10年內再次毒駕者|新制並增訂/.test(value)) scope = "background";
      else if (/過去曾|多年前|往年|回顧過去|歷年/.test(value)) scope = "historical_reference";
      result.push({ id: `p${p + 1}s${i + 1}`, paragraph: p, text: value, scope, field: "body", start, end,
        tokens: lexical.fields.body.filter((t) => t.start >= start && t.end <= end).map((t) => ({ ...t, start: t.start - start, end: t.end - start })) });
    }
    offset += raw.length + 1;
  }
  return result;
}

function partition(sentences) {
  const parts = [];
  let current = [];
  const shared = [];
  const introduction = sentences.filter((s) => s.paragraph <= 0).map((s) => s.text).join(" ");
  const count = introduction.match(new RegExp(`(?:連查|查獲|發生了?|有)(${NUMBER})[件起](?:毒駕|酒駕|案件|重罰)`));
  const expected = count ? number(count[1]) : /(?:兩|2)起.{0,16}(?:案件|事故)|(?:兩|2)件.{0,10}案件|毒駕與酒駕案件|毒後駕車及毒駕拒測各1件/.test(introduction) ? 2 : null;
  const sharedParagraphs = new Set(sentences.filter((s) => s.paragraph === 0 &&
    (/分別查獲|兩起.{0,16}(?:案件|事故)|兩件.{0,10}案件|連續查獲毒駕與酒駕案件/.test(s.text) || expected > 1)).map((s) => s.paragraph));
  for (const s of sentences.filter((s) => s.scope === "event")) {
    if (sharedParagraphs.has(s.paragraph)) {
      shared.push(s); continue;
    }
    const namedDriverStart = new RegExp(`^\\d{1,3}歲[${SURNAMES}]姓(?:男子|女子).{0,8}(?:騎|駕)`);
    const startsAnother = /^(?:另一起|另案|另外一起|第[二三四五][起案件]|另[，,])|(?:毒駕|酒駕)案.{0,8}處理完/.test(s.text) ||
      (expected > 1 && (namedDriverStart.test(s.text) || /接著在.{0,20}(?:日|晚)|最.{0,8}的是.{0,20}查獲的案件/.test(s.text)));
    if (startsAnother && current.length) { parts.push(current); current = []; }
    current.push(s);
  }
  if (current.length) parts.push(current);
  const unresolved = expected > 1 ? parts.length !== expected : shared.length > 0 && parts.length < 2;
  return { parts: unresolved ? [] : parts, shared, unresolved, expected };
}

function genderOf(label) {
  if (/女子|女大生|女騎士|女駕駛|婦|妻|女兒|妹妹|姊|姐|母|女$/.test(label)) return "female";
  if (/男子|男大生|男騎士|男駕駛|老翁|丈夫|父|翁$|男$/.test(label)) return "male";
  return null;
}

function actorsIn(part) {
  const actors = [], mentions = new Map(), issues = [];
  const add = (s, start, surface, details) => {
    const candidates = actors.filter((a) => details.family ? a.family === details.family :
      a.surname === details.surname && !a.family && (!a.gender || !details.gender || a.gender === details.gender) &&
      (a.age === null || details.age === null || a.age === details.age));
    let actor = candidates.length === 1 ? candidates[0] : null;
    if (candidates.length > 1) {
      issues.push(`ambiguous_person:${surface}`);
      return;
    }
    if (!actor) {
      actor = { id: `person-${actors.length + 1}`, label: surface, surname: details.surname || null,
        family: details.family || null, age: details.age, gender: details.gender, aliases: [], roles: [],
        vehicles: [], outcomes: [], drugEvidence: [], evidence: [] };
      actors.push(actor);
    }
    if (actor.age === null && details.age !== null) actor.age = details.age;
    if (!actor.gender && details.gender) actor.gender = details.gender;
    actor.aliases = unique([...actor.aliases, surface]);
    actor.evidence = evUnique([...actor.evidence, evidence(s)]);
    const list = mentions.get(s.id) || [];
    if (!list.some((m) => m.start === start && m.actorId === actor.id)) list.push({ start, end: start + surface.length, actorId: actor.id, surface });
    mentions.set(s.id, list);
    return actor;
  };
  const named = new RegExp(`(?:(\\d{1,3})歲)?([${SURNAMES}])(?:姓)?(?:火鍋店|小吃店|餐廳|小學|國小|國中|高中)?(男大生|女大生|男騎士|女騎士|男駕駛|女駕駛|男子|女子|老翁|老婦|婦人|妻子|丈夫|女兒|駕駛|騎士|老闆|老師|犯嫌|友人|男|女|嫌|翁|婦)(?:[（(](\\d{1,3})歲[）)])?`, "g");
  for (const s of part) {
    for (const match of s.text.matchAll(named)) {
      // Long role labels need an explicit surname marker or age. Otherwise
      //「造成男大生…」would fabricate a person surnamed 成.
      if (match[3].length > 1 && !match[0].includes("姓") && !match[1] && !match[4]) continue;
      if (/^(?:駕駛|騎士)$/.test(match[3]) && !match[0].includes("姓") && !match[1] && !match[4]) continue;
      const prefixAge = s.text.slice(0, match.index).match(/(\d{1,3})歲(?:駕駛|騎士)$/)?.[1];
      const age = match[1] || match[4] || prefixAge ? Number(match[1] || match[4] || prefixAge) : null;
      const a = add(s, match.index, match[0], { surname: match[2], age, gender: genderOf(match[3]) });
      const prefix = s.text.slice(Math.max(0, match.index - 12), match.index);
      const suffix = s.text.slice(match.index + match[0].length, match.index + match[0].length + 20);
      if (a && (/駕駛|騎士/.test(match[3]) || /(?:駕駛|騎士)$/.test(prefix))) a.roles = unique([...a.roles, "driver"]);
      if (a && /^(?:酒後|飲酒後|獨自)?(?:駕駛|駕車|開車|騎乘|騎車|騎(?:機車|微型))/.test(suffix)) a.roles = unique([...a.roles, "driver"]);
      if (a && /^(?:涉嫌|疑似)?(?:毒駕|酒駕)上路/.test(suffix)) a.roles = unique([...a.roles, "driver"]);
      if (a && /(?:副駕|乘客|載著)(?:\d{1,3}歲)?(?:妻子|丈夫)?$/.test(prefix)) a.roles = unique([...a.roles, "passenger"]);
      const vehicle = prefix.match(/(微型電動二輪車|機車|小貨車|貨車|汽車|轎車)(?:駕駛|騎士)$/)?.[1];
      if (a && vehicle) a.vehicles.push({ type: vehicleType(vehicle), raw: vehicle, evidence: [evidence(s)] });
      if (a && /肇事(?:的)?$/.test(s.text.slice(Math.max(0, match.index - 5), match.index))) a.roles.push("alleged_driver");
    }
  }
  // Resolve explicit kinship labels separately, never merge two sisters by surname.
  for (const s of part) {
    for (const match of s.text.matchAll(FAMILY)) {
      const covered = (mentions.get(s.id) || []).find((m) => (m.start <= match.index && m.end >= match.index + match[0].length) ||
        (m.start >= match.index + match[0].length && /^\s*$/.test(s.text.slice(match.index + match[0].length, m.start))));
      if (covered) {
        const a = actors.find((a) => a.id === covered.actorId);
        a.family = match[0] === "姐姐" ? "姊姊" : match[0];
        a.aliases = unique([...a.aliases, match[0]]);
        const age = s.text.slice(0, match.index).match(/(\d{1,3})歲$/)?.[1];
        if (a.age === null && age) a.age = Number(age);
        continue;
      }
      const family = match[0] === "姐姐" ? "姊姊" : match[0];
      const age = s.text.slice(0, match.index).match(/(\d{1,3})歲$/)?.[1];
      if (!age && (/妻子|丈夫|岳父|岳母|父親|母親/.test(family) || /岳父、岳母/.test(s.text))) {
        issues.push(`unresolved_family_reference:${family}`);
        continue;
      }
      add(s, match.index, match[0], { family, surname: null, age: age ? Number(age) : null, gender: genderOf(family) });
    }
  }
  for (const s of part) {
    const unnamed = /(?:(一|1)(?:名|位)|(\d{1,3})歲)(行人|婦人|老翁|老婦|女老師|女騎士|男騎士)/g;
    for (const match of s.text.matchAll(unnamed)) {
      if ((mentions.get(s.id) || []).some((m) => m.start >= match.index - 4 && m.start <= match.index + match[0].length + 3)) continue;
      const a = add(s, match.index, match[0], { family: `unnamed:${match[3]}`, age: match[2] ? Number(match[2]) : null, gender: genderOf(match[3]) });
      if (a) { a.aliases.push(match[3]); a.roles = unique([...a.roles, "victim"]); }
    }
  }
  // A generic label is an alias only when there is one compatible referent.
  for (const a of actors) {
    if (a.surname) {
      a.aliases.push(`${a.surname}嫌`);
      const student = a.label.match(/男大生|女大生/)?.[0];
      if (student) a.aliases.push(student);
      if (a.gender === "male") a.aliases.push(`${a.surname}男`, `${a.surname}翁`);
      if (a.gender === "female") a.aliases.push(`${a.surname}女`, `${a.surname}婦`);
    }
    a.aliases = unique(a.aliases);
  }
  for (const s of part) {
    for (const a of actors) for (const alias of a.aliases) {
      if (a.surname && /^(?:妻子|丈夫|岳父|岳母|父親|母親)$/.test(alias)) continue;
      const owners = actors.filter((person) => person.aliases.includes(alias));
      if (owners.length !== 1) continue;
      let start = s.text.indexOf(alias);
      while (start >= 0) {
        const list = mentions.get(s.id) || [];
        if (!list.some((m) => m.start <= start && m.end >= start + alias.length)) list.push({ start, end: start + alias.length, actorId: a.id, surface: alias });
        mentions.set(s.id, list);
        start = s.text.indexOf(alias, start + alias.length);
      }
    }
    mentions.set(s.id, (mentions.get(s.id) || []).sort((a, b) => a.start - b.start));
    for (const mention of mentions.get(s.id)) {
      const prefix = s.text.slice(Math.max(0, mention.start - 12), mention.start);
      const actor = actors.find((a) => a.id === mention.actorId);
      if (new RegExp(`(?:騎士|駕駛)(?:[${SURNAMES}]姓)?$`).test(prefix)) actor.roles = unique([...actor.roles, "driver"]);
      if (/副駕|乘客|後座/.test(prefix)) actor.roles = unique([...actor.roles, "passenger"]);
    }
  }
  if (!actors.length && part.some((s) => DRIVING.test(s.text))) {
    actors.push({ id: "person-1", label: "未具名駕駛", surname: null, family: null, age: null, gender: null,
      aliases: ["駕駛", "騎士"], roles: ["driver"], vehicles: [], outcomes: [], drugEvidence: [], evidence: [] });
    for (const s of part) {
      const match = s.text.match(/駕駛|騎士|男子|女子/);
      if (match) mentions.set(s.id, [{ start: match.index, end: match.index + match[0].length, actorId: "person-1", surface: match[0] }]);
    }
  }
  return { actors, mentions, issues: unique(issues) };
}

function resolveSubjects(s, index, model, previous, allowPrevious = true) {
  const list = model.mentions.get(s.id) || [];
  const comma = Math.max(s.text.lastIndexOf("，", index), s.text.lastIndexOf(",", index));
  const sentencePrefix = s.text.slice(comma + 1, index);
  // An explicit role is a constraint, not permission to reuse the nearest name.
  const role = /乘客|副駕/.test(sentencePrefix) ? "passenger" : /駕駛|肇事者|騎士/.test(sentencePrefix) ? "driver" : null;
  const compatible = (id) => !role || model.actors.some((a) => a.id === id &&
    (a.roles.includes(role) || (role === "driver" && a.roles.includes("alleged_driver"))));
  const before = list.filter((m) => m.start <= index);
  const local = before.filter((m) => m.end > comma);
  if (local.length) {
    const last = local.at(-1);
    let joiningText = s.text.slice(local[0].start, last.end);
    for (const m of [...local].sort((a, b) => b.surface.length - a.surface.length)) joiningText = joiningText.replace(m.surface, "");
    const coordinated = /^(?:與|和|及|、|乘客|騎士|行人|員警|\s)*$/.test(joiningText);
    const joined = coordinated ? local : [last];
    const ids = unique(joined.map((m) => m.actorId));
    if (role === "driver" && /^(?:駕駛|騎乘|開著)/.test(s.text.slice(last.end, index).trim()) &&
        ids.every((id) => !model.actors.find((a) => a.id === id)?.roles.includes("passenger"))) return ids;
    if (!role || ids.every(compatible)) return ids;
    const matching = ids.filter(compatible);
    if (matching.length) return matching;
    return [];
  }
  const prefix = s.text.slice(Math.max(0, comma), index);
  if (role) {
    const candidates = model.actors.filter((a) => compatible(a.id));
    if (candidates.length === 1) return [candidates[0].id];
    return [];
  }
  if (before.length && !/乘客|友人|行人|另一|員警/.test(prefix)) {
    // Do not carry an actor across an intervening explicit subject switch.
    const last = before.at(-1);
    if (!/另一|另外|至於|至於乘客|但乘客/.test(s.text.slice(last.end, index))) return [last.actorId];
  }
  if (allowPrevious && previous && !/乘客|友人|行人|另一|員警/.test(prefix)) return [previous];
  const drivers = model.actors.filter((a) => a.roles.includes("driver"));
  if (drivers.length === 1 && model.actors.length === 1 && !/乘客|友人|行人|另一|員警/.test(prefix)) return [drivers[0].id];
  return [];
}

function vehicleType(raw) {
  if (/轎車|小客車|休旅車|白牌車|賓士|BMW/.test(raw)) return "汽車";
  return raw === "腳踏車" ? "自行車" : raw;
}

function attachPeople(part, model) {
  let previous = null, previousParagraph = null;
  const unresolved = [];
  for (const s of part) {
    if (s.paragraph !== previousParagraph) previous = null;
    previousParagraph = s.paragraph;
    // Establish the action's subject before vehicle attachment. A temporal
    // phrase between a name and 駕駛 must not turn the verb into an unresolved role.
    const drivingVerb = new RegExp(`駕車|開車|騎車|(?:駕駛|騎乘)(?=(?:的|一輛|一部|白色|黑色|紅色|\\s)*(?:${VEHICLE.source}))`, "g");
    for (const verb of s.text.matchAll(drivingVerb)) for (const id of resolveSubjects(s, verb.index, model, previous)) {
      const a = model.actors.find((a) => a.id === id);
      a.roles = unique([...a.roles, "driver"]);
    }
    for (const v of s.text.matchAll(VEHICLE)) {
      const left = s.text.slice(Math.max(0, v.index - 12), v.index);
      if (!/(?:駕駛|開著|騎乘?|駕著)(?:的|一輛|一部|白色|黑色|紅色|[\s])*$/u.test(left)) continue;
      const people = resolveSubjects(s, v.index, model, previous);
      for (const id of people) {
        const a = model.actors.find((a) => a.id === id);
        a.roles = unique([...a.roles, "driver"]);
        a.vehicles.push({ type: vehicleType(v[0]), raw: v[0], evidence: [evidence(s)] });
      }
    }
    for (const clauseMatch of s.text.matchAll(/[^，,]+/g)) {
      const clause = clauseMatch[0];
      if (/毒駕致人|可處|最重|依法|若|假如|去年.*統計/.test(clause)) continue;
      for (const outcomeMatch of clause.matchAll(/未受傷|並未受傷|沒有受傷|無受傷|死亡|身亡|喪命|不治|慘死|輾斃|撞死|撞傷|受傷|重傷|輕傷|骨折|擦挫傷|擦傷|挫傷|昏迷|救治|搶救中/g)) {
        const pos = clauseMatch.index + outcomeMatch.index;
        if (outcomeMatch[0] === "死亡" && /^(?:車禍|事故|案件)/.test(s.text.slice(pos + 2))) continue;
        if (new RegExp(`${NUMBER}(?:人|名|位|死|傷)`).test(clause) && !(model.mentions.get(s.id) || []).some((m) => m.start >= clauseMatch.index && m.end <= pos)) continue;
        const state = /未受傷|沒有受傷|無受傷/.test(outcomeMatch[0]) ? "unharmed" : DEAD.test(outcomeMatch[0]) ? "dead" : "injured";
        const scopePrefix = s.text.slice(clauseMatch.index, pos);
        if (/無人|人員|附近店家|車內無人/.test(scopePrefix)) continue;
        const objectMentions = /撞死|輾斃|撞傷/.test(outcomeMatch[0]) ? (model.mentions.get(s.id) || []).filter((m) =>
          m.start > pos && m.start < pos + 24 && m.start < clauseMatch.index + clause.length) : [];
        if (/撞死|輾斃|撞傷/.test(outcomeMatch[0]) && !objectMentions.length) {
          if (s.scope !== "title") unresolved.push({ kind: "unattributed_outcome", state, evidence: [evidence(s)] });
          continue;
        }
        const people = objectMentions.length ? [objectMentions[0].actorId] : resolveSubjects(s, pos, model, previous);
        if (!people.length) { if (s.scope !== "title") unresolved.push({ kind: "unattributed_outcome", state, evidence: [evidence(s)] }); continue; }
        for (const id of people) {
          const a = model.actors.find((a) => a.id === id);
          a.outcomes.push({ state, evidence: [evidence(s)] });
          if (state !== "unharmed") a.roles = unique([...a.roles, "casualty"]);
        }
      }
    }
    const subject = (model.mentions.get(s.id) || [])[0];
    if (subject) previous = subject.actorId;
  }
  return unresolved;
}

function drugClaims(part, model, title, singleEvent) {
  const claims = [];
  let previous = null, previousParagraph = null, activeTest = null, materialSentence = null, group = [], timeScope = "current";
  for (const s of part) {
    if (s.paragraph !== previousParagraph) {
      previous = null; activeTest = null; materialSentence = null; group = []; timeScope = "current";
    }
    previousParagraph = s.paragraph;
    for (const cm of s.text.matchAll(/[^，,]+/g)) {
      const clause = cm[0];
      const nextScope = new RegExp(`${NUMBER}年前|過去曾`).test(clause) ? "past_event" : /此次|這次|這回|本次/.test(clause) ? "current" : timeScope;
      if (nextScope !== timeScope) activeTest = null;
      timeScope = nextScope;
      if (/(?:毒駕|酒駕)案.{0,8}處理完|毒駕新制|依(?:道路交通|毒駕新制)|依法.*罰|拒測將面臨|檢測者|不代表就能|最高可處|均會面臨|極易造成/.test(clause)) continue;
      if (/(?:其|他)與同車友人/.test(clause)) {
        const mentions = model.mentions.get(s.id) || [];
        const antecedent = mentions.filter((m) => m.end <= cm.index).at(-1);
        group = unique([antecedent?.actorId, ...mentions.filter((m) => m.start >= cm.index && m.end <= cm.index + clause.length).map((m) => m.actorId)].filter(Boolean));
        for (const id of group.filter((id) => id !== antecedent?.actorId)) model.actors.find((a) => a.id === id).roles.push("passenger");
      }
      const dictionarySubstances = (s.tokens || []).filter((t) => t.kind === "drug" && t.start >= cm.index && t.end <= cm.index + clause.length)
        .map((t) => ({ name: t.canonical || t.text, raw: t.text }));
      const substances = [...new Map([...dictionarySubstances, ...SUBSTANCES.flatMap(([name, pattern]) =>
        [...clause.matchAll(pattern)].map((m) => ({ name, raw: m[0] })))].map((x) => [x.name, x])).values()];
      const methods = [];
      if (/唾液|唾篩/.test(clause)) methods.push("唾液快篩/檢測");
      if (/尿液|驗尿|採尿/.test(clause)) methods.push("尿液檢驗");
      if (/血液|抽血/.test(clause)) methods.push("血液檢驗");
      const hasTest = /檢測|檢驗|快篩|唾篩|初篩|初驗|驗出|送驗/.test(clause) || methods.length > 0;
      const suspected = /不(?:能)?排除|尚未排除|無法排除|疑似|涉嫌|懷疑|是否|跡象|徵狀|疑(?:有|涉)?毒駕/.test(clause);
      const ruledOut = !suspected && /排除(?:[\p{Script=Han}]{1,8})?毒駕|(?:無|沒有)(?:酒駕[、或及與]?|飲酒[、或及與]?)?毒駕|未發現毒駕/u.test(clause);
      const denied = /否認|並未施用|沒有吸|未施用/.test(clause);
      const consumption = /吸毒|吸食(?!器)|施用|拉[Kk]/.test(clause);
      const pastUse = consumption && new RegExp(`多日前|數日前|${NUMBER}天前|${NUMBER}年前|上週|去年|前年|曾經`).test(clause);
      const afterEventUse = consumption && /事故後|撞車後|肇事後/.test(clause);
      const possession = /起獲|起出|查獲|查扣|搜出|持有|攜帶|交付|車內.*(?:發現|尋獲)/.test(clause) &&
        (substances.length > 0 || /煙彈|菸彈|粉末|夾鏈袋|[Kk]盤/.test(clause));
      const alcoholOnly = /酒測|酒精|呼氣/.test(clause) && !/毒|唾液|尿液|血液/.test(clause) && !substances.length;
      const refused = /拒測|拒絕|不願|不配合/.test(clause) && Boolean(hasTest || activeTest);
      const pending = /送驗|待驗|尚待|等待|釐清|將.*(?:抽血|驗尿|檢驗)/.test(clause);
      const positive = /陽性|(?:呈現?|[均都]?有)毒品反應/.test(clause) && !/未呈|非陽性|不是陽性|未有/.test(clause);
      const negative = /陰性|未驗出|未檢出|均無.*反應/.test(clause);
      if (!substances.length && !hasTest && !consumption && !/毒駕/.test(clause) && !positive && !negative && !refused && !possession) continue;

      const local = (model.mentions.get(s.id) || []).filter((m) => m.start >= cm.index && m.end <= cm.index + clause.length);
      let position = cm.index + Math.max(0, clause.search(/毒駕|毒品|唾液|尿液|血液|檢測|檢驗|快篩|陽性|吸食|施用|起獲|查獲/));
      // A descriptor such as「肇事毒駕的林男」has its subject after the keyword.
      if (!local.some((m) => m.start <= position) && local[0]?.start <= position + 12) position = local[0].end;
      let people = resolveSubjects(s, position, model, previous);
      if (group.length && /(?:初篩|檢測|檢驗).{0,4}(?:均|都)/.test(clause)) people = group;
      if (possession && /車內|車上/.test(clause) && !local.length) {
        const alleged = model.actors.filter((a) => a.roles.includes("alleged_driver"));
        const drivers = alleged.length ? alleged : model.actors.filter((a) => a.roles.includes("driver"));
        people = drivers.length === 1 ? [drivers[0].id] : [];
      }
      if (/乘客|同車友人|友人則/.test(clause) && !local.length) people = [];
      if (possession) materialSentence = s.id;
      const explicitMaterial = /(?:煙彈|菸彈|粉末|夾鏈袋|內容物|物品).{0,16}(?:檢測|檢驗|化驗|陽性)/.test(clause);
      const explicitPerson = methods.length > 0 || (group.length > 0 && people === group) || (!explicitMaterial && ((local.length > 0 && hasTest) ||
        (people.length === 1 && /被驗出|對其.{0,8}(?:檢|驗|篩)/.test(clause))));
      let testKind = alcoholOnly ? "alcohol_test" : explicitPerson ? "person_test" :
        explicitMaterial || materialSentence === s.id ? "material_test" : "unknown_test";
      // Continue one test episode only across compatible subject, time and target.
      const sameSubject = !local.length ? !/乘客|友人/.test(clause) : people.every((id) => activeTest?.actorIds.includes(id));
      const sameMethod = !methods.length || methods.every((m) => activeTest?.methods.includes(m));
      const resultOnly = (positive || negative || refused) && !possession && !consumption;
      if (activeTest && resultOnly && sameSubject && sameMethod && !alcoholOnly &&
          !explicitMaterial && (!explicitPerson || activeTest.kind === "person_test") &&
          (!refused || ["requested", "reported", "pending"].includes(activeTest.status))) {
        activeTest.status = refused ? "refused" : positive ? "positive" : "negative";
        activeTest.substances = [...new Map([...activeTest.substances, ...substances].map((x) => [x.name, x])).values()];
        activeTest.evidence = evUnique([...activeTest.evidence, evidence(s)]);
        activeTest.text += `，${clause}`;
        continue;
      }
      const kind = alcoholOnly ? "alcohol_test" : hasTest || positive || negative ? testKind : refused ? "test_refusal" : consumption ? "consumption" : possession ? "possession" : /毒駕/.test(clause) ? "reported_drug_driving" : "substance_mention";
      let status = ruledOut ? "ruled_out" : denied ? "denied" : refused ? "refused" : negative ? "negative" : positive ? "positive" :
        /要求/.test(clause) && hasTest ? "requested" : pending ? "pending" : suspected ? "suspected" :
        consumption ? (/坦承|自稱|供稱/.test(clause) ? "self_reported" : "reported_use") : "reported";
      if (pastUse || afterEventUse) status = pastUse ? "past_use" : "after_event_use";
      const claim = { kind, actorIds: people, substances, methods, status,
        timeScope: /駕照早因|曾因.{0,8}毒駕/.test(clause) ? "past_event" : timeScope, text: clause, evidence: [evidence(s)] };
      if (["person_test", "material_test", "unknown_test"].includes(kind) && hasTest) { activeTest = claim; materialSentence = null; }
      // Possession starts a new object context and must not complete an older body test.
      else if (possession) activeTest = null;
      claims.push(claim);
      for (const id of people) model.actors.find((a) => a.id === id).drugEvidence.push(claim);
    }
    const subject = (model.mentions.get(s.id) || [])[0];
    if (subject) previous = subject.actorId;
  }
  if (singleEvent && /毒駕/.test(title.text) && !/政策|統計|宣導|修法/.test(title.text)) {
    claims.push({ kind: "reported_drug_driving", actorIds: [], substances: [], methods: [], timeScope: "current", text: title.text,
      status: /疑|？|\?/.test(title.text) ? "suspected" : "reported", evidence: [evidence(title)] });
  }
  return claims;
}

function drivingStatus(actors, claims) {
  const drivers = actors.filter((a) => a.roles.includes("driver") || a.roles.includes("alleged_driver"));
  const linked = claims.filter((c) => c.timeScope !== "past_event" && c.actorIds.some((id) => drivers.some((a) => a.id === id)));
  const global = claims.filter((c) => c.kind === "reported_drug_driving" && c.timeScope !== "past_event" &&
    (c.evidence.some((e) => e.sentenceId === "title") || c.actorIds.some((id) => drivers.some((a) => a.id === id))));
  const use = linked.filter((c) => c.kind === "consumption" && ["reported_use", "self_reported"].includes(c.status));
  const positive = linked.filter((c) => c.kind === "person_test" && c.status === "positive");
  const exclusion = [...linked, ...global].filter((c) => c.status === "ruled_out");
  const reported = [...global.filter((c) => ["reported", "suspected", "pending", "refused"].includes(c.status)),
    ...linked.filter((c) => (c.kind === "consumption" && c.status === "suspected") || (c.kind === "person_test" && c.status === "refused"))];
  let status = positive.length || use.length ? "reported_positive_or_use" : reported.length ? "suspected" : "not_supported";
  if (exclusion.length) status = status === "reported_positive_or_use" ? "conflicting" : "ruled_out";
  const positiveIds = unique([...positive, ...use].flatMap((c) => c.actorIds)).filter((id) => drivers.some((a) => a.id === id));
  let principal = positiveIds.map((id) => actors.find((a) => a.id === id)).filter(Boolean);
  if (!principal.length) principal = drivers.filter((a) => a.roles.includes("alleged_driver"));
  if (!principal.length && drivers.length === 1 && reported.length) principal = drivers;
  for (const a of principal) a.roles = unique([...a.roles, "alleged_driver"]);
  return { status, actorIds: principal.map((a) => a.id), evidence: evUnique([...positive, ...use, ...reported, ...exclusion].flatMap((c) => c.evidence)) };
}

function alcoholClaims(part, model, title, singleEvent) {
  const claims = [];
  let previous = null, paragraph = null;
  for (const s of part) {
    if (s.paragraph !== paragraph) previous = null;
    paragraph = s.paragraph;
    for (const cm of s.text.matchAll(/[^，,]+/g)) {
      const clause = cm[0];
      const lexical = (s.tokens || []).some((t) => t.kind === "alcohol_test" && t.start >= cm.index && t.end <= cm.index + clause.length);
      if (!lexical && !/酒測|酒精|酒駕|醉駕|飲酒|喝酒|酒後|呼氣/.test(clause)) continue;
      if (/最高可處|呼籲|切勿|宣導|禁止酒駕|取締.*件|累計|過去.*紀錄/.test(clause)) continue;
      let position = cm.index + Math.max(0, clause.search(/酒測|酒精|酒駕|飲酒|喝酒|酒後|呼氣/));
      const mentions = (model.mentions.get(s.id) || []).filter((m) => m.start >= cm.index && m.end <= cm.index + clause.length);
      if (!mentions.some((m) => m.start <= position) && mentions[0]?.start <= position + 12) position = mentions[0].end;
      let actorIds = resolveSubjects(s, position, model, previous);
      if (/乘客|友人|行人/.test(clause) && !mentions.length) actorIds = [];
      const isTest = /酒測|酒精濃度|呼氣|血液.*酒精|實施酒駕.{0,20}檢測/.test(clause);
      const reading = clause.match(/(?:酒測(?:值|結果|濃度)?|酒精濃度|呼氣(?:酒精)?濃度)(?:為|達|高達|竟達|測得|測出|每公升|是|則為|竟|超過|逾|近|約|[:：\s])*([0-9]+(?:\.[0-9]+)?)\s*(毫克[／/]公升|毫克|mg\s*[／/]\s*[lL]|mg\s*[／/]\s*d[lL]|%|％|公克[／/]公升)?/i);
      const value = reading ? Number(reading[1]) : null;
      const rawUnit = reading?.[2] || null;
      const unit = rawUnit && (/mg\s*[／/]\s*d[lL]/i.test(rawUnit) ? "mg/dL" : /%|％/.test(rawUnit) ? "%" : /公克/.test(rawUnit) ? "g/L" : /公升|mg/i.test(rawUnit) || /每公升/.test(reading[0]) ? "mg/L" : null);
      const specimen = /血液|抽血|血中/.test(clause) ? "blood" : /呼氣|吐氣|吹氣/.test(clause) ? "breath" : null;
      const pending = /待驗|送驗|結果未|尚待|等待/.test(clause);
      const refusal = /拒測|拒絕|不配合|不願/.test(clause);
      const suspected = /不(?:能)?排除|尚未排除|無法排除|疑似|疑涉|疑酒駕|涉嫌|是否/.test(clause);
      const negative = /陰性|(?:沒有|無)酒精(?:測試)?反應|未飲酒|未喝酒|沒有飲酒|無飲酒|酒測(?:值)?(?:為|是)?[零0](?![.\d])/.test(clause) || (reading && value === 0) || (!suspected && /排除酒駕|無酒駕|未發現酒駕|未酒駕|並非酒駕|非酒駕|沒有酒駕/.test(clause));
      const positive = (reading && value > 0 && Boolean(unit)) || /酒精.*(?:陽性|超標)|酒測.*(?:超標|超過法定標準)/.test(clause);
      const status = refusal ? "refused" : pending ? "pending" : negative ? "ruled_out" : positive ? "positive" : /否認/.test(clause) ? "denied" : suspected ? "suspected" : "reported";
      claims.push({ kind: isTest ? "alcohol_test" : /酒駕|醉駕|酒後.{0,8}(?:開車|駕車|騎車)/.test(clause) ? "reported_alcohol_driving" : "alcohol_consumption",
        actorIds, methods: isTest ? [specimen === "blood" ? "血液酒精檢測" : specimen === "breath" ? "呼氣酒精檢測" : "酒精檢測（檢體未明）"] : [],
        value, unit, rawUnit, specimen, approximate: reading ? /超過|逾|近|約/.test(reading[0]) : false,
        status, timeScope: /曾因|過去曾|去年|前年|多年前/.test(clause) ? "past_event" : "current", text: clause, evidence: [evidence(s)] });
    }
    const first = (model.mentions.get(s.id) || [])[0];
    if (first) previous = first.actorId;
  }
  if (singleEvent && /酒駕|醉駕/.test(title.text)) claims.push({ kind: "reported_alcohol_driving", actorIds: [], methods: [], value: null, unit: null,
    rawUnit: null, specimen: null, status: /疑|？|\?/.test(title.text) ? "suspected" : /排除|並非|非酒駕/.test(title.text) ? "ruled_out" : "reported",
    timeScope: "current", text: title.text, evidence: [evidence(title)] });
  return claims;
}

function alcoholStatus(model, claims) {
  const drivers = model.actors.filter((a) => a.roles.includes("driver") || a.roles.includes("alleged_driver"));
  const linked = claims.filter((c) => c.timeScope === "current" && c.actorIds.some((id) => drivers.some((a) => a.id === id)));
  const positive = linked.filter((c) => c.status === "positive" || (c.kind === "reported_alcohol_driving" && c.status === "reported"));
  const negative = linked.filter((c) => c.status === "ruled_out");
  const mention = claims.filter((c) => c.timeScope === "current" &&
    ((c.kind === "reported_alcohol_driving" && ["reported", "suspected"].includes(c.status)) || (linked.includes(c) && ["refused", "pending", "suspected"].includes(c.status))));
  const status = negative.length ? positive.length ? "conflicting" : "ruled_out" : positive.length ? "reported_positive_or_use" : mention.length ? "suspected" : "not_supported";
  const actorIds = unique(positive.flatMap((c) => c.actorIds)).filter((id) => drivers.some((a) => a.id === id));
  if (!actorIds.length && mention.length && drivers.length === 1) actorIds.push(drivers[0].id);
  for (const a of model.actors.filter((a) => actorIds.includes(a.id))) a.roles = unique([...a.roles, "alleged_driver"]);
  return { status, actorIds, evidence: evUnique([...positive, ...negative, ...mention].flatMap((c) => c.evidence)) };
}

function roadLocation(part) {
  for (const s of part) {
    const match = s.text.match(/(?:行經|行駛於|位於|駕車在|騎車在|在|於)([\p{Script=Han}A-Za-z0-9]{2,20}?(?:路|街)(?:[一二三四五六七八九十0-9]+段)?(?:[、與][\p{Script=Han}A-Za-z0-9]{2,12}?(?:路|街))?(?:口|段)?)/u);
    if (match && !/逃到|警方|前往|雨天|某路|道路|時30分|撞/.test(match[1])) return { value: match[1].replace(/^[^市縣]{1,5}[市縣]/, ""), evidence: [evidence(s)] };
  }
  return { value: null, evidence: [] };
}

function location(part, title) {
  const candidates = [];
  for (const s of [...part, title]) for (const match of s.text.matchAll(CITY)) {
    const before = s.text.slice(Math.max(0, match.index - 12), match.index);
    const after = s.text.slice(match.index, match.index + 30);
    let score = s.scope === "title" ? 0 : 1;
    if (/行經|發生在|行駛於|撞擊地點|駕車在|騎車在/.test(before)) score += 5;
    if (/逃到|追到|逮捕|逮獲|住在|居住|移送/.test(before) || /地檢署/.test(after)) score -= 6;
    if (/事故|車禍|撞|逆向/.test(after)) score += 1;
    candidates.push({ value: CITY_ALIASES[match[0]], score, evidence: [evidence(s)] });
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates.length ? { value: candidates[0].value, evidence: candidates[0].evidence,
    alternatives: unique(candidates.filter((c) => c.value !== candidates[0].value).map((c) => c.value)) } : { value: null, evidence: [], alternatives: [] };
}

function occurrence(part, publishedAt) {
  const anchor = new Date(`${publishedAt}T00:00:00Z`);
  for (const s of part) {
    // Policy commencement and announcement dates are not the incident date,
    // even when a news lead discusses the new rule and a concrete case together.
    const value = s.text.split(/[，,]/).filter((clause) => !/(?:條例|法案|法規|新制|修正案).{0,40}(?:公告|施行|實施|生效|上路)/.test(clause)).join("，")
      .replace(/(?:今|今日|今天)[^，。]{0,12}(?:指出|表示|說明|訊後|聲押)/g, "");
    const relative = value.match(/前天|前日|昨天|昨日|昨晚|昨夜|昨（\d{1,2}）日|今晨|今早|今凌晨|今天|今日|今（\d{1,2}）日/);
    const explicit = value.match(/(?:(20\d{2})年)?(\d{1,2})月(\d{1,2})日/);
    const day = value.match(/(?<!\d)(\d{1,2})日(?:晚|傍晚|上|下|清晨|凌晨|早|中午)/);
    let date = null, raw = null;
    if (explicit) {
      date = new Date(Date.UTC(Number(explicit[1] || anchor.getUTCFullYear()), Number(explicit[2]) - 1, Number(explicit[3])));
      if (date.getUTCMonth() !== Number(explicit[2]) - 1 || date.getUTCDate() !== Number(explicit[3])) date = null;
      raw = explicit[0];
    } else if (relative) {
      date = new Date(anchor); date.setUTCDate(date.getUTCDate() - (/前/.test(relative[0]) ? 2 : /昨/.test(relative[0]) ? 1 : 0)); raw = relative[0];
    } else if (day) {
      date = new Date(anchor); date.setUTCDate(1);
      if (Number(day[1]) > anchor.getUTCDate()) date.setUTCMonth(date.getUTCMonth() - 1);
      date.setUTCDate(Number(day[1])); raw = day[0];
    }
    if (date) return { value: date.toISOString().slice(0, 10), raw, precision: "day", evidence: [evidence(s)] };
  }
  return { value: null, raw: null, precision: "unknown", evidence: [] };
}

function explicitCorrection(text) {
  const match = text.match(new RegExp(`(?:原(?:先)?(?:報導|誤報)?(?:為)?|誤植為)(${NUMBER})(?:人)?(死亡|受傷|死|傷).{0,20}(?:更正|修正|應為|實為)(?:為)?(${NUMBER})(?:人)?(死亡|受傷|死|傷)`));
  if (!match || /死/.test(match[2]) !== /死/.test(match[4])) return null;
  return { field: /死/.test(match[2]) ? "deaths" : "injuries", value: number(match[3]), previousValue: number(match[1]) };
}

function casualtyClaims(part, title, useTitle) {
  const claims = [];
  for (const s of [...(useTitle ? [title] : []), ...part]) {
    if (/網傳|誤傳|不實|謠言|否認.*(?:死|傷)|歷年|統計|平均/.test(s.text)) continue;
    const correction = s.field === "body" ? explicitCorrection(s.text) : null;
    if (correction) claims.push({ kind: correction.field, value: correction.value, scope: "reported_total", approximate: false, evidence: [evidence(s)] });
    const subset = /其中|包括|分別/.test(s.text) && !/共|合計|總計/.test(s.text);
    const groupInjury = s.text.match(new RegExp(`(${NUMBER})人(?:一度受困|意識清楚)[，,](?:(?:所幸|僅|由救護車送醫救治|意識清楚|、|[，,]){0,8})(?:受|受到)(?:擦挫傷|輕傷|擦傷)`));
    if (groupInjury && !subset) claims.push({ kind: "injuries", value: number(groupInjury[1]), scope: "reported_total", approximate: false, evidence: [evidence(s)] });
    const admitted = s.text.match(new RegExp(`(${NUMBER})(?:人|名)(?:傷者)?(?:受傷)?送醫`));
    const subsequentlyDead = s.text.match(new RegExp(`其中(${NUMBER})(?:人|名)(?:傷者)?(?:死亡|身亡|不治)`));
    const transition = admitted && subsequentlyDead && number(admitted[1]) >= number(subsequentlyDead[1]);
    if (transition) {
      claims.push({ kind: "deaths", value: number(subsequentlyDead[1]), scope: "reported_total", approximate: false, evidence: [evidence(s)] });
      claims.push({ kind: "injuries", value: number(admitted[1]) - number(subsequentlyDead[1]), scope: "reported_total", approximate: false, derived: "group_state_transition", evidence: [evidence(s)] });
    }
    for (const [kind, expression] of [
      ["deaths", `${NUMBER}(?:死(?!傷)|(?:人|名|位)(?:當場)?(?:死亡|身亡|喪命))`],
      ["deaths", `(?:撞死|輾斃)${NUMBER}(?:人|名|位)(?!歲)`],
      ["injuries", `${NUMBER}(?:傷(?!亡)|(?:人|名|位)(?:員警|警員|騎士|乘客|行人|及|分受|受到|輕重){0,8}(?:受傷|輕傷|重傷|擦挫傷))`],
      ["injuries", `撞傷${NUMBER}(?:(?:名)?(?:員警|警員|警)|人|名|位)(?!歲)`],
    ]) for (const match of s.text.matchAll(new RegExp(expression, "g"))) {
      if (transition || correction?.field === kind) continue;
      const rawNumber = match[0].match(new RegExp(NUMBER))?.[0];
      const before = s.text.slice(Math.max(0, match.index - 12), match.index);
      if (/未造成|沒有造成|並非|否認|未證實/.test(before)) continue;
      const approximate = /至少|超過|逾|約|近/.test(before) || /餘/.test(match[0]);
      const value = number(rawNumber);
      const minimum = /約|近/.test(before) ? null : /超過|逾/.test(before) ? value + 1 : value;
      claims.push({ kind, value, minimum, scope: subset ? "subset" : "reported_total", approximate, evidence: [evidence(s)] });
    }
    const zero = s.text.match(/(?:無人(?:員)?|沒有(?:造成)?人員|未造成(?:人員)?|並無人員)(傷亡|死傷|死亡|受傷)/);
    if (zero) {
      const before = s.text.slice(Math.max(0, zero.index - 16), zero.index);
      if (!/附近|店家|屋內|車內|店內|員警|駕駛|騎士/.test(before)) {
        for (const kind of zero[1] === "死亡" ? ["deaths"] : zero[1] === "受傷" ? ["injuries"] : ["deaths", "injuries"]) claims.push({ kind, value: 0, scope: "reported_total", approximate: false, evidence: [evidence(s)] });
      }
    }
    if (/雙亡/.test(s.text)) claims.push({ kind: "deaths", value: 2, scope: "reported_total", approximate: false, evidence: [evidence(s)] });
    if (/多人受傷|數人受傷/.test(s.text)) claims.push({ kind: "injuries", value: 2, scope: "lower_bound", approximate: true, evidence: [evidence(s)] });
  }
  return claims;
}

function countCasualties(kind, claims, model, unresolved) {
  const state = kind === "deaths" ? "dead" : "injured";
  const people = model.actors.filter((a) => {
    const final = a.outcomes.some((o) => o.state === "dead") ? "dead" : a.outcomes.some((o) => o.state === "injured") ? "injured" : "unknown";
    return final === state;
  });
  const relevant = claims.filter((c) => c.kind === kind);
  const totals = relevant.filter((c) => c.scope === "reported_total" && !c.approximate && c.value !== null);
  const values = unique(totals.map((c) => c.value));
  const minimum = Math.max(people.length, ...relevant.map((c) => ("minimum" in c ? c.minimum : c.value) ?? 0), 0);
  const source = evUnique([...relevant.flatMap((c) => c.evidence), ...people.flatMap((a) => a.outcomes.filter((o) => o.state === state).flatMap((o) => o.evidence))]);
  if (values.length > 1 || (values.length === 1 && minimum > values[0])) return { value: null, minimum, basis: "conflicting", evidence: source };
  if (values.length === 1) return { value: values[0], minimum: values[0], basis: totals.some((c) => c.derived) ? "group_state_transition" : "explicit_total", evidence: source };
  const ambiguity = model.issues.some((x) => x.startsWith("ambiguous_person")) || unresolved.some((x) => x.state === state) || relevant.some((c) => c.approximate);
  if (people.length && !ambiguity) return { value: people.length, minimum: people.length, basis: "identified_people", evidence: source };
  return { value: null, minimum: minimum || null, basis: minimum ? "lower_bound" : "not_reported", evidence: source };
}

function casualtyUpdate(part, event) {
  const currentFacts = {};
  for (const s of part) {
    const correction = explicitCorrection(s.text);
    if (correction) {
      const { field, value, previousValue } = correction;
      if (event.casualties[field].value === value) {
        currentFacts[field] = { value, previousValue, actorIds: [], evidence: [evidence(s)] };
        return { updateKind: "correction", currentFacts };
      }
    }
    const group = s.text.match(new RegExp(`(${NUMBER})(?:人|名)(?:傷者)?(?:受傷)?送醫.*其中(${NUMBER})(?:人|名)(?:傷者)?(?:死亡|身亡|不治)`));
    const dead = event.actors.filter((a) => a.outcomes.some((o) => o.state === "dead" && o.evidence.some((e) => e.sentenceId === s.id)));
    if (group && dead.length === number(group[2]) && event.casualties.injuries.basis === "group_state_transition") {
      currentFacts.injuries = { value: event.casualties.injuries.value, previousValue: number(group[1]), actorIds: dead.map((a) => a.id), evidence: [evidence(s)] };
      // A group of previously injured survivors has no fatalities in that group.
      // Event-wide deaths are changed only if the matching old total also agrees.
      currentFacts.deaths = { value: event.casualties.deaths.value, previousValue: 0, actorIds: dead.map((a) => a.id), evidence: [evidence(s)] };
      return { updateKind: "casualty_transition", currentFacts };
    }
  }
  return { updateKind: null, currentFacts };
}

function scenarioTags(part) {
  const patterns = [
    ["逆向", /逆向/], ["闖紅燈", /闖紅燈/], ["綠燈未行", /綠燈.{0,15}(?:不走|不動|未起步)/],
    ["拒檢逃逸", /拒檢.{0,15}(?:逃|衝)|攔(?:查|檢).{0,20}(?:加速逃|逃逸)/],
    ["自摔/失控", /自摔|失控/], ["衝撞警員/警車", /撞.{0,8}(?:警員|員警|警車|警用)/],
    ["肇事逃逸", /肇逃|肇事.{0,10}逃逸|撞.{0,15}逃逸/], ["碰撞", /撞|輾壓|捲(?:入)?車底/],
    ["行駛人行道", /(?:騎|行駛|駛入).{0,8}人行道/],
  ];
  return patterns.filter(([, p]) => part.some((s) => p.test(s.text))).map(([label]) => label);
}

function trafficContext(part, title, useTitle) {
  const statements = [...part, ...(useTitle ? [title] : [])];
  const notStarted = part.filter((s) => /車子還未行駛|尚未(?:開車|行駛)|還沒(?:開車|上路)/.test(s.text));
  const danger = statements.filter((s) => DANGER.test(s.text));
  const driving = part.filter((s) => DRIVING.test(s.text));
  const collision = statements.filter((s) => /撞|翻車|自摔|車禍|捲(?:入)?車底|(?:墜落|滑落).{0,10}邊坡/.test(s.text));
  return { concreteDanger: danger.length > 0, observedDriving: driving.length > 0 && !notStarted.length,
    eventType: collision.length ? "collision" : danger.length ? "dangerous_driving" : driving.length && !notStarted.length ? "driving" : null,
    status: danger.length ? "concrete_danger" : notStarted.length ? "not_started_or_unclear" : driving.length ? "driving_reported" : "unknown",
    evidence: evUnique([...danger, ...driving, ...notStarted].map(evidence)) };
}

function profile(event, part) {
  const principal = event.actors.filter((a) => [...event.drugDriving.actorIds, ...event.alcoholDriving.actorIds].includes(a.id));
  const driver = principal.length === 1 ? principal[0] : null;
  const claims = driver ? driver.drugEvidence : event.drugClaims.filter((c) => c.kind === "reported_drug_driving");
  const vehicles = driver ? unique(driver.vehicles.map((v) => v.type)) : [];
  const evidenceClaims = claims.filter((c) => c.timeScope !== "past_event" && !["negative", "denied", "ruled_out", "past_use", "after_event_use"].includes(c.status));
  const keywords = unique(evidenceClaims.flatMap((c) => c.substances.map((x) => x.name)));
  const testMethods = unique(evidenceClaims.filter((c) => c.kind === "person_test" && !["refused", "requested"].includes(c.status)).flatMap((c) => c.methods));
  const scheduleClassifications = [];
  for (const claim of evidenceClaims) for (const substance of claim.substances) for (const e of claim.evidence) {
    const offset = e.quote.indexOf(substance.raw);
    const grade = offset < 0 ? null : e.quote.slice(Math.max(0, offset - 12), offset).match(/(第?[一二三四]級)(?:毒品)?[^，、；。]{0,4}$/)?.[1];
    if (grade && !scheduleClassifications.some((x) => x.keyword === substance.name && x.schedule === grade)) {
      scheduleClassifications.push({ keyword: substance.name, schedule: grade, label: `${grade}毒品`, confidence: "reported", basis: "原文記載的級別，未據此確認現行法規", evidence: [e] });
    }
  }
  const victimActors = event.actors.filter((a) => a.roles.includes("casualty") && !principal.includes(a));
  const body = part.map((s) => s.text).join(" ");
  const activities = [];
  if (/行人|過馬路|斑馬線/.test(body) && victimActors.length) activities.push("行人/過馬路");
  if (/停等紅燈|等候左轉/.test(body) && victimActors.length) activities.push("停等紅燈/待轉");
  if (/員警.{0,15}(?:受傷|擦挫傷)|撞傷.{0,4}警/.test(body)) activities.push("警務執勤");
  const vulnerableGroups = [];
  if (victimActors.some((a) => a.age !== null && a.age >= 65)) vulnerableGroups.push("高齡者");
  if (victimActors.some((a) => a.age !== null && a.age < 18)) vulnerableGroups.push("未成年人");
  if (activities.includes("警務執勤")) vulnerableGroups.push("警務人員");
  const placeTypes = [];
  if (/國道|高速公路|快速道路/.test(body)) placeTypes.push("國道/快速道路");
  if (/路口|路段|道路/.test(body)) placeTypes.push("一般道路/路口");
  if (/攔查|攔檢/.test(body)) placeTypes.push("警方攔查現場");
  const age = driver?.age ?? null;
  const ageGroup = age === null ? null : age < 18 ? "under-18" : age < 25 ? "18-24" : age < 35 ? "25-34" : age < 45 ? "35-44" : age < 55 ? "45-54" : age < 65 ? "55-64" : "65+";
  return {
    driver: { age, ageGroup, gender: driver?.gender ?? null, vehicleTypes: vehicles,
      allMentionedVehicleTypes: unique([...body.matchAll(VEHICLE)].map((v) => vehicleType(v[0]))),
      primaryVehicleType: vehicles.length === 1 ? vehicles[0] : null,
      primaryVehicleLabel: vehicles.length === 1 ? driver.vehicles[0].raw : null, vehicleExtractionMethod: "actor_linked_article_text" },
    drug: { keywords, testMethods, status: event.drugDriving.status, findings: claims.filter((c) => c.timeScope !== "past_event"), scheduleClassifications,
      scheduleLabels: unique(scheduleClassifications.map((x) => x.label)), scheduleNeedsReview: true },
    alcohol: { status: event.alcoholDriving.status, findings: event.alcoholClaims.filter((c) => c.timeScope === "current") },
    crash: { scenarioTypes: scenarioTags(part) }, victim: { activities, vulnerableGroups }, context: { placeTypes },
  };
}

export async function understandArticle(article) {
  if (!article?.url || !article.title || !article.body || !/^20\d{2}-\d{2}-\d{2}$/.test(article.publishedAt)) throw new Error("Article requires url, title, publishedAt and full body.");
  const lexical = await tokenizeArticle(article);
  const sourceSentences = sentences(article, lexical);
  const title = sourceSentences[0];
  const split = partition(sourceSentences);
  const followUp = /判刑|判決|重判|判處|判撤銷|定讞|一審|二審|上訴|訊後聲押|裁定羈押/.test(article.title);
  const contextual = /自由觀點|自由廣場|社論|評論|修法|刑罰|政策|統計|宣導|防制|立委|藍委|議員|質詢|條款|民眾黨|國民黨|民進黨/.test(article.title);
  const issues = split.unresolved ? ["multiple_events_unresolved"] : [];
  const events = (contextual ? [] : split.parts).map((part, index) => {
    const personText = split.parts.length === 1 ? [title, ...part] : part;
    const model = actorsIn(personText);
    // Shared introductions can describe people, but their event totals are not
    // copied into either case. Only enrich an already identified, unique person.
    if (split.shared.length) {
      const context = actorsIn(split.shared);
      for (const a of model.actors.filter((a) => a.surname)) {
        const matches = context.actors.filter((b) => b.surname === a.surname && (!a.gender || !b.gender || a.gender === b.gender) &&
          (a.age === null || b.age === null || a.age === b.age));
        if (matches.length !== 1) continue;
        const b = matches[0];
        a.age ??= b.age; a.gender ??= b.gender;
        a.evidence = evUnique([...a.evidence, ...b.evidence]);
      }
    }
    const unattributed = attachPeople(personText, model);
    const claims = drugClaims(part, model, title, split.parts.length === 1);
    const drugDriving = drivingStatus(model.actors, claims);
    const alcohol = alcoholClaims(part, model, title, split.parts.length === 1);
    const alcoholDriving = alcoholStatus(model, alcohol);
    const counts = casualtyClaims(part, title, split.parts.length === 1);
    const event = {
      id: `event-${index + 1}`, actors: model.actors,
      occurredAt: occurrence(part, article.publishedAt), city: location(part, title),
      drugDriving, drugClaims: claims, alcoholDriving, alcoholClaims: alcohol, casualtyClaims: counts,
      locationDetail: roadLocation(part),
      casualties: { deaths: countCasualties("deaths", counts, model, unattributed), injuries: countCasualties("injuries", counts, model, unattributed) },
      traffic: trafficContext(part, title, split.parts.length === 1),
      issues: [...model.issues, ...unattributed.map((x) => `${x.kind}:${x.state}`)], candidate: null,
    };
    Object.assign(event, casualtyUpdate(part, event));
    event.impairmentTypes = [
      ...(["reported_positive_or_use", "suspected", "conflicting"].includes(drugDriving.status) ? ["drug"] : []),
      ...(["reported_positive_or_use", "suspected", "conflicting"].includes(alcoholDriving.status) ? ["alcohol"] : []),
    ];
    event.relations = [
      ...model.actors.flatMap((actor) => actor.vehicles.map((vehicle) => ({ actorId: actor.id, predicate: "drives", value: vehicle.type, evidence: vehicle.evidence }))),
      ...claims.flatMap((c) => c.actorIds.map((actorId) => ({ actorId, predicate: c.kind, status: c.status, evidence: c.evidence }))),
      ...alcohol.flatMap((c) => c.actorIds.map((actorId) => ({ actorId, predicate: c.kind, status: c.status, evidence: c.evidence }))),
      ...model.actors.flatMap((actor) => actor.outcomes.map((outcome) => ({ actorId: actor.id, predicate: "casualty_state", value: outcome.state, evidence: outcome.evidence }))),
    ];
    if (event.traffic.eventType === "driving" && ["reported_positive_or_use", "suspected", "conflicting"].includes(drugDriving.status)) {
      event.traffic.eventType = "drug_driving";
    }
    if (event.traffic.eventType === "driving" && event.impairmentTypes.includes("alcohol")) event.traffic.eventType = "alcohol_driving";
    if (!event.city.value && split.shared.length) {
      const sharedCity = location(split.shared, { id: "context", text: "", scope: "title" });
      if (sharedCity.value && !sharedCity.alternatives.length) event.city = { ...sharedCity, basis: "shared_article_context" };
    }
    if (!event.city.value) event.issues.push("unknown_city");
    if (!event.occurredAt.value) event.issues.push("unknown_event_date");
    if (event.traffic.status === "not_started_or_unclear") event.issues.push("driving_not_established");
    for (const kind of ["deaths", "injuries"]) if (event.casualties[kind].value === null) event.issues.push(`${kind}_${event.casualties[kind].basis}`);
    if (drugDriving.status === "conflicting") event.issues.push("conflicting_drug_evidence");
    if (alcoholDriving.status === "conflicting") event.issues.push("conflicting_alcohol_evidence");
    if (alcohol.some((c) => c.value !== null && (!c.unit || !c.specimen))) event.issues.push("alcohol_measurement_incomplete");
    if (claims.some((c) => c.kind === "unknown_test" && c.timeScope === "current" && c.status !== "negative")) event.issues.push("test_target_unresolved");
    if (followUp) event.issues.push("follow_up_requires_existing_event_link");
    if (contextual) event.issues.push("context_report_requires_event_review");
    if (!model.actors.some((a) => a.roles.includes("driver"))) event.issues.push("driver_identity_unresolved");
    const eligible = !followUp && !contextual && !split.unresolved && (event.traffic.concreteDanger || event.traffic.observedDriving) &&
      event.traffic.status !== "not_started_or_unclear" && event.impairmentTypes.length > 0;
    if (eligible) {
      const key = split.parts.length === 1 ? article.url : `${article.url}#event-${index + 1}`;
      event.candidate = {
        id: `ltn-${hash(key)}`, title: split.parts.length === 1 ? article.title : `${article.title}（事件 ${index + 1}）`,
        source: article.source || "LTN", url: article.url, publishedAt: article.publishedAt, occurredAt: event.occurredAt.value, eventType: event.traffic.eventType,
        impairmentTypes: event.impairmentTypes,
        city: event.city.value || "", deaths: event.casualties.deaths.value, injuries: event.casualties.injuries.value,
        summary: clean(part.map((s) => s.text).join(" ")).slice(0, 180), confidence: "needs_review", extractedDetails: profile(event, part),
        dataQuality: { includeInStats: false, needsHumanReview: true,
          flags: unique(["automated_candidate", ...(split.parts.length > 1 ? ["article_split_into_events"] : []), ...event.issues,
            ...(Object.values(event.casualties).some((c) => c.basis === "identified_people") ? ["counts_from_identified_people"] : [])]),
          sourceSearchUrl: article.searchUrl || null, understandingVersion: VERSION,
          sourceBodyHash: crypto.createHash("sha256").update(article.body).digest("hex"),
          countBasis: { deaths: event.casualties.deaths.basis, injuries: event.casualties.injuries.basis },
          knownMinimums: { deaths: event.casualties.deaths.minimum, injuries: event.casualties.injuries.minimum },
          evidence: { city: event.city.evidence, occurredAt: event.occurredAt.evidence, drugDriving: drugDriving.evidence, alcoholDriving: alcoholDriving.evidence,
            deaths: event.casualties.deaths.evidence, injuries: event.casualties.injuries.evidence },
        },
      };
    }
    return event;
  });
  const candidates = events.flatMap((e) => e.candidate ? [e.candidate] : []);
  const kind = followUp ? "judicial" : /統計|累計|件數|半年.{0,5}起|[年月]增|件[數起].{0,8}成長/.test(article.title) ? "statistics" : contextual ? "policy" : candidates.length ? "incident" : "other";
  const topic = /酒駕|毒駕|醉駕|酒後.{0,8}(?:開車|駕車|騎車)|酒測|唾液快篩|毒品.{0,8}(?:駕駛|上路)/;
  const foreign = /\/news\/world\//.test(article.url);
  const related = !foreign && (topic.test(article.title) || events.some((e) => e.impairmentTypes.length > 0) ||
    (contextual && topic.test(article.body)));
  if (foreign) issues.push("outside_taiwan_scope");
  const bothTopics = /(?:毒[、／/與和及]?酒|酒[、／/與和及]?毒)駕/.test(article.title);
  const impairmentTypes = unique([...events.flatMap((e) => e.impairmentTypes),
    ...(bothTopics || /酒駕|醉駕|酒測|酒後/.test(article.title) ? ["alcohol"] : []),
    ...(bothTopics || /毒駕|毒品/.test(article.title) ? ["drug"] : [])]);
  return { version: VERSION, lexical: { engine: lexical.engine, version: lexical.version, dictionaryHash: lexical.dictionaryHash, hmm: lexical.hmm },
    article: { url: article.url, title: article.title, publishedAt: article.publishedAt, source: article.source || "LTN", kind, related, impairmentTypes,
      bodyHash: crypto.createHash("sha256").update(article.body).digest("hex") },
    disposition: candidates.length ? "candidate" : followUp ? "update_review" : contextual ? "excluded" :
      issues.length || events.some((e) => e.issues.includes("driving_not_established")) ? "needs_review" : "excluded",
    sentences: sourceSentences, events, candidates, issues };
}
