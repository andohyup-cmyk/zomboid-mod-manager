"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { statusLabel, statusStyle } from "@/lib/status-display";
import {
  buildBatchCategoryRequests,
  selectAllBatchMods,
  toggleBatchModSelection
} from "@/lib/mod-category-batch";

export type CatalogListItem = {
  id: string;
  title: string;
  workshop_id: string;
  build_compatibility: string;
  multiplayer_compatibility: string;
  is_archived: boolean;
  modIdsText: string;
  primaryCategoryName: string | null;
};

export type BatchCategoryOption = { id: string; name: string };

export function ModCatalogList({
  items,
  categories,
  writeEnabled
}: {
  items: CatalogListItem[];
  categories: BatchCategoryOption[];
  writeEnabled: boolean;
}) {
  const router = useRouter();
  const [batchMode, setBatchMode] = useState(false);
  const [selectedMods, setSelectedMods] = useState<string[]>([]);
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [primaryCat, setPrimaryCat] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState("");
  const [error, setError] = useState("");

  function toggleCategory(catId: string) {
    setConfirming(false);
    setSummary("");
    setError("");
    if (selectedCats.includes(catId)) {
      const next = selectedCats.filter((id) => id !== catId);
      setSelectedCats(next);
      setPrimaryCat(next.includes(primaryCat ?? "") ? primaryCat : (next[0] ?? null));
    } else if (selectedCats.length < 64) {
      setSelectedCats([...selectedCats, catId]);
      setPrimaryCat(primaryCat ?? catId);
    }
  }

  function exitBatchMode() {
    setBatchMode(false);
    setSelectedMods([]);
    setSelectedCats([]);
    setPrimaryCat(null);
    setConfirming(false);
    setError("");
    setSummary("");
  }

  async function applyBatch() {
    if (!writeEnabled || busy) return;
    const requests = buildBatchCategoryRequests(selectedMods, selectedCats, primaryCat);
    if (!requests) {
      setError("적용할 모드와 카테고리를 확인해 주세요.");
      return;
    }
    setConfirming(false);
    setBusy(true);
    setError("");
    setSummary("");
    let ok = 0;
    let failed = 0;
    for (const payload of requests) {
      try {
        const res = await fetch("/api/mod-categories", {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        if (res.ok) ok += 1;
        else failed += 1;
      } catch {
        failed += 1;
      }
    }
    setBusy(false);
    if (failed === 0) {
      setSummary(`${ok}개 모드의 카테고리를 일괄 적용했습니다.`);
      setSelectedMods([]);
    } else {
      setError(`일괄 적용 완료: 성공 ${ok}개, 실패 ${failed}개`);
    }
    router.refresh();
  }

  const canApply = writeEnabled && !busy && selectedMods.length > 0 &&
    buildBatchCategoryRequests(selectedMods, selectedCats, primaryCat) !== null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="muted text-xs">{items.length}개 표시</p>
        <div className="flex flex-wrap gap-2">
          {batchMode ? (
            <>
              <button
                type="button"
                className="secondary-action px-3 py-1.5 text-xs"
                disabled={busy}
                onClick={() => setSelectedMods(selectAllBatchMods(items.map((item) => item.id)))}
              >
                전체 선택
              </button>
              <button
                type="button"
                className="secondary-action px-3 py-1.5 text-xs"
                disabled={busy || selectedMods.length === 0}
                onClick={() => setSelectedMods([])}
              >
                선택 해제
              </button>
              <button
                type="button"
                className="secondary-action px-3 py-1.5 text-xs"
                disabled={busy}
                onClick={exitBatchMode}
              >
                일괄 분류 닫기
              </button>
            </>
          ) : (
            <button
              type="button"
              className="secondary-action px-3 py-1.5 text-xs"
              onClick={() => { setBatchMode(true); setSummary(""); setError(""); }}
            >
              일괄 분류
            </button>
          )}
        </div>
      </div>

      {batchMode && (
        <section className="panel space-y-3 p-4" aria-label="카테고리 일괄 지정">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold">선택한 모드 일괄 분류 ({selectedMods.length}개 선택)</h2>
            <span className="muted text-xs">
              {selectedCats.length > 0 ? `${selectedCats.length}개 카테고리` : "미분류(0개)"}
            </span>
          </div>
          {!writeEnabled && (
            <p className="rounded-lg border border-[#5b704d] bg-[#1a2922] p-2.5 text-xs" role="status">
              현재 환경은 읽기 전용입니다. 일괄 저장은 시험 쓰기 승인 후 가능합니다.
            </p>
          )}
          {categories.length === 0 ? (
            <p className="muted text-xs">등록된 카테고리가 없습니다. 위 카테고리 관리에서 먼저 추가하거나 미분류 해제만 적용할 수 있습니다.</p>
          ) : (
            <div className="space-y-1.5">
              {categories.map((cat) => {
                const checked = selectedCats.includes(cat.id);
                return (
                  <div
                    key={cat.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#304154] bg-[#10202d] px-3 py-2"
                  >
                    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={busy}
                        onChange={() => toggleCategory(cat.id)}
                        className="h-4 w-4 shrink-0 accent-[#8fcb85]"
                      />
                      <span className="break-words">{cat.name}</span>
                    </label>
                    <label className="flex cursor-pointer items-center gap-1.5 text-xs">
                      <input
                        type="radio"
                        name="batch-primary-category"
                        checked={primaryCat === cat.id}
                        disabled={!checked || busy}
                        onChange={() => { setPrimaryCat(cat.id); setConfirming(false); }}
                        className="h-4 w-4 accent-[#8fcb85]"
                      />
                      대표
                    </label>
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="action text-xs"
              disabled={!canApply}
              onClick={() => setConfirming(true)}
            >
              {busy
                ? "적용 중..."
                : selectedCats.length === 0
                  ? `선택 ${selectedMods.length}개 미분류로 해제`
                  : `선택 ${selectedMods.length}개에 일괄 적용`}
            </button>
          </div>
          {confirming && canApply && (
            <div className="space-y-2 rounded-lg border border-[#5b704d] p-3 text-xs">
              <p>
                선택한 {selectedMods.length}개 모드의 기존 카테고리를{" "}
                {selectedCats.length === 0
                  ? "모두 해제(미분류)하시겠습니까?"
                  : "위 선택과 대표 카테고리로 교체하시겠습니까?"}
              </p>
              <div className="flex gap-2">
                <button type="button" className="action text-xs" onClick={() => void applyBatch()}>
                  확인 후 적용
                </button>
                <button type="button" className="secondary-action text-xs" onClick={() => setConfirming(false)}>
                  취소
                </button>
              </div>
            </div>
          )}
          {summary && <p role="status" className="text-xs text-[#b9efb0]">{summary}</p>}
          {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
        </section>
      )}

      <ul className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2">
        {items.map((mod) => {
          const checked = selectedMods.includes(mod.id);
          const cardContent = (
            <>
              <div className="flex items-start justify-between gap-2">
                <h2 className="min-w-0 break-words text-base font-bold">{mod.title}</h2>
                {mod.is_archived && (
                  <span className="shrink-0 rounded-md bg-[#2a3441] px-2 py-0.5 text-[11px]">보관</span>
                )}
              </div>
              <p className="muted truncate text-xs">
                Workshop {mod.workshop_id} · Mod ID {mod.modIdsText}
              </p>
              <div className="flex flex-wrap gap-1.5 text-[11px]">
                <span className="rounded-md bg-[#1f3a4d] px-2 py-0.5 text-[#bfe3ff]">
                  {mod.primaryCategoryName ?? "미분류"}
                </span>
                <span className={"rounded-md px-2 py-0.5 " + statusStyle(mod.build_compatibility)}>
                  B42.22 {statusLabel(mod.build_compatibility)}
                </span>
                <span className={"rounded-md px-2 py-0.5 " + statusStyle(mod.multiplayer_compatibility)}>
                  멀티 {statusLabel(mod.multiplayer_compatibility)}
                </span>
              </div>
            </>
          );

          return (
            <li key={mod.id}>
              {batchMode ? (
                <label
                  className={
                    "panel flex cursor-pointer items-start gap-3 p-4 transition-colors " +
                    (checked ? "border-[#8fcb85] bg-[#172820]" : "hover:border-[#6ca67b]")
                  }
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={busy}
                    onChange={() => {
                      setSelectedMods((current) => toggleBatchModSelection(current, mod.id));
                      setConfirming(false);
                    }}
                    className="mt-1 h-5 w-5 shrink-0 accent-[#8fcb85]"
                  />
                  <div className="min-w-0 flex-1 space-y-2">{cardContent}</div>
                </label>
              ) : (
                <Link
                  href={`/mods/${mod.id}`}
                  className="panel block space-y-2 p-4 transition-colors active:border-[#6ca67b] hover:border-[#6ca67b]"
                >
                  {cardContent}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
