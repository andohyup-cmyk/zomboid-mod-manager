"use client";

import { useMemo, useState } from "react";
import {
  extractWorkshopLinks,
  parseResearchPayload,
  type ResearchRecord
} from "@/lib/workshop";

type Result = { state: "saving" | "saved" | "error"; message?: string };

export function ImportWorkbench() {
  const [links, setLinks] = useState("");
  const [rawJson, setRawJson] = useState("");
  const [inboxRecords, setInboxRecords] = useState<ResearchRecord[]>([]);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [inboxError, setInboxError] = useState("");
  const [inboxMessage, setInboxMessage] = useState("");
  const [results, setResults] = useState<Record<string, Result>>({});
  const workshopIds = useMemo(() => extractWorkshopLinks(links), [links]);
  const parsed = useMemo(
    () => rawJson.trim() ? parseResearchPayload(rawJson) : { records: [], errors: [] },
    [rawJson]
  );

  const reviewRecords = useMemo(() => {
    const seen = new Set<string>();
    return [...inboxRecords, ...parsed.records].filter((record) => {
      if (seen.has(record.workshopId)) return false;
      seen.add(record.workshopId);
      return true;
    });
  }, [inboxRecords, parsed.records]);

  async function loadInbox() {
    setInboxLoading(true);
    setInboxError("");
    setInboxMessage("");
    try {
      const response = await fetch("/api/ai-research-inbox", { cache: "no-store" });
      const body = await response.json() as {
        error?: string;
        records?: ResearchRecord[];
        errors?: string[];
        alreadyRegistered?: number;
      };
      if (!response.ok || !Array.isArray(body.records)) {
        throw new Error(body.error || "조사 결과를 불러오지 못했습니다.");
      }
      setInboxRecords(body.records);
      setInboxMessage(`등록 대기 ${body.records.length}개 · 기존 등록 ${body.alreadyRegistered ?? 0}개 제외`);
      if (body.errors?.length) setInboxError(body.errors.join(" / "));
    } catch (error) {
      setInboxError(error instanceof Error ? error.message : "연결에 실패했습니다.");
    } finally {
      setInboxLoading(false);
    }
  }

  async function approve(item: ResearchRecord) {
    setResults((current) => ({ ...current, [item.workshopId]: { state: "saving" } }));
    try {
      const response = await fetch("/api/mods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item)
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "저장에 실패했습니다.");
      setResults((current) => ({ ...current, [item.workshopId]: { state: "saved" } }));
    } catch (error) {
      setResults((current) => ({
        ...current,
        [item.workshopId]: {
          state: "error",
          message: error instanceof Error ? error.message : "저장할 수 없습니다."
        }
      }));
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
      <section className="panel p-5 sm:p-6">
        <h2 className="text-lg font-bold">1. Workshop 링크 준비</h2>
        <p className="muted mt-2 text-sm leading-6">Steam Workshop 링크를 한 번에 여러 개 붙여넣을 수 있습니다. 링크를 입력하는 것만으로 저장되지는 않습니다.</p>
        <label htmlFor="workshop-links" className="mt-5 mb-2 block text-sm font-semibold">Workshop 링크</label>
        <textarea
          id="workshop-links"
          rows={4}
          value={links}
          onChange={(event) => setLinks(event.target.value)}
          className="field resize-y"
          placeholder={"https://steamcommunity.com/sharedfiles/filedetails/?id=...\n여러 링크를 줄바꿈으로 구분"}
        />
        {links && (
          <div className="mt-4">
            <p className="text-sm font-semibold">인식된 Workshop ID: {workshopIds.length}개</p>
            {workshopIds.length ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {workshopIds.map((id) => <span key={id} className="rounded-lg bg-[#294535] px-2 py-1 text-xs">{id}</span>)}
              </div>
            ) : <p className="mt-2 text-sm text-amber-200">인식 가능한 Steam Workshop 링크가 없습니다.</p>}
          </div>
        )}
      </section>

      <section className="panel space-y-3 p-5 sm:p-6">
        <div>
          <h2 className="text-lg font-bold">2. ChatGPT 조사 결과 받기 (시험 기능)</h2>
          <p className="muted mt-2 text-sm leading-6">
            ChatGPT 대화에서 조사해 비공개 GitHub 저장소로 전달한 항목을 가져옵니다.
            별도 JSON 복사는 필요 없지만, 이 화면에 링크를 입력하는 것만으로 ChatGPT 조사가 자동 시작되지는 않습니다.
            GitHub 변경 사항의 Vercel 배포가 끝난 후 불러올 수 있습니다.
          </p>
        </div>
        <button type="button" className="secondary-action w-full" onClick={loadInbox} disabled={inboxLoading}>
          {inboxLoading ? "가져오는 중..." : "ChatGPT 조사 결과 새로고침"}
        </button>
        {inboxMessage && <p role="status" className="text-sm text-[#b9efb0]">{inboxMessage}</p>}
        {inboxError && <p role="alert" className="text-sm text-amber-200">{inboxError}</p>}
      </section>

      <details className="panel p-5 sm:p-6">
        <summary className="cursor-pointer text-sm font-bold">예비 방식: JSON 직접 입력 (열기)</summary>
        <div className="mt-4">
        <h2 className="text-lg font-bold">기존 AI 조사 결과 가져오기</h2>
        <p className="muted mt-2 text-sm leading-6">
          ChatGPT에서 조사한 정보를 구조화된 JSON으로 가져오는 예비 방식(B)입니다.
          새 GitHub 전송 시험 기능이 정상 작동하지 않을 때 사용할 수 있도록 임시 유지합니다.
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
          onChange={(event) => { setRawJson(event.target.value); setResults({}); }}
          className="field resize-y font-mono text-xs leading-5"
          placeholder='[{"workshopId":"...","title":"...","modIds":["..."]}]'
        />
        {parsed.errors.length > 0 && (
          <ul role="alert" className="mt-3 list-inside list-disc text-sm text-red-300">
            {parsed.errors.map((error, index) => <li key={index}>{error}</li>)}
          </ul>
        )}
        </div>
      </details>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-bold">3. 모드별 검토 및 승인</h2>
          <p className="muted mt-2 text-sm">각 항목의 정보를 확인하고 개별적으로 '추가하기'를 누른 경우에만 저장합니다.</p>
        </div>
        {reviewRecords.length === 0 && (
          <div className="panel p-6 text-sm muted">ChatGPT 조사 결과를 새로고침하거나 예비 JSON 입력을 이용하면 항목별 미리보기가 표시됩니다.</div>
        )}
        {reviewRecords.map((item) => {
          const status = results[item.workshopId];
          return (
            <article key={item.workshopId} className="panel space-y-3 p-5">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-lg font-bold">{item.title}</h3>
                <span className="shrink-0 rounded-lg border border-[#304154] px-2 py-1 text-[11px] text-[#b9efb0]">검토 필요</span>
              </div>
              <p className="muted text-xs">Workshop ID {item.workshopId}</p>
              <p className="text-sm">Mod ID: {item.modIds.length ? item.modIds.join(", ") : "미확인"}</p>
              <p className="muted whitespace-pre-wrap text-sm">{item.description || "설명 없음"}</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <p>조사 상태: {item.verificationStatus}</p>
                <p>확인일: {item.checkedAt || "미확인"}</p>
                <p>B42.22: {item.buildCompatibility}</p>
                <p>멀티: {item.multiplayerCompatibility}</p>
              </div>
              <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="block break-all text-xs text-[#b9efb0] underline">Steam 원문 보기</a>
              {item.sources.map((url) => <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="block break-all text-xs text-[#b9efb0] underline">추가 확인 출처</a>)}
              <button
                type="button"
                className="action w-full"
                onClick={() => approve(item)}
                disabled={status?.state === "saving" || status?.state === "saved"}
              >
                {status?.state === "saving" ? "등록 중..." : status?.state === "saved" ? "등록 완료" : "확인 후 추가하기"}
              </button>
              {status?.state === "error" && <p role="alert" className="text-sm text-red-300">{status.message}</p>}
              {status?.state === "saved" && <p role="status" className="text-sm text-[#b9efb0]">카탈로그에 저장했습니다.</p>}
            </article>
          );
        })}
      </section>
    </div>
  );
}
