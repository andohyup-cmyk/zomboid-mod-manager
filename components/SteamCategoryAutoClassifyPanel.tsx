"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type PreviewItem = {
  modId: string;
  workshopId: string;
  title: string;
  alreadyClassified: boolean;
  categoryNames: string[];
  primaryCategoryName: string | null;
  lookupFailed: boolean;
};

type PreviewResponse = {
  scope: "unclassified" | "all";
  totalTargetCount: number;
  classifiedCount: number;
  unclassifiedCount: number;
  failedCount: number;
  categoriesToCreate: { name: string; sortOrder: number }[];
  items: PreviewItem[];
  error?: string;
};

export function SteamCategoryAutoClassifyPanel({
  writeEnabled,
  embedded = false
}: {
  writeEnabled: boolean;
  embedded?: boolean;
}) {
  const router = useRouter();
  const [includeClassified, setIncludeClassified] = useState(false);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [selectedModIds, setSelectedModIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function runPreview() {
    if (loading || applying) return;
    setLoading(true);
    setError(null);
    setStatus(null);
    setConfirming(false);
    try {
      const scope = includeClassified ? "all" : "unclassified";
      const response = await fetch(`/api/mod-categories/auto-classify?scope=${scope}`, {
        credentials: "same-origin",
        cache: "no-store"
      });
      const body = (await response.json().catch(() => ({}))) as PreviewResponse;
      if (!response.ok || !Array.isArray(body.items)) {
        throw new Error(body.error || "Steam 태그 미리보기를 불러오지 못했습니다.");
      }
      setPreview(body);
      setSelectedModIds(
        body.items
          .filter((item) => item.categoryNames.length > 0 && item.primaryCategoryName !== null)
          .map((item) => item.modId)
      );
      if (body.totalTargetCount === 0) {
        setStatus(
          scope === "unclassified"
            ? "미분류 상태인 사용 중 모드가 없습니다."
            : "분류할 사용 중 모드가 없습니다."
        );
      }
    } catch (caught) {
      setPreview(null);
      setSelectedModIds([]);
      setError(caught instanceof Error ? caught.message : "Steam 태그 미리보기에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  function toggleMod(modId: string) {
    setConfirming(false);
    setSelectedModIds((current) =>
      current.includes(modId) ? current.filter((id) => id !== modId) : [...current, modId]
    );
  }

  async function applySelected() {
    if (!preview || !writeEnabled || applying || loading) return;
    const chosen = preview.items.filter(
      (item) =>
        selectedModIds.includes(item.modId)
        && item.categoryNames.length > 0
        && item.primaryCategoryName !== null
    );
    if (chosen.length === 0) return;

    setApplying(true);
    setConfirming(false);
    setError(null);
    setStatus(null);
    try {
      const response = await fetch("/api/mod-categories/auto-classify", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: chosen.map((item) => ({
            modId: item.modId,
            categoryNames: item.categoryNames,
            primaryCategoryName: item.primaryCategoryName
          }))
        })
      });
      const body = (await response.json().catch(() => ({}))) as {
        createdCategories?: string[];
        appliedCount?: number;
        failedCount?: number;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(body.error || "카테고리 일괄 적용에 실패했습니다.");
      }
      const createdCount = body.createdCategories?.length ?? 0;
      const appliedCount = body.appliedCount ?? 0;
      const failedCount = body.failedCount ?? 0;
      setStatus(
        `적용 완료: 카테고리 ${createdCount}개 생성 · 모드 ${appliedCount}개 분류` +
        (failedCount > 0 ? ` · 실패 ${failedCount}개` : "")
      );
      setPreview(null);
      setSelectedModIds([]);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "카테고리 일괄 적용에 실패했습니다.");
    } finally {
      setApplying(false);
    }
  }

  const classifiableItems = preview
    ? preview.items.filter((item) => item.categoryNames.length > 0 && item.primaryCategoryName !== null)
    : [];
  const chosenCount = classifiableItems.filter((item) => selectedModIds.includes(item.modId)).length;
  const busy = loading || applying;

  const body = (
    <div className={embedded ? "space-y-3" : "mt-3 space-y-3"}>
        <label className="flex cursor-pointer items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={includeClassified}
            disabled={busy}
            onChange={(event) => {
              setIncludeClassified(event.target.checked);
              setPreview(null);
              setSelectedModIds([]);
              setConfirming(false);
            }}
            className="h-4 w-4 accent-[#8fcb85]"
          />
          이미 분류된 모드도 다시 분석해 덮어쓰기 (기본: 미분류 모드만)
        </label>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="action min-h-11 text-xs"
            disabled={busy}
            onClick={() => { void runPreview(); }}
          >
            {loading ? "Steam 태그 조회 중..." : "1단계: Steam 태그 분류 미리보기"}
          </button>
          {preview && (
            <button
              type="button"
              className="secondary-action min-h-11 text-xs"
              disabled={busy}
              onClick={() => {
                setPreview(null);
                setSelectedModIds([]);
                setConfirming(false);
                setError(null);
              }}
            >
              닫기
            </button>
          )}
        </div>

        {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
        {status && <p role="status" className="text-xs text-[#b9efb0]">{status}</p>}

        {preview && preview.totalTargetCount > 0 && (
          <div className="space-y-3 rounded-xl border border-[#304154] bg-[#10202d] p-3">
            <p className="text-xs">
              대상 <strong>{preview.totalTargetCount}개</strong> · 자동 분류 가능 <strong>{preview.classifiedCount}개</strong> · 태그 없음(미분류 유지) {preview.unclassifiedCount}개
              {preview.failedCount > 0 ? ` · 조회 실패 ${preview.failedCount}개` : ""}
            </p>

            {preview.categoriesToCreate.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-[#b9efb0]">
                  새로 자동 생성될 카테고리 ({preview.categoriesToCreate.length}개)
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {preview.categoriesToCreate.map((cat) => (
                    <span
                      key={cat.name}
                      className="rounded-md bg-[#234332] px-2 py-0.5 text-[11px] font-semibold text-[#b9efb0]"
                    >
                      {cat.sortOrder > 0 ? `${cat.sortOrder}. ` : ""}{cat.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {classifiableItems.length > 0 && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-[#bfe3ff]">
                    적용할 모드 선택 ({chosenCount}/{classifiableItems.length}개)
                  </p>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      disabled={busy}
                      className="secondary-action px-2.5 py-1 text-[11px]"
                      onClick={() => {
                        setConfirming(false);
                        setSelectedModIds(classifiableItems.map((item) => item.modId));
                      }}
                    >
                      전체 선택
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      className="secondary-action px-2.5 py-1 text-[11px]"
                      onClick={() => {
                        setConfirming(false);
                        setSelectedModIds([]);
                      }}
                    >
                      선택 해제
                    </button>
                  </div>
                </div>

                <ul className="max-h-72 space-y-2 overflow-y-auto">
                  {classifiableItems.map((item) => {
                    const checked = selectedModIds.includes(item.modId);
                    return (
                      <li key={item.modId} className="rounded-lg border border-[#304154] bg-[#152333] p-2.5">
                        <label className="flex cursor-pointer items-start gap-2.5">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={busy}
                            onChange={() => toggleMod(item.modId)}
                            className="mt-0.5 h-4 w-4 shrink-0 accent-[#8fcb85]"
                          />
                          <div className="min-w-0 flex-1 space-y-1">
                            <p className="break-words text-sm font-semibold">{item.title}</p>
                            <div className="flex flex-wrap gap-1 text-[11px]">
                              {item.categoryNames.map((name) => {
                                const isPrimary = name === item.primaryCategoryName;
                                return (
                                  <span
                                    key={name}
                                    className={
                                      isPrimary
                                        ? "rounded-md bg-[#234332] px-1.5 py-0.5 font-semibold text-[#b9efb0]"
                                        : "rounded-md bg-[#1f3a4d] px-1.5 py-0.5 text-[#bfe3ff]"
                                    }
                                  >
                                    {isPrimary ? `★ ${name}` : name}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        </label>
                      </li>
                    );
                  })}
                </ul>

                {!writeEnabled ? (
                  <p className="rounded-lg border border-[#5b704d] bg-[#1a2922] p-2.5 text-xs" role="status">
                    현재 환경은 읽기 전용입니다. 자동 분류 저장은 시험 쓰기 승인 후 가능합니다.
                  </p>
                ) : (
                  <>
                    <button
                      type="button"
                      className="action w-full text-xs"
                      disabled={busy || chosenCount === 0}
                      onClick={() => setConfirming(true)}
                    >
                      {applying
                        ? "카테고리 생성 및 적용 중..."
                        : `2단계: 선택한 ${chosenCount}개 모드에 자동 분류 적용`}
                    </button>

                    {confirming && chosenCount > 0 && (
                      <div className="space-y-2 rounded-lg border border-[#5b704d] bg-[#172821] p-3 text-xs">
                        <p className="font-semibold">
                          {preview.categoriesToCreate.length > 0
                            ? `새 카테고리 ${preview.categoriesToCreate.length}개를 생성하고 `
                            : ""}
                          선택한 {chosenCount}개 모드의 카테고리를 저장할까요?
                        </p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="action text-xs"
                            disabled={busy}
                            onClick={() => { void applySelected(); }}
                          >
                            확인 후 적용
                          </button>
                          <button
                            type="button"
                            className="secondary-action text-xs"
                            disabled={busy}
                            onClick={() => setConfirming(false)}
                          >
                            취소
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>
  );

  if (embedded) return body;

  return (
    <details className="panel group p-4">
      <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold">
        <span>자동 카테고리 설정</span>
        <span className="muted text-xs group-open:hidden">펼치기</span>
        <span className="muted hidden text-xs group-open:inline">접기</span>
      </summary>
      {body}
    </details>
  );
}
