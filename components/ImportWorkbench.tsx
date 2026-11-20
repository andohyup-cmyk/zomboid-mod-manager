"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { groupResearchCandidates, matchResearchCandidatesToInput, type ResearchCandidate } from "@/lib/research-candidates";
import {
  parseResearchPayload,
  parseWorkshopInput,
  type ResearchRecord
} from "@/lib/workshop";

const sourceLabels = { inbox: "조사함", manual: "수동 JSON", steam: "Steam 공개 정보 · AI 미분석", queue: "영구 대기함" } as const;

type Result = {
  state: "saving" | "saved" | "registered" | "error";
  candidate: ResearchCandidate;
  message?: string;
};
type InboxResponse = { records: ResearchRecord[]; alreadyRegistered: number; errors: string[] };
type QueueItem = { id: string; source: "steam" | "manual" | "inbox"; record: ResearchRecord };

function RecordDetails({ item }: { item: ResearchRecord }) {
  return (
    <>
      <p className="muted text-xs">Workshop ID {item.workshopId}</p>
      <p className="text-sm">Mod ID: {item.modIds.length ? item.modIds.join(", ") : "미확인"}</p>
      <p className="muted whitespace-pre-wrap text-sm">{item.description || "설명 없음"}</p>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <p>조사 상태: {item.verificationStatus}</p>
        <p>확인일: {item.checkedAt || "미확인"}</p>
        <p>B42.22: {item.buildCompatibility}</p>
        <p>멀티: {item.multiplayerCompatibility}</p>
        <p>싱글: {item.singleplayerCompatibility}</p>
        <p>서버 중간 추가: {item.midServerAdditionCompatibility}</p>
      </div>
      <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="block break-all text-xs text-[#b9efb0] underline">
        Steam 원문 · {item.sourceUrl}
      </a>
      {item.sources.map(url => (
        <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="block break-all text-xs text-[#b9efb0] underline">
          추가 출처 · {url}
        </a>
      ))}
    </>
  );
}

function ApprovalDialog({ candidate, onCancel, onApprove }: {
  candidate: ResearchCandidate;
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
        <p>{sourceLabels[candidate.source]} · {candidate.record.title}</p>
        <RecordDetails item={candidate.record} />
        <div className="flex flex-wrap gap-3">
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
        <p className="text-sm">다음 {candidates.length}개 Workshop 항목을 카탈로그에 등록합니다.</p>
        <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
          {candidates.map(item => (
            <li key={item.record.workshopId}>{item.record.title} · {item.record.workshopId}</li>
          ))}
        </ul>
        <p className="muted text-xs">Mod ID·B42.22·멀티 호환성의 미확인 정보는 검증 없이 확정되지 않습니다.</p>
        <div className="flex flex-wrap gap-3">
          <button type="button" className="secondary-action" onClick={onCancel}>취소</button>
          <button type="button" className="action" onClick={onApprove}>선택 항목 최종 승인</button>
        </div>
      </div>
    </dialog>
  );
}

function DismissDialog({ title, onCancel, onConfirm }: {
  title: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return (
    <dialog ref={dialog} aria-labelledby="queue-dismiss-title" onCancel={onCancel}
      onClick={event => { if (event.target === event.currentTarget) onCancel(); }}
      className="panel m-auto w-[calc(100%_-_2rem)] max-w-lg p-5 text-[#ecf2f8] backdrop:bg-[#060b12cc]">
      <h2 id="queue-dismiss-title" className="text-lg font-bold">대기 항목 숨기기</h2>
      <p className="mt-3 text-sm">{title} 항목을 대기 목록에서 숨길까요? 카탈로그와 실제 서버 설정은 변경되지 않습니다.</p>
      <div className="mt-4 flex gap-3">
        <button type="button" className="secondary-action" onClick={onCancel}>취소</button>
        <button type="button" className="action" onClick={onConfirm}>숨기기 확인</button>
      </div>
    </dialog>
  );
}

export function ImportWorkbench({ readOnly, queueWritable = !readOnly }: { readOnly: boolean; queueWritable?: boolean }) {
  const [workshopInput, setWorkshopInput] = useState("");
  const [rawJson, setRawJson] = useState("");
  const [inbox, setInbox] = useState<InboxResponse | null>(null);
  const [loadingInbox, setLoadingInbox] = useState(false);
  const [steamRecords, setSteamRecords] = useState<ResearchRecord[]>([]);
  const [steamErrors, setSteamErrors] = useState<string[]>([]);
  const [loadingSteam, setLoadingSteam] = useState(false);
  const [queueRecords, setQueueRecords] = useState<QueueItem[]>([]);
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [queueError, setQueueError] = useState("");
  const [savingManual, setSavingManual] = useState(false);
  const [batchChoices, setBatchChoices] = useState<Record<string, ResearchCandidate>>({});
  const [batchOpen, setBatchOpen] = useState(false);
  const [approvingBatch, setApprovingBatch] = useState(false);
  const [batchSummary, setBatchSummary] = useState<{ saved: number; registered: number; errors: number } | null>(null);
  const [queueDismiss, setQueueDismiss] = useState<{ id: string; title: string } | null>(null);
  const [inboxError, setInboxError] = useState("");
  const [results, setResults] = useState<Record<string, Result>>({});
  const [selection, setSelection] = useState<{ id: string; candidate: ResearchCandidate } | null>(null);
  const lockedIds = useRef(new Set<string>());
  const { workshopIds, invalidPositions } = useMemo(() => parseWorkshopInput(workshopInput), [workshopInput]);
  const parsed = useMemo(
    () => rawJson.trim() ? parseResearchPayload(rawJson) : { records: [], errors: [] },
    [rawJson]
  );
  const groups = useMemo(() => groupResearchCandidates(inbox?.records ?? [], parsed.records, steamRecords, queueRecords.map(item => item.record)), [inbox, parsed.records, steamRecords, queueRecords]);
  const matched = useMemo(() => matchResearchCandidatesToInput(groups, workshopIds), [groups, workshopIds]);
  const hasResearchData = inbox !== null || parsed.records.length > 0 || steamRecords.length > 0 || steamErrors.length > 0 || queueRecords.length > 0;

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
    // Defer the initial fetch to avoid synchronous state updates during effect setup.
    // Preview remains read-only until a separately approved DB/RLS rollout.
    if (!queueWritable) return;
    let active = true;
    void Promise.resolve().then(() => { if (active) void loadQueue(); });
    return () => { active = false; };
  }, [queueWritable, loadQueue]);

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

  async function saveManualToQueue() {
    if (!queueWritable || savingManual || parsed.errors.length || !parsed.records.length) return;
    setSavingManual(true);
    setQueueError("");
    try {
      await saveQueue(parsed.records.map(record => ({ source: "manual", record })));
    } catch (error) {
      setQueueError(error instanceof Error ? error.message : "수동 조사 결과를 저장할 수 없습니다.");
    } finally {
      setSavingManual(false);
    }
  }

  async function loadInbox() {
    if (loadingInbox) return;
    setLoadingInbox(true);
    setInboxError("");
    setInbox(null);
    setSelection(current => current?.candidate.source === "inbox" ? null : current);
    try {
      const response = await fetch("/api/ai-research-inbox", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok || !Array.isArray(body.records)) {
        throw new Error(body.error || "조사함을 불러오지 못했습니다.");
      }
      setInbox({ records: body.records, errors: body.errors ?? [], alreadyRegistered: body.alreadyRegistered ?? 0 });
    } catch (error) {
      setInboxError(error instanceof Error ? error.message : "조사함을 불러오지 못했습니다.");
    } finally {
      setLoadingInbox(false);
    }
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
      for (let index = 0; index < workshopIds.length; index += 5) {
        const response = await fetch("/api/workshop-metadata", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workshopIds: workshopIds.slice(index, index + 5) })
        });
        const body = await response.json() as { records?: ResearchRecord[]; errors?: string[]; error?: string };
        if (!response.ok) {
          allErrors.push(body.error || "Steam 정보를 가져오지 못했습니다.");
          break;
        }
        allRecords.push(...(body.records ?? []));
        allErrors.push(...(body.errors ?? []));
      }
      setSteamRecords(allRecords);
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

  async function dismissQueue() {
    if (!queueWritable || !queueDismiss) return;
    const { id } = queueDismiss;
    setQueueDismiss(null);
    try {
      const response = await fetch("/api/research-queue", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id] })
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "대기 항목을 숨기지 못했습니다.");
      setQueueRecords(current => current.filter(item => item.id !== id));
      setBatchChoices({});
    } catch (error) {
      setQueueError(error instanceof Error ? error.message : "대기 항목을 숨기지 못했습니다.");
    }
  }

  // An edit or refresh can replace a source record while its confirmation is open.
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
        body: JSON.stringify(candidate.record)
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
      // Dismiss approved queue entries without deleting their archived database rows.
      const matchingQueueIds = queueRecords.filter(item => item.record.workshopId === id).map(item => item.id);
      if (matchingQueueIds.length) {
        const done = await fetch("/api/research-queue", {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: matchingQueueIds })
        });
        if (done.ok) setQueueRecords(current => current.filter(item => !matchingQueueIds.includes(item.id)));
        else setQueueError("카탈로그 등록은 완료됐지만 대기함 정리에 실패했습니다.");
      }
      return "saved";
    } catch (error) {
      // Even a queue-dismissal error must not undo a successful catalog approval.
      // A failed catalog write is retryable and keeps its original candidate.
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
    await registerCandidate(id, candidate);
  }

  const activeBatch = Object.entries(batchChoices).filter(([id, candidate]) =>
    matched.groups.get(id)?.some(item => item === candidate)
    && !["saving", "saved", "registered"].includes(results[id]?.state ?? "")
  ).slice(0, 20);

  // Never implicitly choose between competing reports for the same Workshop ID.
  const unambiguous = [...matched.groups].filter(([id, candidates]) =>
    candidates.length === 1 && !["saving", "saved", "registered"].includes(results[id]?.state ?? "")
  ).slice(0, 20);

  function selectAllUnambiguous() {
    setBatchSummary(null);
    setBatchChoices(current => {
      const next = { ...current };
      for (const [id, candidates] of unambiguous) next[id] = candidates[0];
      return next;
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
    }
  }

  const sample = {
    workshopId: "1234567890",
    title: "예시용 제목 — 실제 조사 결과로 변경",
    modIds: [],
    description: "예시 데이터이며 실제 모드 정보가 아닙니다.",
    checkedAt: null,
    verificationStatus: "unverified",
    buildCompatibility: "unverified",
    multiplayerCompatibility: "unverified",
    sources: []
  };

  return (
    <div className="space-y-7">
      {readOnly && (
        <p role="status" className="panel p-4 text-sm text-amber-200">
          {queueWritable ? "시험 환경: Steam 공개 정보는 영구 대기함에 자동 저장되지만, 정식 모드 카탈로그 등록은 차단됩니다." : "이 배포는 읽기 전용입니다. 입력과 미리보기를 이용할 수 있습니다."}
        </p>
      )}
      <section className="panel p-5 sm:p-6">
        <h2 className="text-lg font-bold">1. Workshop 항목 입력</h2>
        <p id="workshop-input-help" className="muted mt-2 text-sm leading-6">
          Steam Workshop URL과 숫자 Workshop ID를 공백, 줄바꿈 또는 쉼표로 구분해 입력하세요.
        </p>
        <label htmlFor="workshop-input" className="mt-5 mb-2 block text-sm font-semibold">Workshop URL 또는 ID</label>
        <textarea
          id="workshop-input"
          rows={4}
          value={workshopInput}
          onChange={(event) => {
            setWorkshopInput(event.target.value);
            setSteamRecords([]);
            setSteamErrors([]);
            setSelection(null);
          }}
          aria-describedby="workshop-input-help"
          aria-invalid={invalidPositions.length > 0}
          className="field resize-y"
          placeholder={"https://steamcommunity.com/sharedfiles/filedetails/?id=1234567890\n9876543210"}
        />
        <button type="button" className="secondary-action mt-2" disabled={!workshopInput} onClick={() => { setWorkshopInput(""); setSteamRecords([]); setSteamErrors([]); }}>입력 비우기</button>
        <div role="status">
          {(workshopIds.length > 0 || invalidPositions.length > 0) && (
            <p className="mt-4 text-sm font-semibold">인식된 Workshop ID {workshopIds.length}개</p>
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
      </section>

      <section className="panel p-5 sm:p-6">
        <h2 className="text-lg font-bold">2. Steam 조회 및 영구 대기함</h2>
        <p className="muted mt-2 text-sm leading-6">조사함에는 GitHub에 미리 저장된 결과만 있습니다. Workshop URL을 입력하거나 새로고침해도 해당 모드의 AI 조사가 자동 실행되지는 않습니다.</p>
        <div className="mt-3 space-y-2">
          <button type="button" className="action w-full" onClick={loadSteamMetadata}
            disabled={loadingSteam || !workshopIds.length || workshopIds.length > 20 || invalidPositions.length > 0}>
            {loadingSteam ? "Steam 정보 확인 중..." : "입력한 모드 확인 (Steam 공개 정보)"}
          </button>
          {workshopIds.length > 20 && <p role="alert" className="text-sm text-amber-200">한 번에 최대 20개까지 확인할 수 있습니다.</p>}
          <p className="muted text-xs">Steam의 공개 제목·설명만 조회합니다. AI 분석, Mod ID 및 B42.22·멀티 호환성 검증은 포함되지 않습니다. 쓰기 허용 환경에서는 영구 대기함에만 보관하며 카탈로그에 자동 등록하지 않습니다.</p>
          {steamErrors.map((message, index) => <p key={index} role="alert" className="text-sm text-amber-200">{message}</p>)}
        </div>
        <button type="button" className="secondary-action mt-3" onClick={loadInbox} disabled={loadingInbox}>
          {loadingInbox ? "조회 중..." : "조사함 새로고침"}
        </button>
        {inbox && <p role="status" className="muted mt-2 text-sm">조사함 {inbox.records.length}건 · 기존 등록 {inbox.alreadyRegistered}건 제외</p>}
        {inbox?.errors.map((message, index) => <p key={index} role="alert" className="text-sm text-amber-200">{message}</p>)}
        {inboxError && <p role="alert" className="text-sm text-amber-200">{inboxError}</p>}
        {queueWritable && (
          <div className="mt-4 space-y-3 rounded-xl border border-[#36513b] bg-[#14231e] p-4">
            <h3 className="font-semibold">영구 대기함 · 정식 등록 전 보관</h3>
            <p className="muted text-sm leading-6">
              Steam 공개 정보 조회 시 자동 저장됩니다. 저장된 항목은 새로고침 후에도 유지되며 정식 카탈로그에 자동 등록되지 않습니다.
            </p>
            <button type="button" className="secondary-action" onClick={() => void loadQueue()} disabled={loadingQueue}>
              {loadingQueue ? "영구 대기함 조회 중..." : "영구 대기함 새로고침"}
            </button>
            <p role="status" className="text-sm">영구 대기함 {queueRecords.length}개 · 로그인 계정에 저장</p>
            {queueRecords.map(item => (
              <div key={item.id} className="space-y-2 rounded-lg border border-[#36513b] p-3">
                <p className="text-sm font-semibold">{item.record.title}</p>
                <p className="muted text-xs">Workshop ID {item.record.workshopId} · {sourceLabels[item.source]}</p>
                <button type="button" className="secondary-action" onClick={() => setQueueDismiss({ id: item.id, title: item.record.title })}>
                  대기함에서 숨기기
                </button>
              </div>
            ))}
            {queueError && <p role="alert" className="text-sm text-amber-200">{queueError}</p>}
          </div>
        )}
        <p className="muted mt-2 text-sm leading-6">
          수동으로 등록할 조사 결과는 아래에 JSON으로 붙여넣으세요.
        </p>
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer font-semibold text-[#b9efb0]">입력 형식 예시 보기 (실제 모드 정보 아님)</summary>
          <pre className="mt-3 overflow-x-auto rounded-xl bg-[#0b111a] p-3 text-xs leading-5">{JSON.stringify([sample], null, 2)}</pre>
        </details>
        <label htmlFor="research-json" className="mt-5 mb-2 block text-sm font-semibold">JSON 조사 결과</label>
        <textarea
          id="research-json"
          rows={8}
          value={rawJson}
          onChange={event => {
            setRawJson(event.target.value);
            setSelection(current => current?.candidate.source === "manual" ? null : current);
          }}
          className="field resize-y font-mono text-xs leading-5"
          placeholder='[{"workshopId":"...","title":"...","modIds":["..."]}]'
        />
        {queueWritable && (
          <button type="button" className="secondary-action mt-3" onClick={() => void saveManualToQueue()}
            disabled={savingManual || !parsed.records.length || parsed.errors.length > 0}>
            {savingManual ? "대기함 저장 중..." : "수동 JSON을 영구 대기함에 저장"}
          </button>
        )}
        {parsed.errors.length > 0 && (
          <ul role="alert" className="mt-3 list-inside list-disc text-sm text-red-300">
            {parsed.errors.map((error, index) => <li key={index}>{error}</li>)}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-bold">3. 모드별 검토 및 승인</h2>
          <p className="muted mt-2 text-sm">
            {readOnly
              ? "이 단계는 정식 카탈로그 등록용입니다. 시험 환경에서는 비활성화되며, 위 영구 대기함 저장은 정상적으로 사용할 수 있습니다."
              : "저장할 출처와 내용을 선택한 뒤 확인창에서 최종 승인하세요."}
          </p>
          {!readOnly && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className="secondary-action" disabled={approvingBatch || !unambiguous.length}
                onClick={selectAllUnambiguous}>중복 없는 항목 전체 선택 ({unambiguous.length}개)</button>
              <button type="button" className="secondary-action" disabled={approvingBatch || !activeBatch.length}
                onClick={() => setBatchChoices({})}>선택 해제</button>
              <button type="button" className="action" disabled={!activeBatch.length || approvingBatch || invalidPositions.length > 0}
                onClick={() => setBatchOpen(true)}>
                {approvingBatch ? "선택 항목 등록 중..." : `선택 모드 등록 (${activeBatch.length}개)`}
              </button>
            </div>
          )}
          {!readOnly && unambiguous.length < matched.groups.size && (
            <p className="muted mt-2 text-xs">서로 다른 출처의 후보가 있거나 이미 등록된 항목은 전체 선택에서 제외됩니다. 후보를 직접 비교해 선택하세요.</p>
          )}
          {batchSummary && <p role="status" className="mt-2 text-sm">
            일괄 등록 결과: 성공 {batchSummary.saved}건 · 기존 등록 {batchSummary.registered}건 · 실패 {batchSummary.errors}건
          </p>}
          {invalidPositions.length > 0 && (
            <p role="alert" className="mt-2 text-sm text-amber-200">입력 형식 오류를 수정하기 전에는 등록을 승인할 수 없습니다.</p>
          )}
          {workshopIds.length > 0 && matched.excludedIds.length > 0 && (
            <p role="status" className="mt-2 text-sm text-amber-200">입력하지 않은 Workshop ID {matched.excludedIds.join(", ")}의 조사 결과는 제외했습니다.</p>
          )}
          {workshopIds.length > 0 && hasResearchData && matched.missingIds.length > 0 && (
            <p role="alert" className="mt-2 text-sm text-amber-200">입력한 Workshop ID {matched.missingIds.join(", ")}에 해당하는 조사 결과가 없습니다. 해당 ID의 조사 자료를 가져오거나 수동 JSON에 입력해 주세요.</p>
          )}
        </div>
        {!matched.groups.size && (
          <div className="panel p-6 text-sm muted">
            {workshopIds.length > 0 && hasResearchData
              ? "입력한 Workshop ID와 일치하는 조사 결과가 없습니다. 조사함 조회는 새 AI 조사가 아니며, 입력한 ID와 맞는 조사 자료가 필요합니다."
              : "조사함을 조회하거나 수동 JSON을 입력하면 항목별 미리보기가 표시됩니다."}
          </div>
        )}
        {Array.from(matched.groups, ([id, candidates]) => {
          const result = results[id];
          const blocked = readOnly || invalidPositions.length > 0 || result?.state === "saving" || result?.state === "saved" || result?.state === "registered";
          return (
            <div key={id} className="space-y-3">
              {candidates.length > 1 && (
                <p className="text-sm text-amber-200">같은 Workshop ID의 후보 {candidates.length}개입니다. 내용을 비교하고 저장할 항목을 선택하세요.</p>
              )}
              {candidates.map((candidate, candidateIndex) => (
                <article key={candidate.source + candidate.record.workshopId + candidateIndex} className="panel space-y-3 p-5">
                  <p className="text-xs font-semibold text-[#b9efb0]">{sourceLabels[candidate.source]}</p>
                  <h3 className="text-lg font-bold">{candidate.record.title}</h3>
                  <RecordDetails item={candidate.record} />
                  {!readOnly && (
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={batchChoices[id] === candidate} disabled={blocked || approvingBatch}
                        onChange={event => setBatchChoices(current => {
                          const next = { ...current };
                          if (event.target.checked) next[id] = candidate;
                          else if (next[id] === candidate) delete next[id];
                          return next;
                        })} />
                      일괄 등록할 후보 선택
                    </label>
                  )}
                  <button type="button" className="action w-full" disabled={blocked}
                    onClick={() => setSelection({ id, candidate })}>
                    {readOnly ? "시험 환경: 정식 카탈로그 등록 불가" : "확인 후 추가하기"}
                  </button>
                </article>
              ))}
              {result?.state === "saving" && <p role="status" className="text-sm">등록 중…</p>}
              {result?.state === "saved" && (
                <p role="status" className="text-sm text-[#b9efb0]">
                  등록 완료 · {sourceLabels[result.candidate.source]} · {result.candidate.record.title}
                </p>
              )}
              {result?.state === "registered" && <p role="status" className="text-sm text-amber-200">이미 등록된 Workshop ID입니다.</p>}
              {result?.state === "error" && <p role="alert" className="text-sm text-red-300">{result.message}</p>}
            </div>
          );
        })}
      </section>
      {!readOnly && selected && <ApprovalDialog candidate={selected} onCancel={() => setSelection(null)} onApprove={() => void approve()} />}
      {!readOnly && batchOpen && activeBatch.length > 0 && (
        <BatchApprovalDialog candidates={activeBatch.map(([, candidate]) => candidate)}
          onCancel={() => setBatchOpen(false)} onApprove={() => void approveBatch()} />
      )}
      {queueWritable && queueDismiss && (
        <DismissDialog title={queueDismiss.title} onCancel={() => setQueueDismiss(null)}
          onConfirm={() => void dismissQueue()} />
      )}
    </div>
  );
}
