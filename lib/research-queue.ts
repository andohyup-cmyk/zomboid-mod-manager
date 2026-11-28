import { canonicalWorkshopId, normalizeResearchRecord, type ResearchRecord } from "./workshop";

export type QueueSource = "steam" | "manual" | "inbox";
export type QueueRecordInput = { source: QueueSource; record: ResearchRecord };
export type QueueInsert = { source: QueueSource; workshop_id: string; payload: ResearchRecord };

const SOURCES: readonly string[] = ["steam", "manual", "inbox"];

/**
 * Validate the *whole* request before writing any pending records.
 * A queue entry is not catalog approval, and a claimed compatibility status is
 * still part of unapproved, user-reviewable research data.
 */
export function prepareResearchQueueBatch(input: unknown):
  { items: QueueInsert[]; error?: never } | { items?: never; error: string } {
  if (!Array.isArray(input) || input.length < 1 || input.length > 20) {
    return { error: "대기함에는 한 번에 1~20개 항목을 제출할 수 있습니다." };
  }

  const items: QueueInsert[] = [];
  const seen = new Set<string>();
  for (const [index, candidate] of input.entries()) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      return { error: `${index + 1}번: 항목 형식이 올바르지 않습니다.` };
    }
    const raw = candidate as Record<string, unknown>;
    if (typeof raw.source !== "string" || !SOURCES.includes(raw.source)) {
      return { error: `${index + 1}번: 조사 출처가 올바르지 않습니다.` };
    }
    const normalized = normalizeResearchRecord(raw.record);
    if (!normalized.record) {
      return { error: `${index + 1}번: ${normalized.error ?? "조사 자료가 올바르지 않습니다."}` };
    }
    const id = canonicalWorkshopId(normalized.record.workshopId);
    if (id === null || id !== normalized.record.workshopId) {
      return { error: `${index + 1}번: Workshop ID는 선행 0 없는 표준 숫자여야 합니다.` };
    }
    const source = raw.source as QueueSource;
    const key = `${source}:${id}`;
    if (seen.has(key)) {
      return { error: `${index + 1}번: 같은 출처의 Workshop ID가 중복됐습니다.` };
    }
    seen.add(key);
    items.push({ workshop_id: id, source, payload: normalized.record });
  }
  return { items };
}
