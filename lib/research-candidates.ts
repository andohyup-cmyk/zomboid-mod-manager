import { canonicalWorkshopId, type ResearchRecord } from "./workshop";

export type ResearchCandidate = {
  source: "inbox" | "manual";
  record: ResearchRecord;
};

export function groupResearchCandidates(inbox: ResearchRecord[], manual: ResearchRecord[]) {
  const groups = new Map<string, ResearchCandidate[]>();
  function add(source: ResearchCandidate["source"], record: ResearchRecord) {
    // Compare the Workshop identity, but keep each original payload for its own approval.
    const id = canonicalWorkshopId(record.workshopId) ?? record.workshopId;
    const candidates = groups.get(id) ?? [];
    candidates.push({ source, record });
    groups.set(id, candidates);
  }
  inbox.forEach(record => add("inbox", record));
  manual.forEach(record => add("manual", record));
  return groups;
}

/**
 * The GitHub research inbox is preloaded, not populated by typing a Workshop URL.
 * When the user supplies Workshop IDs, never present unrelated research as if it
 * belonged to those IDs. With no requested IDs, preserve the manual/inbox workflow.
 */
export function matchResearchCandidatesToInput(
  groups: Map<string, ResearchCandidate[]>,
  requestedWorkshopIds: string[]
): { groups: Map<string, ResearchCandidate[]>; missingIds: string[]; excludedIds: string[] } {
  if (requestedWorkshopIds.length === 0) {
    return { groups, missingIds: [], excludedIds: [] };
  }

  const requested = [...new Set(requestedWorkshopIds)];
  const requestedSet = new Set(requested);
  const matched = new Map<string, ResearchCandidate[]>();
  const excludedIds: string[] = [];

  for (const [id, candidates] of groups) {
    if (requestedSet.has(id)) matched.set(id, candidates);
    else excludedIds.push(id);
  }

  return {
    groups: matched,
    missingIds: requested.filter(id => !matched.has(id)),
    excludedIds
  };
}
