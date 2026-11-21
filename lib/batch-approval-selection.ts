import type { ResearchCandidate } from "./research-candidates";

/** Only the explicitly selected, still-present research candidate can be approved. */
export const MAX_APPROVAL_BATCH_SIZE = 20;

type ApprovalResultView = Readonly<{ state: string }> | undefined;
type ApprovalStates = Readonly<Record<string, ApprovalResultView>>;
type CandidateGroups = ReadonlyMap<string, readonly ResearchCandidate[]>;

const COMPLETED_OR_LOCKED = new Set(["saving", "saved", "registered"]);

export function eligibleBatchApprovals(
  groups: CandidateGroups,
  choices: Readonly<Record<string, ResearchCandidate>>,
  results: ApprovalStates
): Array<[string, ResearchCandidate]> {
  return Object.entries(choices)
    .filter(([id, candidate]) => (
      groups.get(id)?.some(item => item === candidate) === true &&
      !COMPLETED_OR_LOCKED.has(results[id]?.state ?? "")
    ))
    .slice(0, MAX_APPROVAL_BATCH_SIZE);
}

/**
 * Candidates from distinct sources for the same Workshop remain separate until the
 * user chooses one manually; never silently choose the first source.
 */
export function unambiguousBatchCandidates(
  groups: CandidateGroups,
  results: ApprovalStates
): Array<[string, readonly ResearchCandidate[]]> {
  return [...groups]
    .filter(([id, candidates]) => (
      candidates.length === 1 &&
      !COMPLETED_OR_LOCKED.has(results[id]?.state ?? "")
    ))
    .slice(0, MAX_APPROVAL_BATCH_SIZE);
}
