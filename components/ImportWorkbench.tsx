"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { groupResearchCandidates, matchResearchCandidatesToInput, type ResearchCandidate } from "@/lib/research-candidates";
import {
  parseResearchPayload,
  parseWorkshopInput,
  type ResearchRecord
} from "@/lib/workshop";

const sourceLabels = { inbox: "조사함", manual: "수동 JSON", steam: "Steam 공개 정보 · AI 미분석" } as const;

type Result = {
  state: "saving" | "saved" | "registered" | "error";
  candidate: ResearchCandidate;
  message?: string;
};
type InboxResponse = { records: ResearchRecord[]; alreadyRegistered: number; errors: string[] };

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

export function ImportWorkbench({ readOnly }: { readOnly: boolean }) {
  const [workshopInput, setWorkshopInput] = useState("");
  const [rawJson, setRawJson] = useState("");
  const [inbox, setInbox] = useState<InboxResponse | null>(null);
  const [loadingInbox, setLoadingInbox] = useState(false);
  const [steamRecords, setSteamRecords] = useState<ResearchRecord[]>([]);
  const [steamErrors, setSteamErrors] = useState<string[]>([]);
  const [loadingSteam, setLoadingSteam] = useState(false);
  const [inboxError, setInboxError] = useState("");
  const [results, setResults] = useState<Record<string, Result>>({});
  const [selection, setSelection] = useState<{ id: string; candidate: ResearchCandidate } | null>(null);
  const lockedIds = useRef(new Set<string>());
  const { workshopIds, invalidPositions } = useMemo(() => parseWorkshopInput(workshopInput), [workshopInput]);
  const parsed = useMemo(
    () => rawJson.trim() ? parseResearchPayload(rawJson) : { records: [], errors: [] },
    [rawJson]
  );
  const groups = useMemo(() => groupResearchCandidates(inbox?.records ?? [], parsed.records, steamRecords), [inbox, parsed.records, steamRecords]);
  const matched = useMemo(() => matchResearchCandidatesToInput(groups, workshopIds), [groups, workshopIds]);
  const hasResearchData = inbox !== null || parsed.records.length > 0 || steamRecords.length > 0 || steamErrors.length > 0;

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
    } catch {
      setSteamErrors(["Steam 연결에 실패했습니다. 나중에 다시 시도해 주세요."]);
    } finally {
      setLoadingSteam(false);
    }
  }

  // An edit or refresh can replace a source record while its confirmation is open.
  const selected = selection && matched.groups.get(selection.id)?.find(
    ({ source, record }) => source === selection.candidate.source && record === selection.candidate.record
  );
  async function approve() {
    if (readOnly || invalidPositions.length > 0 || !selection || !selected || lockedIds.current.has(selection.id)) return;
    const { id } = selection;
    const candidate = selected;
    lockedIds.current.add(id);
    setSelection(null);
    setResults(current => ({ ...current, [id]: { state: "saving", candidate } }));
    try {
      const response = await fetch("/api/mods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(candidate.record)
      });
      if (response.status === 409) {
        setResults(current => ({ ...current, [id]: { state: "registered", candidate } }));
        return;
      }
      const body = await response.json() as { id?: string; error?: string };
      if (!response.ok || response.status !== 201 || !body.id) {
        throw new Error(body.error || "등록 결과를 확인하지 못했습니다. 카탈로그를 확인해 주세요.");
      }
      setResults(current => ({ ...current, [id]: { state: "saved", candidate } }));
    } catch (error) {
      lockedIds.current.delete(id);
      const message = error instanceof Error ? error.message : "저장할 수 없습니다.";
      setResults(current => ({ ...current, [id]: { state: "error", candidate, message } }));
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
          이 배포는 읽기 전용입니다. 입력과 미리보기를 이용할 수 있습니다.
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
        <h2 className="text-lg font-bold">2. 조사 결과 가져오기</h2>
        <p className="muted mt-2 text-sm leading-6">조사함에는 GitHub에 미리 저장된 결과만 있습니다. Workshop URL을 입력하거나 새로고침해도 해당 모드의 AI 조사가 자동 실행되지는 않습니다.</p>
        <div className="mt-3 space-y-2">
          <button type="button" className="action w-full" onClick={loadSteamMetadata}
            disabled={loadingSteam || !workshopIds.length || workshopIds.length > 20 || invalidPositions.length > 0}>
            {loadingSteam ? "Steam 정보 확인 중..." : "입력한 모드 확인 (Steam 공개 정보)"}
          </button>
          {workshopIds.length > 20 && <p role="alert" className="text-sm text-amber-200">한 번에 최대 20개까지 확인할 수 있습니다.</p>}
          <p className="muted text-xs">Steam의 공개 제목·설명만 조회합니다. AI 분석, Mod ID 및 B42.22·멀티 호환성 검증은 포함되지 않습니다. 카탈로그에 자동 저장하지 않습니다.</p>
          {steamErrors.map((message, index) => <p key={index} role="alert" className="text-sm text-amber-200">{message}</p>)}
        </div>
        <button type="button" className="secondary-action mt-3" onClick={loadInbox} disabled={loadingInbox}>
          {loadingInbox ? "조회 중..." : "조사함 새로고침"}
        </button>
        {inbox && <p role="status" className="muted mt-2 text-sm">조사함 {inbox.records.length}건 · 기존 등록 {inbox.alreadyRegistered}건 제외</p>}
        {inbox?.errors.map((message, index) => <p key={index} role="alert" className="text-sm text-amber-200">{message}</p>)}
        {inboxError && <p role="alert" className="text-sm text-amber-200">{inboxError}</p>}
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
        {parsed.errors.length > 0 && (
          <ul role="alert" className="mt-3 list-inside list-disc text-sm text-red-300">
            {parsed.errors.map((error, index) => <li key={index}>{error}</li>)}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-bold">3. 모드별 검토 및 승인</h2>
          <p className="muted mt-2 text-sm">저장할 출처와 내용을 선택한 뒤 확인창에서 최종 승인하세요.</p>
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
              {candidates.map(candidate => (
                <article key={candidate.source + candidate.record.workshopId} className="panel space-y-3 p-5">
                  <p className="text-xs font-semibold text-[#b9efb0]">{sourceLabels[candidate.source]}</p>
                  <h3 className="text-lg font-bold">{candidate.record.title}</h3>
                  <RecordDetails item={candidate.record} />
                  <button type="button" className="action w-full" disabled={blocked}
                    onClick={() => setSelection({ id, candidate })}>
                    {readOnly ? "이 환경에서는 저장할 수 없음" : "확인 후 추가하기"}
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
      {!readOnly && selected && <ApprovalDialog candidate={selected} onCancel={() => setSelection(null)} onApprove={approve} />}
    </div>
  );
}
