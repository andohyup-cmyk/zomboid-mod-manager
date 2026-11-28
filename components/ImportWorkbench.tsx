"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { groupResearchCandidates, matchResearchCandidatesToInput, type ResearchCandidate } from "@/lib/research-candidates";
import { eligibleBatchApprovals, unambiguousBatchCandidates } from "@/lib/batch-approval-selection";
import { parseWorkshopInput, type ResearchRecord } from "@/lib/workshop";
import type { SuggestedCategories } from "@/lib/steam-category-rules";
import { formatSteamDate, summarizeModDescription } from "@/lib/steam-description";

const sourceLabels = {
  inbox: "조사함",
  manual: "수동 JSON",
  steam: "Steam 공개 정보",
  queue: "영구 대기함"
} as const;

type Result = {
  state: "saving" | "saved" | "registered" | "error";
  candidate: ResearchCandidate;
  message?: string;
};
export type QueueItem = { id: string; source: "steam" | "manual" | "inbox"; record: ResearchRecord };

function CompactRecordCardBody({
  item,
  suggested,
  shortDescription,
  steamUpdatedAt
}: {
  item: ResearchRecord;
  suggested?: SuggestedCategories;
  shortDescription?: string;
  steamUpdatedAt?: string | null;
}) {
  const shortText = shortDescription || summarizeModDescription(item.description);
  const detailedText = item.description.trim();
  const showDetailToggle = detailedText.length > 0 && detailedText !== shortText;
  const updatedDate = formatSteamDate(steamUpdatedAt);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className="muted font-mono">Workshop {item.workshopId}</span>
        <span className="muted">최근 업데이트: {updatedDate ?? "미확인"}</span>
      </div>

      {suggested && suggested.categoryNames.length > 0 ? (
        <div className="flex flex-wrap gap-1 text-[11px]">
          {suggested.categoryNames.map((name) => {
            const isPrimary = name === suggested.primaryCategoryName;
            return (
              <span
                key={name}
                className={
                  isPrimary
                    ? "rounded-md bg-[#234332] px-2 py-0.5 font-semibold text-[#b9efb0]"
                    : "rounded-md bg-[#1f3a4d] px-2 py-0.5 text-[#bfe3ff]"
                }
              >
                {isPrimary ? `★ ${name}` : name}
              </span>
            );
          })}
        </div>
      ) : (
        <p className="muted text-[11px]">카테고리: 미분류 (Steam 태그 없음)</p>
      )}

      <p className="text-sm leading-5 text-[#dce7ef]">
        {shortText || "설명이 없습니다."}
      </p>

      {showDetailToggle && (
        <details
          className="rounded-lg border border-[#304154] bg-[#0e1722] p-2.5 text-xs"
          onClick={(event) => event.stopPropagation()}
        >
          <summary className="cursor-pointer font-semibold text-[#b9efb0]">자세한 설명 보기</summary>
          <p className="muted mt-2 max-h-60 overflow-y-auto whitespace-pre-wrap leading-5">{detailedText}</p>
        </details>
      )}
    </div>
  );
}

function ApprovalDialog({
  candidate,
  suggested,
  shortDescription,
  steamUpdatedAt,
  onCancel,
  onApprove
}: {
  candidate: ResearchCandidate;
  suggested?: SuggestedCategories;
  shortDescription?: string;
  steamUpdatedAt?: string | null;
  onCancel: () => void;
  onApprove: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return (
    <dialog ref={dialog} aria-labelledby="approval-title" onCancel={onCancel}
      onClick={event => { if (event.target === event.currentTarget) onCancel(); }}
      className="panel m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-lg p-0 text-[#ecf2f8] backdrop:bg-[#060b12cc]">
      <div className="space-y-3 p-5">
        <h2 id="approval-title" className="text-lg font-bold">등록 내용 확인</h2>
        <p className="font-semibold">{candidate.record.title}</p>
        <CompactRecordCardBody
          item={candidate.record}
          suggested={suggested}
          shortDescription={shortDescription}
          steamUpdatedAt={steamUpdatedAt}
        />
        <div className="flex flex-wrap gap-3 pt-1">
          <button type="button" className="secondary-action" onClick={onCancel}>취소</button>
          <button type="button" className="action" onClick={onApprove}>최종 승인</button>
        </div>
      </div>
    </dialog>
  );
}

function BatchApprovalDialog({ candidates, onCancel, onApprove }: {
  candidates: ResearchCandidate[];
  onCancel: () => void;
  onApprove: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return (
    <dialog ref={dialog} aria-labelledby="batch-approval-title" onCancel={onCancel}
      onClick={event => { if (event.target === event.currentTarget) onCancel(); }}
      className="panel m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-lg p-0 text-[#ecf2f8] backdrop:bg-[#060b12cc]">
      <div className="space-y-3 p-5">
        <h2 id="batch-approval-title" className="text-lg font-bold">선택 모드 등록 확인</h2>
        <p className="text-sm">다음 {candidates.length}개 모드를 카탈로그에 등록합니다.</p>
        <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
          {candidates.map(item => (
            <li key={item.record.workshopId}>{item.record.title} · {item.record.workshopId}</li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-3">
          <button type="button" className="secondary-action" onClick={onCancel}>취소</button>
          <button type="button" className="action" onClick={onApprove}>선택 항목 최종 승인</button>
        </div>
      </div>
    </dialog>
  );
}

function DismissDialog({ count, label, onCancel, onConfirm }: {
  count: number;
  label: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return (
    <dialog ref={dialog} aria-labelledby="queue-dismiss-title" onCancel={onCancel}
      onClick={event => { if (event.target === event.currentTarget) onCancel(); }}
      className="panel m-auto w-[calc(100%_-_2rem)] max-w-lg p-5 text-[#ecf2f8] backdrop:bg-[#060b12cc]">
      <h2 id="queue-dismiss-title" className="text-lg font-bold">선택 항목 삭제</h2>
      <p className="mt-3 text-sm">
        {count === 1
          ? `${label} 항목을 대기 목록에서 삭제(숨기기)할까요?`
          : `선택한 ${count}개 항목을 대기 목록에서 삭제(숨기기)할까요?`}
      </p>
      <div className="mt-4 flex gap-3">
        <button type="button" className="secondary-action" onClick={onCancel}>취소</button>
        <button type="button" className="action bg-red-400 text-[#19090b]" onClick={onConfirm}>삭제 확인</button>
      </div>
    </dialog>
  );
}

export function ImportWorkbench({
  readOnly,
  queueWritable = !readOnly,
  initialQueueRecords,
  initialQueueLoaded = false,
  onCatalogSaved
}: {
  readOnly: boolean;
  queueWritable?: boolean;
  initialQueueRecords?: QueueItem[];
  initialQueueLoaded?: boolean;
  onCatalogSaved?: () => void;
}) {
  const [workshopInput, setWorkshopInput] = useState("");
  const [steamRecords, setSteamRecords] = useState<ResearchRecord[]>([]);
  const [suggestedCategories, setSuggestedCategories] = useState<Record<string, SuggestedCategories>>({});
  const [shortDescByWorkshop, setShortDescByWorkshop] = useState<Record<string, string>>({});
  const [updatedAtByWorkshop, setUpdatedAtByWorkshop] = useState<Record<string, string | null>>({});
  const [steamErrors, setSteamErrors] = useState<string[]>([]);
  const [loadingSteam, setLoadingSteam] = useState(false);
  const [queueRecords, setQueueRecords] = useState<QueueItem[]>(() => initialQueueRecords ?? []);
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [queueError, setQueueError] = useState("");
  const [batchChoices, setBatchChoices] = useState<Record<string, ResearchCandidate>>({});
  const [batchOpen, setBatchOpen] = useState(false);
  const [approvingBatch, setApprovingBatch] = useState(false);
  const [deletingSelected, setDeletingSelected] = useState(false);
  const [batchSummary, setBatchSummary] = useState<{ saved: number; registered: number; errors: number } | null>(null);
  const [queueDismiss, setQueueDismiss] = useState<{ ids: string[]; workshopIds: string[]; label: string } | null>(null);
  const [results, setResults] = useState<Record<string, Result>>({});
  const [selection, setSelection] = useState<{ id: string; candidate: ResearchCandidate } | null>(null);
  const lockedIds = useRef(new Set<string>());
  const { workshopIds, invalidPositions } = useMemo(() => parseWorkshopInput(workshopInput), [workshopInput]);
  const groups = useMemo(
    () => groupResearchCandidates([], [], steamRecords, queueRecords.map(item => item.record)),
    [steamRecords, queueRecords]
  );
  const matched = useMemo(() => matchResearchCandidatesToInput(groups, workshopIds), [groups, workshopIds]);
  const hasResearchData = steamRecords.length > 0 || steamErrors.length > 0 || queueRecords.length > 0;

  const loadQueue = useCallback(async () => {
    setLoadingQueue(true);
    setQueueError("");
    try {
      const all: QueueItem[] = [];
      const errors: string[] = [];
      let offset: number | null = 0;
      for (let page = 0; offset !== null && page < 101; page++) {
        const response = await fetch(`/api/research-queue?offset=${offset}`, { cache: "no-store" });
        const body = await response.json() as {
          records?: QueueItem[]; error?: string; errors?: string[]; nextOffset?: number | null;
        };
        if (!response.ok || !Array.isArray(body.records)) {
          throw new Error(body.error || "영구 대기함을 불러오지 못했습니다.");
        }
        all.push(...body.records);
        errors.push(...(body.errors ?? []));
        offset = body.nextOffset ?? null;
      }
      if (offset !== null) throw new Error("대기함이 10,000개를 넘습니다. 범위를 좁혀 조회해야 합니다.");
      setQueueRecords(all);
      if (errors.length) setQueueError(errors.join(" / "));
    } catch (error) {
      setQueueError(error instanceof Error ? error.message : "영구 대기함을 불러오지 못했습니다.");
    } finally {
      setLoadingQueue(false);
    }
  }, []);

  useEffect(() => {
    if (!queueWritable || initialQueueLoaded) return;
    let active = true;
    void Promise.resolve().then(() => { if (active) void loadQueue(); });
    return () => { active = false; };
  }, [queueWritable, initialQueueLoaded, loadQueue]);

  async function saveQueue(items: { source: "steam" | "manual" | "inbox"; record: ResearchRecord }[]) {
    if (!queueWritable) return;
    for (let index = 0; index < items.length; index += 20) {
      const response = await fetch("/api/research-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: items.slice(index, index + 20) })
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "대기함에 저장하지 못했습니다.");
    }
    await loadQueue();
  }

  async function loadSteamMetadata() {
    if (loadingSteam || !workshopIds.length || workshopIds.length > 20 || invalidPositions.length) return;
    setLoadingSteam(true);
    setSteamErrors([]);
    setSteamRecords([]);
    setSelection(null);
    try {
      const allRecords: ResearchRecord[] = [];
      const allErrors: string[] = [];
      const allSuggested: Record<string, SuggestedCategories> = {};
      const allShort: Record<string, string> = {};
      const allUpdated: Record<string, string | null> = {};
      for (let index = 0; index < workshopIds.length; index += 5) {
        const response = await fetch("/api/workshop-metadata", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workshopIds: workshopIds.slice(index, index + 5) })
        });
        const body = await response.json() as {
          records?: ResearchRecord[];
          suggestedCategoriesByWorkshopId?: Record<string, SuggestedCategories>;
          shortDescriptionByWorkshopId?: Record<string, string>;
          steamUpdatedAtByWorkshopId?: Record<string, string | null>;
          errors?: string[];
          error?: string;
        };
        if (!response.ok) {
          allErrors.push(body.error || "Steam 정보를 가져오지 못했습니다.");
          break;
        }
        allRecords.push(...(body.records ?? []));
        allErrors.push(...(body.errors ?? []));
        if (body.suggestedCategoriesByWorkshopId) Object.assign(allSuggested, body.suggestedCategoriesByWorkshopId);
        if (body.shortDescriptionByWorkshopId) Object.assign(allShort, body.shortDescriptionByWorkshopId);
        if (body.steamUpdatedAtByWorkshopId) Object.assign(allUpdated, body.steamUpdatedAtByWorkshopId);
      }
      setSteamRecords(allRecords);
      setSuggestedCategories(current => ({ ...current, ...allSuggested }));
      setShortDescByWorkshop(current => ({ ...current, ...allShort }));
      setUpdatedAtByWorkshop(current => ({ ...current, ...allUpdated }));
      setSteamErrors(allErrors);
      if (queueWritable && allRecords.length > 0) {
        try {
          await saveQueue(allRecords.map(record => ({ source: "steam", record })));
        } catch (error) {
          setQueueError(error instanceof Error ? error.message : "Steam 결과를 대기함에 저장하지 못했습니다.");
        }
      }
    } catch {
      setSteamErrors(["Steam 연결에 실패했습니다. 나중에 다시 시도해 주세요."]);
    } finally {
      setLoadingSteam(false);
    }
  }

  async function confirmDismissQueue() {
    if (!queueDismiss) return;
    const { ids, workshopIds: wids } = queueDismiss;
    setQueueDismiss(null);
    setDeletingSelected(true);
    setQueueError("");
    try {
      if (queueWritable && ids.length > 0) {
        for (let i = 0; i < ids.length; i += 20) {
          const chunk = ids.slice(i, i + 20);
          const response = await fetch("/api/research-queue", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids: chunk })
          });
          const body = await response.json() as { error?: string };
          if (!response.ok) throw new Error(body.error || "선택 항목을 삭제하지 못했습니다.");
        }
        const removedIdSet = new Set(ids);
        setQueueRecords(current => current.filter(item => !removedIdSet.has(item.id)));
      }
      if (wids.length > 0) {
        const removedWids = new Set(wids);
        setSteamRecords(current => current.filter(rec => !removedWids.has(rec.workshopId)));
      }
      setBatchChoices({});
    } catch (error) {
      setQueueError(error instanceof Error ? error.message : "선택 항목을 삭제하지 못했습니다.");
    } finally {
      setDeletingSelected(false);
    }
  }

  const selected = selection && matched.groups.get(selection.id)?.find(
    ({ source, record }) => source === selection.candidate.source && record === selection.candidate.record
  );

  async function registerCandidate(id: string, candidate: ResearchCandidate): Promise<"saved" | "registered" | "error" | "skipped"> {
    if (readOnly || invalidPositions.length > 0 || lockedIds.current.has(id)) return "skipped";
    lockedIds.current.add(id);
    setResults(current => ({ ...current, [id]: { state: "saving", candidate } }));
    try {
      const response = await fetch("/api/mods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...candidate.record,
          shortDescription: shortDescByWorkshop[id] || summarizeModDescription(candidate.record.description),
          steamUpdatedAt: updatedAtByWorkshop[id] ?? null
        })
      });
      if (response.status === 409) {
        setResults(current => ({ ...current, [id]: { state: "registered", candidate } }));
        return "registered";
      }
      const body = await response.json() as { id?: string; error?: string };
      if (!response.ok || response.status !== 201 || !body.id) {
        throw new Error(body.error || "등록 결과를 확인하지 못했습니다. 카탈로그를 확인해 주세요.");
      }
      setResults(current => ({ ...current, [id]: { state: "saved", candidate } }));

      const suggested = suggestedCategories[id];
      if (suggested && suggested.categoryNames.length > 0 && suggested.primaryCategoryName) {
        await fetch("/api/mod-categories/auto-classify", {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: [{
              modId: body.id,
              categoryNames: suggested.categoryNames,
              primaryCategoryName: suggested.primaryCategoryName
            }]
          })
        }).catch(() => null);
      }

      const matchingQueueIds = queueRecords.filter(item => item.record.workshopId === id).map(item => item.id);
      if (matchingQueueIds.length) {
        const done = await fetch("/api/research-queue", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: matchingQueueIds })
        });
        if (done.ok) setQueueRecords(current => current.filter(item => !matchingQueueIds.includes(item.id)));
        else setQueueError("카탈로그 등록은 완료됐지만 대기함 정리에 실패했습니다.");
      }
      return "saved";
    } catch (error) {
      const message = error instanceof Error ? error.message : "저장할 수 없습니다.";
      setResults(current => current[id]?.state === "saved" ? current : ({
        ...current, [id]: { state: "error", candidate, message }
      }));
      lockedIds.current.delete(id);
      return "error";
    }
  }

  async function approve() {
    if (readOnly || !selection || !selected) return;
    const { id } = selection;
    const candidate = selected;
    setSelection(null);
    const outcome = await registerCandidate(id, candidate);
    if (outcome === "saved") onCatalogSaved?.();
  }

  const activeBatch = eligibleBatchApprovals(matched.groups, batchChoices, results);
  const unambiguous = unambiguousBatchCandidates(matched.groups, results);

  function selectAllUnambiguous() {
    setBatchSummary(null);
    setBatchChoices(current => {
      const next = { ...current };
      for (const [id, candidates] of unambiguous) next[id] = candidates[0];
      return next;
    });
  }

  function toggleCardSelection(id: string, candidate: ResearchCandidate, blocked: boolean) {
    if (blocked || approvingBatch || deletingSelected) return;
    setBatchChoices(current => {
      const next = { ...current };
      if (next[id] === candidate) delete next[id];
      else next[id] = candidate;
      return next;
    });
  }

  function requestDeleteSelected() {
    if (!activeBatch.length || deletingSelected) return;
    const chosenWids = activeBatch.map(([id]) => id);
    const widSet = new Set(chosenWids);
    const matchingQueueIds = queueRecords
      .filter(item => widSet.has(item.record.workshopId))
      .map(item => item.id);
    const firstTitle = activeBatch[0]?.[1].record.title ?? "";
    setQueueDismiss({
      ids: matchingQueueIds,
      workshopIds: chosenWids,
      label: firstTitle
    });
  }

  async function approveBatch() {
    if (readOnly || invalidPositions.length > 0 || approvingBatch || !activeBatch.length) return;
    const candidates = [...activeBatch];
    setBatchOpen(false);
    setApprovingBatch(true);
    setBatchSummary(null);
    const summary = { saved: 0, registered: 0, errors: 0 };
    try {
      for (const [id, candidate] of candidates) {
        const result = await registerCandidate(id, candidate);
        if (result === "saved") summary.saved++;
        if (result === "registered") summary.registered++;
        if (result === "error") summary.errors++;
      }
    } finally {
      setBatchSummary(summary);
      setApprovingBatch(false);
      setBatchChoices({});
      if (summary.saved > 0) onCatalogSaved?.();
    }
  }

  return (
    <div className="space-y-5">
      {readOnly && (
        <p role="status" className="panel p-4 text-sm text-amber-200">
          {queueWritable
            ? "시험 환경: Steam 공개 정보는 영구 대기함에 자동 저장되지만, 정식 모드 카탈로그 등록은 차단됩니다."
            : "이 배포는 읽기 전용입니다. 입력과 미리보기를 이용할 수 있습니다."}
        </p>
      )}

      {/* Merged Workshop URL input + Steam metadata lookup card */}
      <section className="panel space-y-3 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="workshop-input" className="text-sm font-semibold">Workshop URL 또는 ID</label>
          <button
            type="button"
            className="min-h-10 shrink-0 rounded-lg px-3 text-sm font-semibold text-[#b9efb0] hover:bg-[#1b3027] disabled:opacity-40"
            disabled={!workshopInput}
            onClick={() => { setWorkshopInput(""); setSteamRecords([]); setSteamErrors([]); setSelection(null); }}
          >
            지우기
          </button>
        </div>
        <textarea
          id="workshop-input"
          rows={2}
          value={workshopInput}
          onChange={(event) => {
            setWorkshopInput(event.target.value);
            setSteamRecords([]);
            setSteamErrors([]);
            setSelection(null);
          }}
          aria-invalid={invalidPositions.length > 0}
          className="field resize-y"
          placeholder={"https://steamcommunity.com/sharedfiles/filedetails/?id=1234567890\n9876543210"}
        />
        <div role="status">
          {(workshopIds.length > 0 || invalidPositions.length > 0) && (
            <p className="text-sm font-semibold">인식된 Workshop ID {workshopIds.length}개</p>
          )}
          {workshopIds.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {workshopIds.map((id) => <span key={id} className="rounded-lg bg-[#294535] px-2 py-1 text-xs">{id}</span>)}
            </div>
          )}
          {invalidPositions.length > 0 && (
            <p className="mt-2 text-sm text-amber-200">
              인식할 수 없는 입력이 {invalidPositions.length}개 있습니다. {invalidPositions.join(", ")}번 항목을 Steam Workshop URL 또는 5~20자리 숫자 ID로 입력해 주세요.
            </p>
          )}
        </div>
        <div className="space-y-2 pt-1">
          <button
            type="button"
            className="action w-full"
            onClick={loadSteamMetadata}
            disabled={loadingSteam || !workshopIds.length || workshopIds.length > 20 || invalidPositions.length > 0}
          >
            {loadingSteam ? "Steam 정보 확인 중..." : "입력한 모드 확인 (Steam 공개 정보)"}
          </button>
          {workshopIds.length > 20 && <p role="alert" className="text-sm text-amber-200">한 번에 최대 20개까지 확인할 수 있습니다.</p>}
          {steamErrors.map((message, index) => <p key={index} role="alert" className="text-sm text-amber-200">{message}</p>)}
          {queueError && <p role="alert" className="text-sm text-amber-200">{queueError}</p>}
        </div>
      </section>

      <section className="space-y-3">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-bold">
              검토 및 등록 {matched.groups.size > 0 ? `(${matched.groups.size}개)` : ""}
            </h2>
            {queueWritable && (
              <span className="muted text-xs">영구 대기함 {queueRecords.length}개</span>
            )}
          </div>
          <p className="muted text-xs">
            모드 카드를 누르면 체크박스로 선택됩니다. 선택한 모드를 한 번에 등록하거나 삭제할 수 있습니다.
          </p>

          <div className="sticky bottom-[84px] z-10 flex flex-wrap gap-1.5 rounded-2xl border border-[#304154] bg-[#101824]/95 p-2 backdrop-blur md:static md:border-0 md:bg-transparent md:p-0">
            <button
              type="button"
              className="secondary-action px-3 py-2 text-xs"
              disabled={approvingBatch || deletingSelected || !unambiguous.length}
              onClick={selectAllUnambiguous}
            >
              전체 선택 ({unambiguous.length})
            </button>
            <button
              type="button"
              className="secondary-action px-3 py-2 text-xs"
              disabled={approvingBatch || deletingSelected || !activeBatch.length}
              onClick={() => setBatchChoices({})}
            >
              선택 해제
            </button>
            {queueWritable && (
              <button
                type="button"
                className="secondary-action px-3 py-2 text-xs"
                onClick={() => void loadQueue()}
                disabled={loadingQueue || approvingBatch || deletingSelected}
              >
                {loadingQueue ? "새로고침 중..." : "영구 대기함 새로고침"}
              </button>
            )}
            <button
              type="button"
              className="secondary-action px-3 py-2 text-xs text-red-300"
              disabled={!activeBatch.length || approvingBatch || deletingSelected}
              onClick={requestDeleteSelected}
            >
              선택 삭제 ({activeBatch.length})
            </button>
            {!readOnly && (
              <button
                type="button"
                className="action px-3 py-2 text-xs"
                disabled={!activeBatch.length || approvingBatch || deletingSelected || invalidPositions.length > 0}
                onClick={() => setBatchOpen(true)}
              >
                {approvingBatch ? "등록 중..." : `선택 등록 (${activeBatch.length})`}
              </button>
            )}
          </div>

          {batchSummary && (
            <p role="status" className="text-sm text-[#b9efb0]">
              일괄 등록 결과: 성공 {batchSummary.saved}건 · 기존 등록 {batchSummary.registered}건 · 실패 {batchSummary.errors}건
            </p>
          )}
          {invalidPositions.length > 0 && (
            <p role="alert" className="text-sm text-amber-200">입력 형식 오류를 수정하기 전에는 등록을 승인할 수 없습니다.</p>
          )}
          {workshopIds.length > 0 && matched.excludedIds.length > 0 && (
            <p role="status" className="text-sm text-amber-200">입력하지 않은 Workshop ID {matched.excludedIds.join(", ")}의 항목은 제외했습니다.</p>
          )}
          {workshopIds.length > 0 && hasResearchData && matched.missingIds.length > 0 && (
            <p role="alert" className="text-sm text-amber-200">입력한 Workshop ID {matched.missingIds.join(", ")}에 해당하는 조회 결과가 없습니다.</p>
          )}
        </div>

        {!matched.groups.size && (
          <div className="panel p-6 text-sm muted">
            Workshop 링크 또는 숫자 ID를 입력해 Steam 정보를 조회하면 여기에 표시됩니다.
          </div>
        )}

        {Array.from(matched.groups, ([id, candidates]) => {
          const result = results[id];
          const blocked = invalidPositions.length > 0
            || result?.state === "saving"
            || result?.state === "saved"
            || result?.state === "registered";
          return (
            <div key={id} className="space-y-2.5">
              {candidates.length > 1 && (
                <p className="text-xs text-amber-200">같은 Workshop ID의 후보 {candidates.length}개입니다. 저장할 항목을 선택하세요.</p>
              )}
              {candidates.map((candidate, candidateIndex) => {
                const isSelected = batchChoices[id] === candidate;
                return (
                  <article
                    key={candidate.source + candidate.record.workshopId + candidateIndex}
                    onClick={() => toggleCardSelection(id, candidate, blocked)}
                    className={
                      "panel cursor-pointer space-y-3 p-4 transition-colors " +
                      (isSelected ? "border-[#8fcb85] bg-[#172820]" : "hover:border-[#6ca67b]")
                    }
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        aria-label={`${candidate.record.title} 선택`}
                        checked={isSelected}
                        disabled={blocked || approvingBatch || deletingSelected}
                        onClick={(event) => event.stopPropagation()}
                        onChange={() => toggleCardSelection(id, candidate, blocked)}
                        className="mt-1 h-5 w-5 shrink-0 accent-[#8fcb85]"
                      />
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h3 className="min-w-0 break-words text-base font-bold">{candidate.record.title}</h3>
                          <span className="muted shrink-0 text-[11px]">{sourceLabels[candidate.source]}</span>
                        </div>
                        <CompactRecordCardBody
                          item={candidate.record}
                          suggested={suggestedCategories[id]}
                          shortDescription={shortDescByWorkshop[id]}
                          steamUpdatedAt={updatedAtByWorkshop[id]}
                        />
                        <div className="flex flex-wrap gap-2 pt-1" onClick={(event) => event.stopPropagation()}>
                          <button
                            type="button"
                            className="action flex-1 text-xs"
                            disabled={readOnly || blocked}
                            onClick={() => setSelection({ id, candidate })}
                          >
                            {readOnly ? "등록 불가" : "바로 등록"}
                          </button>
                          <a
                            href={candidate.record.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="secondary-action shrink-0 px-3 text-xs"
                          >
                            Steam 원문
                          </a>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
              {result?.state === "saving" && <p role="status" className="text-sm">등록 중…</p>}
              {result?.state === "saved" && (
                <p role="status" className="text-sm text-[#b9efb0]">
                  등록 완료 · {result.candidate.record.title}
                </p>
              )}
              {result?.state === "registered" && <p role="status" className="text-sm text-amber-200">이미 등록된 Workshop ID입니다.</p>}
              {result?.state === "error" && <p role="alert" className="text-sm text-red-300">{result.message}</p>}
            </div>
          );
        })}
      </section>

      {!readOnly && selected && (
        <ApprovalDialog
          candidate={selected}
          suggested={suggestedCategories[selection!.id]}
          shortDescription={shortDescByWorkshop[selection!.id]}
          steamUpdatedAt={updatedAtByWorkshop[selection!.id]}
          onCancel={() => setSelection(null)}
          onApprove={() => void approve()}
        />
      )}
      {!readOnly && batchOpen && activeBatch.length > 0 && (
        <BatchApprovalDialog
          candidates={activeBatch.map(([, candidate]) => candidate)}
          onCancel={() => setBatchOpen(false)}
          onApprove={() => void approveBatch()}
        />
      )}
      {queueDismiss && (
        <DismissDialog
          count={queueDismiss.workshopIds.length}
          label={queueDismiss.label}
          onCancel={() => setQueueDismiss(null)}
          onConfirm={() => void confirmDismissQueue()}
        />
      )}
    </div>
  );
}
