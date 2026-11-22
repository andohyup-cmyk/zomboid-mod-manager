"use client";

import { useEffect, useState } from "react";
import {
  canSaveModCategories, changeModPrimary, modCategoryChanged, parseCategoryCatalog,
  parseModCategoryDraft, toggleModCategory,
  type CategoryOption, type ModCategoryDraft
} from "@/lib/mod-category-editor";

async function getJson(path: string, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(path, { credentials: "same-origin", cache: "no-store", signal });
  if (!response.ok) throw new Error(`조회 실패 (HTTP ${response.status})`);
  return response.json() as Promise<unknown>;
}

export function ModCategoryPanel({
  modId, writeEnabled
}: { modId: string; writeEnabled: boolean }) {
  const [catalog, setCatalog] = useState<CategoryOption[] | null>(null);
  const [saved, setSaved] = useState<ModCategoryDraft | null>(null);
  const [draft, setDraft] = useState<ModCategoryDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const path = `/api/mod-categories?modId=${encodeURIComponent(modId)}`;

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError("");
      setNotice("");
      setConfirming(false);
      setCatalog(null);
      setSaved(null);
      setDraft(null);
      try {
        const [rawCatalog, rawMod] = await Promise.all([
          getJson("/api/categories", controller.signal),
          getJson(path, controller.signal)
        ]);
        const categories = parseCategoryCatalog(rawCatalog);
        const assignment = categories && parseModCategoryDraft(rawMod, modId, categories);
        if (!categories || !assignment) {
          throw new Error("카테고리 응답이 불완전하거나 소속 정보가 일치하지 않습니다.");
        }
        if (!controller.signal.aborted) {
          setCatalog(categories);
          setSaved(assignment);
          setDraft(assignment);
        }
      } catch (caught) {
        if (!controller.signal.aborted) {
          setError(caught instanceof Error ? caught.message : "카테고리를 읽지 못했습니다.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [modId, path, reload]);

  const changed = saved !== null && draft !== null && modCategoryChanged(saved, draft);
  const valid = draft !== null && canSaveModCategories(draft);
  const savingAllowed = writeEnabled && !loading && !busy && changed && valid;

  async function save() {
    if (!savingAllowed || !saved || !draft || !catalog) return;
    setConfirming(false);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      // Avoid overwriting a change already visible in another tab before POST.
      const before = parseModCategoryDraft(await getJson(path), modId, catalog);
      if (!before || modCategoryChanged(saved, before)) {
        throw new Error("다른 화면에서 분류가 변경됐습니다. 다시 조회 후 확인하세요.");
      }
      const result = await fetch("/api/mod-categories", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modId, categoryIds: draft.categoryIds, primaryCategoryId: draft.primaryCategoryId
        })
      });
      if (!result.ok) throw new Error(`저장이 거부됐습니다 (HTTP ${result.status}). 다시 조회하세요.`);
      const confirmed = parseModCategoryDraft(await getJson(path), modId, catalog);
      if (!confirmed || modCategoryChanged(draft, confirmed)) {
        throw new Error("저장 응답을 받았지만 재조회 결과를 확인할 수 없습니다. 다시 조회하세요.");
      }
      setSaved(confirmed);
      setDraft(confirmed);
      setNotice("카테고리 저장 후 재조회까지 확인했습니다.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "저장 상태를 확인할 수 없습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel space-y-4 p-5" aria-label="모드 카테고리 관리">
      <div className="space-y-1">
        <h2 className="text-lg font-bold">카테고리</h2>
        <p className="muted text-xs leading-5">
          이 모드의 분류 정보입니다. 서버 프로필의 Mod ID 선택이나 로드 순서는 변경하지 않습니다.
        </p>
      </div>
      {!writeEnabled && (
        <p className="rounded-lg border border-[#5b704d] bg-[#1a2922] p-3 text-sm" role="status">
          현재 Preview는 읽기·선택 미리보기 전용입니다. 실제 저장은 별도 시험 쓰기 승인 후 가능합니다.
        </p>
      )}
      {loading && <p className="muted text-sm" role="status">카테고리를 조회하는 중입니다.</p>}
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      {!loading && catalog && draft && (
        <>
          {catalog.length === 0 ? (
            <p className="muted text-sm">아직 등록된 카테고리가 없습니다. 카테고리 등록 기능은 후속 단계에서 연결합니다.</p>
          ) : (
            <>
              <p className="text-sm font-semibold">소속 카테고리 선택 (여러 개 가능)</p>
              <div className="space-y-2">
                {catalog.map(category => {
                  const selected = draft.categoryIds.includes(category.id);
                  return (
                    <div key={category.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#304154] bg-[#10202d] p-3">
                      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-sm">
                        <input type="checkbox" checked={selected} disabled={busy}
                          onChange={() => {
                            setDraft(current => current ? toggleModCategory(current, category.id) : current);
                            setConfirming(false); setNotice(""); setError("");
                          }}
                          className="h-5 w-5 shrink-0 accent-[#8fcb85]" />
                        <span className="break-words">{category.name}</span>
                      </label>
                      <label className="flex cursor-pointer items-center gap-2 text-xs">
                        <input type="radio" name={`primary-category-${modId}`}
                          checked={draft.primaryCategoryId === category.id} disabled={!selected || busy}
                          onChange={() => {
                            setDraft(current => current ? changeModPrimary(current, category.id) : current);
                            setConfirming(false); setNotice(""); setError("");
                          }}
                          className="h-4 w-4 accent-[#8fcb85]" />
                        대표
                      </label>
                    </div>
                  );
                })}
              </div>
            </>
          )}
          <div className="space-y-1 rounded-lg bg-[#0e1722] p-3 text-sm">
            <p>현재 선택: {draft.categoryIds.length
              ? draft.categoryIds.map(id => catalog.find(cat => cat.id === id)?.name ?? "확인 필요").join(", ")
              : "미분류"}</p>
            <p>대표 카테고리: {catalog.find(cat => cat.id === draft.primaryCategoryId)?.name ?? "없음"}</p>
          </div>
          {draft.categoryIds.length === 0 && (
            <p className="text-xs text-amber-200">
              현재 저장 API는 카테고리 0개로 변경하는 기능을 지원하지 않습니다.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="secondary-action text-sm" disabled={busy || !changed}
              onClick={() => { setDraft(saved); setConfirming(false); setError(""); setNotice(""); }}>
              변경 취소
            </button>
            <button type="button" className="action text-sm" disabled={!savingAllowed}
              onClick={() => setConfirming(true)}>
              변경 저장
            </button>
            <button type="button" className="secondary-action text-sm" disabled={busy}
              onClick={() => setReload(value => value + 1)}>
              다시 조회
            </button>
          </div>
          {confirming && savingAllowed && (
            <div className="space-y-2 rounded-lg border border-[#5b704d] p-3" role="group" aria-label="카테고리 변경 저장 확인">
              <p className="text-sm">선택한 분류와 대표 카테고리를 저장하시겠습니까?</p>
              <div className="flex gap-2">
                <button type="button" className="action text-sm" onClick={() => void save()}>
                  확인 후 저장
                </button>
                <button type="button" className="secondary-action text-sm"
                  onClick={() => setConfirming(false)}>취소</button>
              </div>
            </div>
          )}
          {notice && <p role="status" className="text-sm text-[#b9efb0]">{notice}</p>}
        </>
      )}
      {!loading && (error || !catalog) && (
        <button type="button" className="secondary-action text-sm"
          onClick={() => setReload(value => value + 1)}>조회 재시도</button>
      )}
    </section>
  );
}
