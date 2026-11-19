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
