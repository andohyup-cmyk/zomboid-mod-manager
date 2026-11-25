import { extractSteamTagsFromDetail } from "./steam-category-rules";
import { normalizeResearchRecord, type ResearchRecord } from "./workshop";

const PZ_APP_ID = 108600;

type ParseResult = {
  records: ResearchRecord[];
  errors: string[];
  tagsByWorkshopId: Record<string, string[]>;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Parse Steam's public GetPublishedFileDetails response while preserving the
 * request's ID order. Never infer a game Mod ID or gameplay compatibility.
 */
export function parseSteamWorkshopDetails(
  requestedIds: readonly string[],
  response: unknown,
  checkedAt: string
): ParseResult {
  const root = isObject(response) ? response : null;
  const wrapper = root && isObject(root.response) ? root.response : null;
  const details = wrapper?.publishedfiledetails;
  if (!Array.isArray(details)) return {
    records: [],
    errors: ["Steam 응답 형식을 확인할 수 없습니다."],
    tagsByWorkshopId: {}
  };

  const byId = new Map<string, Record<string, unknown>>();
  for (const entry of details) {
    if (!isObject(entry)) continue;
    const id = entry.publishedfileid;
    if (typeof id !== "string" || byId.has(id)) continue;
    byId.set(id, entry);
  }

  const records: ResearchRecord[] = [];
  const errors: string[] = [];
  const tagsByWorkshopId: Record<string, string[]> = {};
  for (const id of requestedIds) {
    const entry = byId.get(id);
    if (!entry || entry.result !== 1) {
      errors.push(`Workshop ID ${id}: 공개 정보를 조회하지 못했습니다.`);
      continue;
    }
    if (String(entry.consumer_app_id) !== String(PZ_APP_ID)) {
      errors.push(`Workshop ID ${id}: Project Zomboid 항목이 아닙니다.`);
      continue;
    }
    const normalized = normalizeResearchRecord({
      workshopId: id,
      title: entry.title,
      description: typeof entry.description === "string" ? entry.description.slice(0, 4000) : "",
      modIds: [],
      sourceUrl: `https://steamcommunity.com/sharedfiles/filedetails/?id=${id}`,
      sources: [`https://steamcommunity.com/sharedfiles/filedetails/?id=${id}`],
      checkedAt,
      verificationStatus: "unverified",
      buildCompatibility: "unverified",
      multiplayerCompatibility: "unverified"
    });
    if (normalized.record) {
      records.push(normalized.record);
      tagsByWorkshopId[id] = extractSteamTagsFromDetail(entry);
    } else {
      errors.push(`Workshop ID ${id}: ${normalized.error ?? "정보 검증 실패"}`);
    }
  }
  return { records, errors, tagsByWorkshopId };
}
