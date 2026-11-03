import crypto from "node:crypto";

// Publication owns consistency checks, not interpretation. Source sentences are
// transient; state retains only cards, match keys, bounded excerpts and changes.
const CITIES = new Set(["新北市", "臺北市", "桃園市", "臺中市", "臺南市", "高雄市", "宜蘭縣", "新竹縣", "新竹市", "苗栗縣", "彰化縣", "南投縣", "雲林縣", "嘉義縣", "嘉義市", "屏東縣", "臺東縣", "花蓮縣", "澎湖縣", "基隆市", "金門縣", "連江縣"]);
const KINDS = new Set(["incident", "policy", "judicial", "statistics", "other"]);
const FIELDS = ["deaths", "injuries"];
const TYPES = ["alcohol", "drug"];
const HASH = /^[a-f0-9]{64}$/;
const unique = (values) => [...new Set(values)];
const copy = (value) => structuredClone(value);
const digest = (value) => crypto.createHash("sha256").update(value).digest("hex");
const types = (values = []) => TYPES.filter((type) => values.includes(type));
const count = (value) => Number.isSafeInteger(value) && value >= 0;
const city = (value) => CITIES.has(value?.replaceAll("台", "臺")) ? value.replaceAll("台", "臺") : "";
const requireValue = (condition, message) => { if (!condition) throw new Error(`Invalid news snapshot: ${message}`); };

function date(value) {
  return typeof value === "string" && /^20\d{2}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

function sourceUrl(value) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(".ltn.com.tw") || parsed.username || parsed.password) return null;
    parsed.search = ""; parsed.hash = "";
    return parsed.href;
  } catch { return null; }
}

function positioned(e) {
  return e && ["title", "body"].includes(e.field) && typeof e.quote === "string" && e.quote.length > 0 &&
    Number.isSafeInteger(e.start) && Number.isSafeInteger(e.end) && e.start >= 0 && e.end - e.start === e.quote.length;
}

function evidenceCheck(analysis) {
  return (items, body = false) => Array.isArray(items) && items.length > 0 && (!body || items.some((e) => e.field === "body")) &&
    items.every((e) => positioned(e) && (e.field === "title" ? analysis.article.title.slice(e.start, e.end) === e.quote :
      analysis.sentences.some((s) => s.field === "body" && s.id === e.sentenceId && Number.isInteger(s.start) &&
        Number.isInteger(s.end) && s.end - s.start === s.text?.length && e.start >= s.start && e.end <= s.end &&
        s.text.slice(e.start - s.start, e.end - s.start) === e.quote)));
}

function excerpts(items = []) {
  return [...new Map(items.filter(positioned).map((e) => [`${e.field}:${e.start}:${e.end}`, e])).values()].slice(0, 4).map((e) => ({
    sentenceId: e.sentenceId, field: e.field, start: e.start, end: e.start + Math.min(e.quote.length, 240), quote: e.quote.slice(0, 240),
  }));
}

function manual(item) {
  const q = item.dataQuality || {};
  return q.verificationStatus === "manual_checked" || q.reviewed === true || q.manualReviewed === true || item.reviewed === true ||
    (!q.verificationStatus && q.needsHumanReview === false && (/^reviewed_/.test(item.confidence || "") || q.sourceBasis === "article_text_reviewed"));
}

function migrate(item) {
  const row = copy(item), q = row.dataQuality || {};
  const reviewed = manual(row);
  const verificationStatus = reviewed ? "manual_checked" : q.verificationStatus || "legacy";
  row.impairmentTypes = types(row.impairmentTypes || [
    ...(/酒駕|醉駕|酒後/.test(row.title) ? ["alcohol"] : []),
    ...(/毒駕/.test(row.title) || row.extractedDetails?.drug ? ["drug"] : []),
  ]);
  row.dataQuality = { ...q, verificationStatus,
    fieldStatus: q.fieldStatus || Object.fromEntries(FIELDS.map((field) => [field, reviewed && count(row[field]) ? "checked" : "unknown"])),
    includeInStats: verificationStatus === "legacy" ? false : q.includeInStats ?? reviewed,
    mapEligible: verificationStatus === "legacy" ? false : q.mapEligible ?? (reviewed && q.includeInStats !== false && Boolean(city(row.city))),
    needsHumanReview: q.needsHumanReview ?? !reviewed,
  };
  return row;
}

function legacyCard(row) {
  return { id: `article-${digest(sourceUrl(row.url) || row.url).slice(0, 16)}`, title: row.title, url: row.url,
    source: row.source || "LTN", publishedAt: row.publishedAt, kind: "incident",
    status: manual(row) ? "verified" : "needs_clarification", impairmentTypes: row.impairmentTypes,
    eventIds: [row.id], city: city(row.city) || null, issues: manual(row) ? [] : ["legacy_source_not_rechecked"] };
}

function emptyMatch(row) {
  return { date: date(row.occurredAt) ? row.occurredAt : null, city: city(row.city) || null, road: null, actorKeys: [] };
}

function vehicle(type) {
  if (/汽車|轎車|休旅車|小客車|白牌車|賓士|BMW|計程車/.test(type)) return "car";
  if (/微型|電動自行車/.test(type)) return "electric_bicycle";
  if (/機車/.test(type)) return "motorcycle";
  if (/自行車|腳踏車/.test(type)) return "bicycle";
  if (/貨車/.test(type)) return /大貨車/.test(type) ? "large_truck" : /小貨車/.test(type) ? "small_truck" : "truck";
  return type;
}

function vehiclesAgree(a, b) {
  return a.some((x) => b.some((y) => x === y || (x === "truck" && y.endsWith("_truck")) || (y === "truck" && x.endsWith("_truck"))));
}

function eventMatch(event, valid) {
  const road = event.locationDetail;
  return { date: date(event.occurredAt?.value) && valid(event.occurredAt.evidence, true) ? event.occurredAt.value : null,
    city: valid(event.city?.evidence) && (!(event.city.alternatives || []).length || event.city.basis === "event_location") ? city(event.city.value) || null : null,
    road: typeof road?.value === "string" && /路|街|大道|國道|公路/.test(road.value) && valid(road.evidence, true) &&
      road.evidence.some((e) => e.quote.includes(road.value)) ? road.value.replaceAll("台", "臺").replace(/\s/g, "") : null,
    actorKeys: (event.actors || []).filter((a) => a.roles?.includes("driver") && valid(a.evidence, true)).map((a) => ({
      surname: a.surname || null, age: Number.isInteger(a.age) ? a.age : null, gender: a.gender || null,
      vehicleTypes: unique((a.vehicles || []).filter((v) => valid(v.evidence, true)).map((v) => vehicle(v.type))).sort(),
    })),
  };
}

function contradictory(a, b) {
  if (["date", "city", "road"].some((field) => a[field] && b[field] && a[field] !== b[field])) return true;
  for (const x of a.actorKeys) for (const y of b.actorKeys.filter((key) => key.surname && key.surname === x.surname)) {
    if ((x.age !== null && y.age !== null && x.age !== y.age) || (x.gender && y.gender && x.gender !== y.gender) ||
      (x.vehicleTypes.length && y.vehicleTypes.length && !vehiclesAgree(x.vehicleTypes, y.vehicleTypes))) return true;
  }
  return a.actorKeys.length === 1 && b.actorKeys.length === 1 && a.actorKeys[0].surname && b.actorKeys[0].surname &&
    a.actorKeys[0].surname !== b.actorKeys[0].surname;
}

function exactMatch(a, b) {
  return a.date && a.date === b.date && a.road && a.road === b.road && !contradictory(a, b) &&
    a.actorKeys.some((x) => x.surname && x.age !== null && b.actorKeys.some((y) => x.surname === y.surname && x.age === y.age &&
      x.vehicleTypes.length && y.vehicleTypes.length && vehiclesAgree(x.vehicleTypes, y.vehicleTypes)));
}

function possibleMatch(a, b) {
  if (a.date && b.date && a.date !== b.date) return false;
  if (a.city && b.city && a.city !== b.city) return false;
  const road = a.road && b.road && (a.road.includes(b.road) || b.road.includes(a.road));
  const person = a.actorKeys.some((x) => x.surname && b.actorKeys.some((y) => x.surname === y.surname &&
    (x.age === null || y.age === null || x.age === y.age)));
  return Boolean((a.date && a.date === b.date && (road || person)) || (road && person));
}

function strongClaim(claim, type, valid) {
  if (claim.timeScope !== "current" || !valid(claim.evidence, true)) return false;
  const text = claim.text || claim.evidence.map((e) => e.quote).join(" ");
  if (claim.text && !claim.evidence.some((e) => e.quote.includes(claim.text))) return false;
  if (/疑似|懷疑|疑涉|疑酒駕|疑毒駕|涉嫌|是否|尚待|待驗|結果未|不排除|無法排除|否認/.test(text)) return false;
  if (type === "drug") return (claim.kind === "person_test" && claim.status === "positive" && /陽性|毒品反應/.test(text) &&
    !/陰性|未驗出|未檢出|非陽性|不是陽性|未呈/.test(text)) ||
    (claim.kind === "consumption" && ["reported_use", "self_reported"].includes(claim.status) && /吸毒|吸食|施用|拉[Kk]/.test(text) &&
      !/未施用|未吸食|沒有吸|事故後|撞車後|肇事後/.test(text));
  if (claim.kind === "reported_alcohol_driving" && claim.status === "reported") return /酒駕|醉駕|酒後.{0,8}(?:開車|駕車|騎車)/.test(text) && !/排除|未飲酒|未喝酒/.test(text);
  if (claim.kind !== "alcohol_test" || claim.status !== "positive") return false;
  if (claim.value == null) return /陽性|超標/.test(text) && !/陰性|非陽性|未超標|未呈/.test(text);
  return typeof claim.value === "number" && claim.value > 0 && ["mg/L", "mg/dL", "%", "g/L"].includes(claim.unit) &&
    claim.evidence.some((e) => e.quote.includes(String(claim.value))) &&
    !(claim.specimen === "breath" && claim.unit !== "mg/L");
}

function checkedCounts(event, valid, candidate) {
  return Object.fromEntries(FIELDS.map((field) => {
    const fact = event.casualties?.[field] || {};
    let checked = count(fact.value) && valid(fact.evidence, true) &&
      ["explicit_total", "identified_people", "group_state_transition"].includes(fact.basis) &&
      (fact.minimum == null || fact.minimum <= fact.value);
    const claims = (event.casualtyClaims || []).filter((c) => c.kind === field && c.scope === "reported_total" && !c.approximate);
    if (fact.basis === "identified_people") {
      const people = (event.actors || []).filter((a) => {
        const outcomes = (a.outcomes || []).filter((o) => valid(o.evidence, true));
        return field === "deaths" ? outcomes.some((o) => o.state === "dead") :
          outcomes.some((o) => o.state === "injured") && !outcomes.some((o) => o.state === "dead");
      });
      checked &&= people.length === fact.value && fact.value > 0;
    } else checked &&= claims.length > 0 && claims.every((c) => c.value === fact.value && valid(c.evidence));
    if (candidate && candidate[field] !== fact.value) checked = false;
    return [field, { value: checked ? fact.value : null, status: fact.basis === "conflicting" ? "conflict" : checked ? "checked" : "unknown",
      basis: fact.basis || "not_reported", evidence: excerpts(valid(fact.evidence) ? fact.evidence : []) }];
  }));
}

function assess(analysis, event) {
  const valid = evidenceCheck(analysis), candidate = event.candidate;
  const match = eventMatch(event, valid);
  const issues = unique([...(analysis.issues || []), ...(event.issues || [])]);
  const actors = event.actors || [];
  const identity = actors.length > 0 && new Set(actors.map((a) => a.id)).size === actors.length &&
    !issues.some((issue) => /ambiguous_person|identity.*(?:unresolved|conflict)|multiple_events_unresolved/.test(issue)) &&
    !actors.some((a) => a.roles?.includes("driver") && a.roles.includes("passenger"));
  if (!identity) issues.push("driver_identity_not_checked");
  const strongTypes = [], linkedIds = [], impairmentEvidence = {};
  for (const type of TYPES) {
    const driving = event[`${type}Driving`], claims = event[`${type}Claims`] || [];
    const ids = driving?.actorIds || [];
    const linked = ids.length > 0 && ids.every((id) => actors.some((a) => a.id === id && a.roles?.includes("driver") && valid(a.evidence, true)));
    const positive = claims.filter((c) => strongClaim(c, type, valid) && c.actorIds?.some((id) => ids.includes(id)));
    const negative = claims.some((c) => c.timeScope === "current" && ["negative", "ruled_out"].includes(c.status) &&
      c.actorIds?.some((id) => ids.includes(id)) && valid(c.evidence));
    if (claims.some((c) => c.timeScope === "current" && c.status === "denied" && c.actorIds?.some((id) => ids.includes(id)) && valid(c.evidence))) {
      issues.push(`${type}_denial_reported`);
    }
    if (["reported_positive_or_use", "reported"].includes(driving?.status) && linked &&
      ids.every((id) => positive.some((c) => c.actorIds.includes(id))) && !negative && valid(driving.evidence, true)) {
      strongTypes.push(type); linkedIds.push(...ids); impairmentEvidence[`${type}Driving`] = excerpts(positive.flatMap((c) => c.evidence));
    }
  }
  if (!strongTypes.length) issues.push("impairment_driver_link_not_checked");
  const traffic = event.traffic || {};
  const concrete = (traffic.concreteDanger === true || traffic.observedDriving === true) &&
    ["concrete_danger", "driving_reported"].includes(traffic.status) && valid(traffic.evidence, true) &&
    !traffic.evidence.some((e) => /尚未(?:開車|行駛)|還沒(?:開車|上路)|車子還未行駛/.test(e.quote));
  if (!concrete) issues.push("concrete_driving_not_checked");
  const dated = Boolean(match.date && match.date <= analysis.article.publishedAt && event.occurredAt.precision === "day");
  if (!dated) issues.push("event_date_not_checked");
  const candidateConsistent = !candidate || (sourceUrl(candidate.url) === sourceUrl(analysis.article.url) &&
    candidate.dataQuality?.sourceBodyHash === analysis.article.bodyHash && candidate.dataQuality?.understandingVersion === analysis.version &&
    candidate.occurredAt === event.occurredAt.value && types(candidate.impairmentTypes).join() === types(event.impairmentTypes).join());
  if (!candidateConsistent) issues.push("candidate_source_or_event_mismatch");
  const fields = checkedCounts(event, valid, candidate);
  for (const field of FIELDS) if (fields[field].status !== "checked") issues.push(`${field}_${fields[field].status}`);
  const eligible = identity && strongTypes.length > 0 && concrete && dated && candidateConsistent;
  return { match, fields, eligible, strongTypes, driverIds: unique(linkedIds), valid, issues: unique(issues),
    evidence: { occurredAt: excerpts(valid(event.occurredAt?.evidence) ? event.occurredAt.evidence : []),
      city: excerpts(match.city ? event.city.evidence : []), traffic: excerpts(valid(traffic.evidence) ? traffic.evidence : []),
      driver: excerpts(actors.filter((a) => linkedIds.includes(a.id)).flatMap((a) => a.evidence)), ...impairmentEvidence,
      ...Object.fromEntries(FIELDS.map((field) => [field, fields[field].evidence])) } };
}

function publicationQuality(analysis, result) {
  return { verificationStatus: "machine_checked", eventCountValid: true, includeInStats: true, mapEligible: Boolean(result.match.city),
    needsHumanReview: result.issues.some((issue) => !["automated_candidate"].includes(issue)),
    fieldStatus: Object.fromEntries(FIELDS.map((field) => [field, result.fields[field].status])),
    countBasis: Object.fromEntries(FIELDS.map((field) => [field, result.fields[field].basis])),
    sourceBodyHash: analysis.article.bodyHash, understandingVersion: analysis.version, evidence: result.evidence,
    publicationChecks: { concreteDriving: true, driverLinked: true, dateChecked: true, identityConsistent: true,
      driverActorIds: result.driverIds, impairmentTypes: result.strongTypes }, flags: result.issues };
}

function newIncident(analysis, event, result, id) {
  const article = analysis.article, candidate = event.candidate;
  const extractedDetails = candidate.extractedDetails ? copy(candidate.extractedDetails) : null;
  // Public profiles keep structured facts; source excerpts belong in bounded
  // dataQuality.evidence. Only sanitize new rows, never historical profiles.
  for (const section of [extractedDetails?.drug, extractedDetails?.alcohol]) {
    for (const finding of section?.findings || []) {
      delete finding.text;
      delete finding.evidence;
    }
  }
  for (const classification of extractedDetails?.drug?.scheduleClassifications || []) delete classification.evidence;
  return { id, title: candidate.title, url: sourceUrl(article.url), source: article.source, publishedAt: article.publishedAt,
    occurredAt: result.match.date, city: result.match.city || "", eventType: event.traffic.eventType,
    impairmentTypes: result.strongTypes, deaths: result.fields.deaths.value, injuries: result.fields.injuries.value,
    summary: String(candidate.summary || "").slice(0, 180), confidence: "machine_checked",
    ...(extractedDetails ? { extractedDetails } : {}),
    dataQuality: publicationQuality(analysis, result) };
}

// Explicit cross-URL linkage is event-scoped. A bare related-links list or a
// sameEvent boolean without a source quotation cannot merge two incidents.
function references(event, valid) {
  return (event.sourceReferences || []).filter((ref) => ref.relation === "same_event" && valid(ref.evidence, true))
    .map((ref) => ({ url: sourceUrl(ref.url), eventId: ref.eventId || null })).filter((ref) => ref.url);
}

function chooseMatch(records, analysis, event, result) {
  const url = sourceUrl(analysis.article.url), refs = references(event, result.valid);
  const exact = [], possible = [];
  for (const record of records) {
    // Separate local cases in the same source version must keep separate IDs.
    if (record.sources.some((s) => s.url === url && s.bodyHash === analysis.article.bodyHash &&
      s.version === analysis.version && s.eventId && s.eventId !== event.id)) continue;
    const sameUrl = record.sources.some((s) => s.url === url && (s.eventId === event.id ||
      (s.eventId === null && analysis.events.length === 1)));
    const explicit = refs.some((ref) => record.sources.some((s) => s.url === ref.url && (!ref.eventId || s.eventId === ref.eventId || record.id === ref.eventId)));
    if (record.issues.includes("legacy_multiple_events_unresolved") && (sameUrl || explicit)) possible.push(record);
    else if ((sameUrl || explicit) && !contradictory(record.match, result.match)) exact.push(record);
    else if (exactMatch(record.match, result.match)) exact.push(record);
    else if (sameUrl || explicit || possibleMatch(record.match, result.match) || record.sources.some((s) => s.url === url)) possible.push(record);
  }
  if (exact.length === 1) return { record: exact[0], ambiguous: [] };
  return { record: null, ambiguous: unique([...exact, ...possible].map((r) => r.id)) };
}

function addUnique(list, value) {
  const key = JSON.stringify(value);
  if (!list.some((entry) => JSON.stringify(entry) === key)) list.push(value);
}

function updatePermitted(event, field, incoming, original, valid) {
  // currentFacts gives *absolute* totals, never increments. The interpreter must
  // identify correction/current scope or the same people who changed state.
  const fact = event.currentFacts?.[field];
  if (!fact || fact.value !== incoming || fact.previousValue !== original || !valid(fact.evidence, true)) return false;
  const quote = fact.evidence.map((e) => e.quote).join(" ");
  if (event.updateKind === "correction") return /更正|修正|誤報|誤植|應為|實為/.test(quote);
  if (event.updateKind !== "casualty_transition" || !Array.isArray(fact.actorIds) || !fact.actorIds.length ||
    !/傷者|受傷|送醫/.test(quote) || !/不治|死亡|身亡/.test(quote)) return false;
  // Check explicitly supplied totals; never derive an unreported survivor count.
  const changedPeople = new Set(fact.actorIds).size;
  if (incoming !== original + (field === "deaths" ? changedPeople : -changedPeople)) return false;
  return fact.actorIds.every((id) => event.actors.some((a) => a.id === id && valid(a.evidence, true) &&
    a.outcomes?.some((o) => o.state === "dead" && valid(o.evidence, true))));
}

function mergeIncident(row, record, analysis, event, result, checkedAt) {
  const source = { url: sourceUrl(analysis.article.url), eventId: event.id, bodyHash: analysis.article.bodyHash, version: analysis.version };
  const changes = [], issues = result.issues.filter((issue) => /conflicting_(?:drug|alcohol)_evidence/.test(issue));
  const locked = manual(row), q = row.dataQuality;
  const allowFacts = result.eligible || (q.verificationStatus !== "legacy" && !result.issues.includes("driver_identity_not_checked"));
  for (const field of FIELDS) {
    const fact = result.fields[field], previous = row[field];
    const previouslyChecked = q.fieldStatus[field] === "checked" ||
      (q.fieldStatus[field] === "conflict" && q.retainedCheckedFields?.includes(field));
    const markConflict = () => {
      if (locked) return;
      q.fieldStatus[field] = previouslyChecked ? "conflict" : "unknown";
      if (previouslyChecked) q.retainedCheckedFields = unique([...(q.retainedCheckedFields || []), field]);
    };
    if (!allowFacts || fact.status !== "checked") {
      const unverified = event.casualties?.[field]?.value;
      if (fact.status === "conflict" || (count(unverified) && unverified !== previous)) {
        const conflict = { field, retained: previous, incoming: count(unverified) ? unverified : null, ...source, evidence: fact.evidence };
        addUnique(record.conflicts, conflict); issues.push(`${field}_conflict`);
        markConflict();
      }
      continue;
    }
    if (previous === fact.value) {
      if (!locked && !previouslyChecked) {
        q.fieldStatus[field] = "checked";
        q.evidence = { ...q.evidence, [field]: fact.evidence };
      }
      continue;
    }
    const allowed = !locked && (!previouslyChecked || updatePermitted(event, field, fact.value, previous, result.valid));
    if (allowed) {
      row[field] = fact.value; q.fieldStatus[field] = "checked";
      q.countBasis = { ...q.countBasis, [field]: fact.basis };
      q.evidence = { ...q.evidence, [field]: fact.evidence };
      changes.push({ field, previous, value: fact.value, reason: !previouslyChecked && q.verificationStatus === "legacy" ? "rechecked_legacy_value" :
        previous === null ? "previously_unknown" : !previouslyChecked ? "rechecked_unverified_value" : event.updateKind, evidence: fact.evidence });
    } else {
      addUnique(record.conflicts, { field, retained: previous, incoming: fact.value, ...source, evidence: fact.evidence });
      issues.push(`${field}_conflict`);
      markConflict();
    }
  }
  if (result.eligible && !locked) {
    if (q.verificationStatus === "legacy") {
      // Legacy content and manual edits remain in place. Only rechecked fields
      // receive checked status; differing historical numbers remain conflicts.
      const quality = publicationQuality(analysis, result);
      const fieldStatus = Object.fromEntries(FIELDS.map((field) => [field, q.retainedCheckedFields?.includes(field) ? "conflict" :
        row[field] === result.fields[field].value && result.fields[field].status === "checked" ? "checked" : "unknown"]));
      row.dataQuality = { ...q, ...quality, fieldStatus };
      changes.push({ field: "verificationStatus", previous: "legacy", value: "machine_checked" });
    }
    if (!row.occurredAt) row.occurredAt = result.match.date;
    if (!row.city && result.match.city) {
      row.city = result.match.city;
      row.dataQuality.evidence.city = result.evidence.city;
    }
    row.impairmentTypes = q.verificationStatus === "legacy" ? result.strongTypes : types([...row.impairmentTypes, ...result.strongTypes]);
    row.dataQuality.publicationChecks.impairmentTypes = types([...row.dataQuality.publicationChecks.impairmentTypes, ...result.strongTypes]);
    for (const type of result.strongTypes) row.dataQuality.evidence[`${type}Driving`] ||= result.evidence[`${type}Driving`];
    row.dataQuality.mapEligible = row.dataQuality.includeInStats && Boolean(city(row.city)) && Boolean(row.dataQuality.evidence.city?.length);
  }
  record.match = { date: record.match.date || result.match.date, city: record.match.city || result.match.city,
    road: record.match.road || result.match.road, actorKeys: record.match.actorKeys.length ? record.match.actorKeys : result.match.actorKeys };
  record.issues = unique([...record.issues, ...issues]);
  if (issues.length && !locked) row.dataQuality.needsHumanReview = true;
  addUnique(record.sources, source);
  const versionKey = `${source.url}:${source.eventId}:${source.bodyHash}:${source.version}`;
  if (!record.history.some((h) => h.versionKey === versionKey)) record.history.push({ versionKey, checkedAt, ...source, changes, issues });
  return { issues, changes };
}

/** baseIncidents is the last public snapshot, including subsequent human edits.
 * previousState supplies article cards and match/history metadata, never rows.
 * checkedAt is an ISO timestamp; throughDate is the successful crawl watermark.
 */
export function buildNewsSnapshot({ baseIncidents, previousState = null, analyses, checkedAt, throughDate, rejectedUrls = [] }) {
  requireValue(Array.isArray(baseIncidents) && Array.isArray(analyses), "expected incidents and analyses arrays");
  requireValue(typeof checkedAt === "string" && Number.isFinite(Date.parse(checkedAt)), "checkedAt");
  requireValue(throughDate === null || date(throughDate), "throughDate");
  requireValue(Array.isArray(rejectedUrls), "rejectedUrls");
  requireValue(!previousState || previousState.version === 1, "state version");
  const incidents = baseIncidents.map(migrate), rows = new Map(incidents.map((row) => [row.id, row]));
  requireValue(rows.size === incidents.length, "duplicate base incident IDs");
  const records = copy(previousState?.events || []), cards = new Map();
  for (const article of previousState?.articles || []) cards.set(sourceUrl(article.url) || article.url, copy(article));
  for (const row of incidents) {
    if (!records.some((r) => r.id === row.id)) records.push({ id: row.id, match: emptyMatch(row),
      sources: [{ url: sourceUrl(row.url) || row.url, eventId: null, bodyHash: row.dataQuality.sourceBodyHash || null, version: row.dataQuality.understandingVersion || null }],
      history: [], conflicts: [], issues: row.dataQuality.verificationStatus === "legacy" &&
        row.dataQuality.flags?.some((flag) => /multiple_incidents_same_article|multiple_events_unresolved/.test(flag)) ? ["legacy_multiple_events_unresolved"] : [] });
    const record = records.find((r) => r.id === row.id);
    // These are explicit, historically curated same-case references, not the
    // unrelated recommendations that may appear on a fetched news page.
    for (const related of row.relatedReports || []) {
      const relatedUrl = sourceUrl(related.url);
      if (!relatedUrl) continue;
      if (!record.sources.some((source) => source.url === relatedUrl)) record.sources.push({ url: relatedUrl, eventId: null, bodyHash: null, version: null });
      if (!cards.has(relatedUrl) && related.title && date(related.publishedAt)) {
        cards.set(relatedUrl, { ...legacyCard({ ...row, ...related, id: row.id }), bodyHash: null, understandingVersion: null, eventLinks: [], origin: "legacy" });
      } else if (cards.has(relatedUrl)) cards.get(relatedUrl).eventIds = unique([...cards.get(relatedUrl).eventIds, row.id]);
    }
    const url = sourceUrl(row.url) || row.url;
    if (!cards.has(url)) cards.set(url, { ...legacyCard(row), bodyHash: null, understandingVersion: null, eventLinks: [], origin: "legacy" });
    else cards.get(url).eventIds = unique([...cards.get(url).eventIds, row.id]);
  }
  requireValue(records.every((record) => rows.has(record.id)), "state references an incident missing from baseIncidents");
  const rejected = new Set(rejectedUrls.map((entry) => sourceUrl(typeof entry === "string" ? entry : entry.url)).filter(Boolean));
  const report = { version: 1, checkedAt, addedEventCount: 0, linkedEventCount: 0, skippedArticleCount: 0,
    beforeStatsCount: baseIncidents.filter((row) => row.dataQuality?.includeInStats !== false).length,
    beforeVerifiedStatsCount: incidents.filter((row) => row.dataQuality.includeInStats).length,
    afterStatsCount: 0, excludedLegacyCount: 0, excludedLegacyPreviouslyIncludedCount: 0, conflicts: [], changes: [], issues: [] };
  // Recheck known sources before new URLs, so an existing case's match keys are
  // available even when its old row did not yet store its earlier news source.
  const knownUrls = new Set(records.flatMap((record) => record.sources.map((source) => source.url)));
  for (const analysis of [...analyses].sort((a, b) => Number(knownUrls.has(sourceUrl(b.article?.url))) - Number(knownUrls.has(sourceUrl(a.article?.url))) ||
    String(a.article?.publishedAt).localeCompare(String(b.article?.publishedAt)) ||
    String(a.article?.url).localeCompare(String(b.article?.url)))) {
    const article = analysis.article, url = sourceUrl(article?.url);
    if (url && rejected.has(url)) { report.skippedArticleCount++; continue; }
    if (article?.related !== true) { report.skippedArticleCount++; continue; }
    requireValue(url && article.source === "LTN" && article.title && date(article.publishedAt) && HASH.test(article.bodyHash) &&
      KINDS.has(article.kind) && typeof analysis.version === "string" && Array.isArray(analysis.events) && Array.isArray(analysis.sentences), "confirmed article metadata");
    requireValue(analysis.sentences.some((s) => s.field === "body" && typeof s.text === "string" && s.text.length &&
      Number.isInteger(s.start) && Number.isInteger(s.end) && s.start >= 0 && s.end - s.start === s.text.length), "confirmed article requires original body spans");
    const previous = cards.get(url);
    if (previous?.bodyHash === article.bodyHash && previous.understandingVersion === analysis.version &&
      previous.title === article.title && previous.publishedAt === article.publishedAt) continue;
    const eventIds = [...(previous?.eventIds || [])], eventLinks = [], articleIssues = [...(analysis.issues || [])];
    const cities = [];
    requireValue(new Set(analysis.events.map((event) => event.id)).size === analysis.events.length, "duplicate local event IDs");
    // Policy/statistical prose can mention hypothetical drivers and statutory
    // casualty thresholds. Those passages must not update an actual case.
    for (const event of ["policy", "statistics"].includes(article.kind) ? [] : analysis.events) {
      const result = assess(analysis, event);
      if (result.match.city) cities.push(result.match.city);
      const matching = chooseMatch(records, analysis, event, result);
      let record = matching.record;
      if (matching.ambiguous.length) {
        const issue = { url, eventId: event.id, code: "possible_duplicate_or_identity_conflict", relatedEventIds: matching.ambiguous };
        articleIssues.push(issue.code); report.issues.push(issue);
        for (const id of matching.ambiguous) addUnique(records.find((r) => r.id === id).issues, `${issue.code}:${url}`);
        eventLinks.push({ localEventId: event.id, eventId: null, possibleEventIds: matching.ambiguous, issues: [issue.code] });
        continue;
      }
      if (!record && event.candidate && result.eligible && article.kind === "incident" &&
        !(event.issues || []).some((issue) => /context_report|follow_up_requires/.test(issue))) {
        let id = event.candidate.id || `ltn-${digest(`${url}#${event.id}`).slice(0, 16)}`;
        if (rows.has(id)) id = `ltn-${digest(`${url}#${event.id}`).slice(0, 16)}`;
        requireValue(!rows.has(id), "event ID collision");
        const row = newIncident(analysis, event, result, id);
        incidents.push(row); rows.set(id, row);
        record = { id, match: result.match, sources: [], history: [], conflicts: [], issues: [] };
        records.push(record); report.addedEventCount++;
      }
      if (record) {
        const merged = mergeIncident(rows.get(record.id), record, analysis, event, result, checkedAt);
        const conflicts = merged.issues;
        report.changes.push(...merged.changes.map((change) => ({ incidentId: record.id, url, bodyHash: article.bodyHash, ...change })));
        eventIds.push(record.id); report.linkedEventCount++;
        articleIssues.push(...conflicts);
        const issues = result.issues.filter((issue) => issue !== "follow_up_requires_existing_event_link");
        if (article.kind === "incident" || conflicts.length) articleIssues.push(...issues);
        eventLinks.push({ localEventId: event.id, eventId: record.id, possibleEventIds: [], issues: unique([...issues, ...conflicts]) });
      } else {
        const issues = result.issues.length ? result.issues : ["event_not_publishable"];
        if (article.kind === "incident" || event.candidate || analysis.disposition === "update_review") articleIssues.push(...issues);
        eventLinks.push({ localEventId: event.id, eventId: null, possibleEventIds: [], issues });
      }
    }
    if ((article.kind === "incident" || analysis.disposition === "update_review") && !eventIds.length) articleIssues.push("no_verified_event_link");
    const distinctCities = unique(cities);
    cards.set(url, { id: previous?.id || `article-${digest(url).slice(0, 16)}`, title: article.title, url,
      source: article.source, publishedAt: article.publishedAt, kind: article.kind,
      status: articleIssues.length ? "needs_clarification" : "verified", impairmentTypes: types(article.impairmentTypes),
      eventIds: unique(eventIds), city: distinctCities.length === 1 ? distinctCities[0] : null, issues: unique(articleIssues),
      bodyHash: article.bodyHash, understandingVersion: analysis.version, eventLinks, origin: "confirmed_source" });
  }
  for (const [url, article] of cards) if (rejected.has(sourceUrl(url))) cards.delete(url);
  const articles = [...cards.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id));
  const news = { version: 1, articles: articles.map(({ bodyHash, understandingVersion, eventLinks, origin, ...card }) => card) };
  report.excludedLegacyCount = incidents.filter((row) => row.dataQuality.verificationStatus === "legacy" && !row.dataQuality.includeInStats).length;
  report.afterStatsCount = incidents.filter((row) => row.dataQuality.includeInStats).length;
  report.excludedLegacyPreviouslyIncludedCount = baseIncidents.filter((row) => row.dataQuality?.includeInStats !== false &&
    rows.get(row.id).dataQuality.verificationStatus === "legacy").length;
  report.conflicts = records.flatMap((record) => record.conflicts.map((conflict) => ({ incidentId: record.id, ...copy(conflict) })));
  const pendingCount = news.articles.filter((article) => article.status === "needs_clarification").length;
  const dataHash = digest(JSON.stringify({ incidents, news }));
  const lastChangedAt = previousState?.dataHash === dataHash ? previousState.lastChangedAt : checkedAt;
  const state = { version: 1, throughDate, rejectedUrls: copy(rejectedUrls), lastCheckedAt: checkedAt, lastChangedAt,
    dataHash, articles, events: records, ...(previousState?.api ? { api: copy(previousState.api) } : {}) };
  const status = { version: 1, lastCheckedAt: checkedAt, lastChangedAt, lastPublishedAt: null, sourceCoverage: ["LTN"], status: "success", pendingCount };
  const snapshot = { incidents, news, state, status, report };
  validateNewsSnapshot(snapshot);
  return snapshot;
}

export function validateNewsSnapshot({ incidents, news, state, status }) {
  requireValue(Array.isArray(incidents) && news?.version === 1 && Array.isArray(news.articles) && state?.version === 1 &&
    Array.isArray(state.articles) && Array.isArray(state.events) && status?.version === 1, "collections and versions");
  const ids = new Set();
  for (const row of incidents) {
    requireValue(typeof row.id === "string" && row.id && !ids.has(row.id), "duplicate or empty incident ID"); ids.add(row.id);
    requireValue(typeof row.title === "string" && row.title && typeof row.url === "string" && row.url && date(row.publishedAt) && typeof row.city === "string", `incident metadata ${row.id}`);
    const q = row.dataQuality;
    requireValue(q && ["machine_checked", "manual_checked", "legacy"].includes(q.verificationStatus) &&
      typeof q.includeInStats === "boolean" && typeof q.mapEligible === "boolean" && typeof q.needsHumanReview === "boolean", `quality flags ${row.id}`);
    requireValue(Array.isArray(row.impairmentTypes) && JSON.stringify(row.impairmentTypes) === JSON.stringify(types(row.impairmentTypes)), `impairment types ${row.id}`);
    for (const field of FIELDS) {
      requireValue(row[field] === null || count(row[field]), `${field} must be null or a nonnegative integer: ${row.id}`);
      requireValue(["checked", "unknown", "conflict"].includes(q.fieldStatus?.[field]), `fieldStatus ${row.id}.${field}`);
      requireValue(q.fieldStatus[field] !== "checked" || count(row[field]), `checked unknown count ${row.id}.${field}`);
      if (q.verificationStatus === "machine_checked" && q.fieldStatus[field] === "checked") {
        requireValue(q.evidence?.[field]?.length > 0 && q.evidence[field].every(positioned), `count evidence ${row.id}.${field}`);
      }
      if (q.verificationStatus === "machine_checked" && q.fieldStatus[field] === "conflict" && row[field] !== null) {
        requireValue(q.retainedCheckedFields?.includes(field) && q.evidence?.[field]?.length > 0 &&
          state.events.find((event) => event.id === row.id)?.conflicts.some((conflict) => conflict.field === field && conflict.retained === row[field]),
        `conflict retained an unchecked value ${row.id}.${field}`);
      }
    }
    requireValue(q.verificationStatus !== "legacy" || (!q.includeInStats && !q.mapEligible), `legacy eligibility ${row.id}`);
    requireValue(!q.mapEligible || (q.includeInStats && Boolean(city(row.city))), `map eligibility ${row.id}`);
    if (q.verificationStatus === "machine_checked") {
      const check = q.publicationChecks;
      requireValue(HASH.test(q.sourceBodyHash) && typeof q.understandingVersion === "string" && date(row.occurredAt) && row.occurredAt <= row.publishedAt,
        `machine provenance and date ${row.id}`);
      requireValue(check?.concreteDriving === true && check.driverLinked === true && check.dateChecked === true && check.identityConsistent === true &&
        check.driverActorIds?.length > 0 && check.impairmentTypes?.length > 0 && q.eventCountValid === true, `publication checks ${row.id}`);
      for (const field of ["occurredAt", "traffic", "driver", ...check.impairmentTypes.map((type) => `${type}Driving`), ...(q.mapEligible ? ["city"] : [])]) {
        requireValue(q.evidence?.[field]?.length > 0 && q.evidence[field].every(positioned), `event evidence ${row.id}.${field}`);
      }
      requireValue(row.impairmentTypes.length > 0 && JSON.stringify(types(check.impairmentTypes)) === JSON.stringify(row.impairmentTypes), `unverified type ${row.id}`);
      requireValue(!["lat", "lng", "latitude", "longitude", "coords", "coordinates"].some((key) => row[key] != null), `unverified exact coordinates ${row.id}`);
    }
  }
  const articleIds = new Set(), urls = new Set();
  for (const article of news.articles) {
    requireValue(article.id && !articleIds.has(article.id) && !urls.has(sourceUrl(article.url) || article.url), "duplicate article");
    articleIds.add(article.id); urls.add(sourceUrl(article.url) || article.url);
    requireValue(typeof article.title === "string" && article.title && typeof article.source === "string" && article.source &&
      date(article.publishedAt) && KINDS.has(article.kind) && ["verified", "needs_clarification"].includes(article.status), "article metadata");
    requireValue(Array.isArray(article.eventIds) && new Set(article.eventIds).size === article.eventIds.length && article.eventIds.every((id) => ids.has(id)), "dangling article event reference");
    requireValue(Array.isArray(article.issues) && article.issues.every((issue) => typeof issue === "string") &&
      (article.city === null || Boolean(city(article.city))) && JSON.stringify(article.impairmentTypes) === JSON.stringify(types(article.impairmentTypes)), "article fields");
    const stored = state.articles.find((entry) => entry.id === article.id);
    requireValue(stored && stored.url === article.url, "missing state article");
    const { bodyHash, understandingVersion, eventLinks, origin, ...card } = stored;
    requireValue(JSON.stringify(card) === JSON.stringify(article), "state/news card mismatch");
    requireValue(origin === "legacy" || (origin === "confirmed_source" && sourceUrl(article.url) && HASH.test(bodyHash) && typeof understandingVersion === "string"), "unconfirmed source");
    requireValue(Array.isArray(eventLinks) && eventLinks.every((link) => (link.eventId === null || article.eventIds.includes(link.eventId)) &&
      Array.isArray(link.possibleEventIds) && link.possibleEventIds.every((id) => ids.has(id))), "invalid event links");
  }
  requireValue(state.articles.length === news.articles.length, "state/news length mismatch");
  requireValue(state.events.length === incidents.length && new Set(state.events.map((event) => event.id)).size === incidents.length, "state event IDs");
  for (const record of state.events) {
    requireValue(ids.has(record.id) && record.match && Array.isArray(record.match.actorKeys) && Array.isArray(record.sources) &&
      Array.isArray(record.history) && Array.isArray(record.conflicts) && Array.isArray(record.issues), "invalid event state");
    requireValue(record.sources.every((source) => typeof source.url === "string" && (source.bodyHash === null || HASH.test(source.bodyHash))), "invalid source history");
    for (const conflict of record.conflicts) requireValue(FIELDS.includes(conflict.field) && (conflict.incoming === null || count(conflict.incoming)) &&
      (conflict.retained === null || count(conflict.retained)) && HASH.test(conflict.bodyHash), "invalid conflict");
  }
  const inspect = (value) => {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      requireValue(!["body", "fullText", "sentences", "tokens", "html"].includes(key), "full source text in state");
      if (key === "quote") requireValue(typeof child === "string" && child.length <= 240, "unbounded state evidence");
      if (key === "evidence") requireValue(Array.isArray(child) ? child.length <= 4 && child.every(positioned) : positioned(child), "invalid bounded state evidence");
      inspect(child);
    }
  };
  inspect(state);
  requireValue((state.throughDate === null || date(state.throughDate)) && Array.isArray(state.rejectedUrls) && HASH.test(state.dataHash) &&
    state.dataHash === digest(JSON.stringify({ incidents, news })), "state watermark or content hash");
  requireValue(status.status === "success" && JSON.stringify(status.sourceCoverage) === '["LTN"]' && status.lastPublishedAt === null &&
    status.lastCheckedAt === state.lastCheckedAt && status.lastChangedAt === state.lastChangedAt &&
    Number.isFinite(Date.parse(status.lastCheckedAt)) && Number.isFinite(Date.parse(status.lastChangedAt)), "status timestamps");
  requireValue(status.pendingCount === news.articles.filter((article) => article.status === "needs_clarification").length, "pending count");
}
