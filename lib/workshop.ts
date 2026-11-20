export type VerificationStatus = "unverified" | "confirmed" | "reported_issue";
export type ResearchRecord = {
  workshopId: string;
  title: string;
  description: string;
  modIds: string[];
  sourceUrl: string;
  sources: string[];
  checkedAt: string | null;
  verificationStatus: VerificationStatus;
  buildCompatibility: VerificationStatus;
  multiplayerCompatibility: VerificationStatus;
  singleplayerCompatibility: VerificationStatus;
  midServerAdditionCompatibility: VerificationStatus;
};

const WORKSHOP_ID = /^\d{5,20}$/;
const MAX_WORKSHOP_ID = "18446744073709551615";
const STATUS: VerificationStatus[] = ["unverified", "confirmed", "reported_issue"];

export function canonicalWorkshopId(workshopId: unknown): string | null {
  if (typeof workshopId !== "string" || !WORKSHOP_ID.test(workshopId)) return null;
  const id = workshopId.replace(/^0+/, "");
  if (id.length < 5 || (id.length === MAX_WORKSHOP_ID.length && id > MAX_WORKSHOP_ID)) return null;
  return id;
}

function parseWorkshopUrl(input: string): URL | null {
  try {
    const url = new URL(input.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!["steamcommunity.com", "www.steamcommunity.com"].includes(url.hostname.toLowerCase())) return null;
    if (!/^\/(?:sharedfiles|workshop)\/filedetails\/?$/.test(url.pathname)) return null;
    return url;
  } catch {
    return null;
  }
}

export function workshopIdFromUrl(input: string): string | null {
  const id = parseWorkshopUrl(input)?.searchParams.get("id");
  return id && WORKSHOP_ID.test(id) ? id : null;
}

function workshopIdFromInputUrl(input: string): string | null {
  if (!/^https?:\/\/[^/]/i.test(input) || input.includes("\\")) return null;
  const url = parseWorkshopUrl(input);
  if (!url || url.username || url.password || url.port) return null;
  const ids = url.searchParams.getAll("id");
  return ids.length === 1 ? ids[0] : null;
}

export function parseWorkshopInput(input: string): { workshopIds: string[]; invalidPositions: number[] } {
  const workshopIds = new Set<string>();
  const invalidPositions: number[] = [];
  const entries = input.split(/[\s,]+/).filter(Boolean);

  entries.forEach((entry, index) => {
    const id = canonicalWorkshopId(workshopIdFromInputUrl(entry) ?? entry);
    if (id === null) invalidPositions.push(index + 1);
    else workshopIds.add(id);
  });

  return { workshopIds: [...workshopIds], invalidPositions };
}

function validSource(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2000) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch { return false; }
}

function statusOf(value: unknown): VerificationStatus {
  return typeof value === "string" && STATUS.includes(value as VerificationStatus)
    ? value as VerificationStatus : "unverified";
}

export function normalizeResearchRecord(input: unknown):
  { record: ResearchRecord; error?: never } | { record?: never; error: string } {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { error: "조사 결과는 JSON 객체여야 합니다." };
  }
  const raw = input as Record<string, unknown>;
  const workshopId = String(raw.workshopId ?? "");
  if (!WORKSHOP_ID.test(workshopId)) return { error: "Workshop ID는 5~20자리 숫자여야 합니다." };
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  if (!title || title.length > 200) return { error: "모드 이름을 입력해야 합니다(최대 200자)." };

  if (raw.sourceUrl !== undefined && workshopIdFromUrl(String(raw.sourceUrl)) !== workshopId) {
    return { error: "출처 Workshop 링크와 Workshop ID가 일치하지 않습니다." };
  }
  const modIds = raw.modIds === undefined ? [] : raw.modIds;
  if (!Array.isArray(modIds) || modIds.length > 30 ||
      !modIds.every((id) => typeof id === "string" && id.trim() && id.length <= 200)) {
    return { error: "Mod ID는 문자열 배열이어야 합니다(최대 30개)." };
  }
  const uniqueModIds = [...new Set((modIds as string[]).map((x) => x.trim()))];
  const sources = raw.sources === undefined ? [] : raw.sources;
  if (!Array.isArray(sources) || sources.length > 30 || !sources.every(validSource)) {
    return { error: "출처는 유효한 웹 주소 배열이어야 합니다(최대 30개)." };
  }
  const description = typeof raw.description === "string" ? raw.description.trim() : "";
  if (description.length > 4000) return { error: "설명이 너무 깁니다(최대 4000자)." };
  const date = raw.checkedAt === null || raw.checkedAt === undefined ? null : raw.checkedAt;
  if (date !== null && (
    typeof date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    Number.isNaN(Date.parse(date + "T00:00:00Z")) ||
    new Date(date + "T00:00:00Z").toISOString().slice(0, 10) !== date
  )) {
    return { error: "확인 날짜는 YYYY-MM-DD 형식이어야 합니다." };
  }
  return {
    record: {
      workshopId,
      title,
      description,
      modIds: uniqueModIds,
      sourceUrl: "https://steamcommunity.com/sharedfiles/filedetails/?id=" + workshopId,
      sources: [...new Set(sources as string[])],
      checkedAt: date as string | null,
      verificationStatus: statusOf(raw.verificationStatus),
      buildCompatibility: statusOf(raw.buildCompatibility),
      multiplayerCompatibility: statusOf(raw.multiplayerCompatibility),
      singleplayerCompatibility: statusOf(raw.singleplayerCompatibility),
      midServerAdditionCompatibility: statusOf(raw.midServerAdditionCompatibility)
    }
  };
}

export function parseResearchPayload(input: string):
  { records: ResearchRecord[]; errors: string[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    return { records: [], errors: ["JSON 형식을 확인해 주세요."] };
  }
  const items = Array.isArray(parsed) ? parsed : [parsed];
  if (items.length === 0 || items.length > 50) {
    return { records: [], errors: ["한 번에 1~50개 항목을 입력해 주세요."] };
  }

  const records: ResearchRecord[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  items.forEach((item, index) => {
    const result = normalizeResearchRecord(item);
    if (result.record === undefined) {
      errors.push((index + 1) + "번 항목: " + (result.error ?? "조사 결과가 올바르지 않습니다."));
    } else if (seen.has(result.record.workshopId)) {
      errors.push((index + 1) + "번 항목: 중복 Workshop ID");
    } else {
      seen.add(result.record.workshopId);
      records.push(result.record);
    }
  });
  return { records, errors };
}
