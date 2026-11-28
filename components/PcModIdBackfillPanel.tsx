"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type ChangeEvent } from "react";
import { parseLocalWorkshopInventory } from "@/lib/local-workshop-inventory";
import {
  buildPcRegistrationPayload,
  planPcModIdBackfill,
  type PcBackfillCatalogMod,
  type PcBackfillPlan
} from "@/lib/mod-detail-edit";
import type { SuggestedCategories } from "@/lib/steam-category-rules";
import type { ResearchRecord } from "@/lib/workshop";

type Props = {
  catalogMods: readonly PcBackfillCatalogMod[];
  writeEnabled: boolean;
};

type SteamLookupState = {
  record: ResearchRecord | null;
  suggested?: SuggestedCategories;
  failed: boolean;
};

const STEAM_BATCH_SIZE = 5;

export function PcModIdBackfillPanel({ catalogMods, writeEnabled }: Props) {
  const router = useRouter();
  const [fileName, setFileName] = useState<string | null>(null);
  const [plan, setPlan] = useState<PcBackfillPlan | null>(null);
  const [selectedUpdateIds, setSelectedUpdateIds] = useState<string[]>([]);
  const [selectedNewWorkshops, setSelectedNewWorkshops] = useState<string[]>([]);
  const [newFilter, setNewFilter] = useState("");
  const [steamByWorkshop, setSteamByWorkshop] = useState<Record<string, SteamLookupState>>({});
  const [loadingRepo, setLoadingRepo] = useState(false);
  const [savingBackfill, setSavingBackfill] = useState(false);
  const [lookingUpSteam, setLookingUpSteam] = useState(false);
  const [steamProgress, setSteamProgress] = useState<string | null>(null);
  const [confirmRegister, setConfirmRegister] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [registerProgress, setRegisterProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  function applyLoadedPlan(nextPlan: PcBackfillPlan, nextFileName: string) {
    setFileName(nextFileName);
    setPlan(nextPlan);
    setSelectedUpdateIds(nextPlan.updates.map(item => item.modId));
    setSelectedNewWorkshops(nextPlan.unregistered.map(item => item.workshopId));
    setSteamByWorkshop({});
    setConfirmRegister(false);
    setNewFilter("");
  }

  async function loadRepoAudit() {
    if (loadingRepo) return;
    setLoadingRepo(true);
    setError(null);
    setStatus(null);
    try {
      const response = await fetch("/api/pc-workshop-audit", { cache: "no-store" });
      const body = (await response.json().catch(() => ({}))) as {
        fileName?: string;
        inventory?: unknown;
        error?: string;
      };
      if (!response.ok || !body.inventory) {
        throw new Error(body.error || "저장소 PC 스캔 파일을 불러오지 못했습니다.");
      }
      const parsed = parseLocalWorkshopInventory(body.inventory);
      if (!parsed.ok) throw new Error(parsed.error);
      applyLoadedPlan(
        planPcModIdBackfill(parsed.inventory, catalogMods),
        body.fileName ?? "저장소 PC 스캔"
      );
    } catch (err) {
      setPlan(null);
      setFileName(null);
      setError(err instanceof Error ? err.message : "저장소 PC 스캔 파일을 불러오지 못했습니다.");
    } finally {
      setLoadingRepo(false);
    }
  }

  async function onFileSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(null);
    setStatus(null);
    if (file.size > 512_000) {
      setPlan(null);
      setFileName(null);
      setError("PC 스캔 JSON 파일은 500KB 이하여야 합니다.");
      return;
    }
    try {
      const raw = JSON.parse((await file.text()).replace(/^\uFEFF/, "")) as unknown;
      const parsed = parseLocalWorkshopInventory(raw);
      if (!parsed.ok) {
        setPlan(null);
        setFileName(null);
        setError(parsed.error);
        return;
      }
      applyLoadedPlan(planPcModIdBackfill(parsed.inventory, catalogMods), file.name);
    } catch {
      setPlan(null);
      setFileName(null);
      setError("JSON 파일을 읽을 수 없습니다. PC 스캔 파일인지 확인해 주세요.");
    }
  }

  function toggleUpdate(modId: string) {
    setSelectedUpdateIds(current =>
      current.includes(modId) ? current.filter(id => id !== modId) : [...current, modId]
    );
  }

  function toggleNewWorkshop(workshopId: string) {
    setConfirmRegister(false);
    setSelectedNewWorkshops(current =>
      current.includes(workshopId) ? current.filter(id => id !== workshopId) : [...current, workshopId]
    );
  }

  async function applySelectedBackfill() {
    if (!plan || !writeEnabled || savingBackfill) return;
    const chosen = plan.updates.filter(item => selectedUpdateIds.includes(item.modId));
    if (chosen.length === 0) return;

    setSavingBackfill(true);
    setError(null);
    setStatus(null);
    try {
      const response = await fetch("/api/mod-ids", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: chosen.map(item => ({ modId: item.modId, values: item.newModIds }))
        })
      });
      const body = (await response.json().catch(() => ({}))) as {
        addedCount?: number;
        skippedCount?: number;
        error?: string;
      };
      if (!response.ok) throw new Error(body.error || "Mod ID 저장에 실패했습니다.");
      const appliedIds = new Set(chosen.map(item => item.modId));
      const remaining = plan.updates.filter(item => !appliedIds.has(item.modId));
      setPlan({
        ...plan,
        updates: remaining,
        alreadyCompleteCount: plan.alreadyCompleteCount + chosen.length
      });
      setSelectedUpdateIds(remaining.map(item => item.modId));
      setStatus(
        `${chosen.length}개 모드에 Mod ID ${body.addedCount ?? 0}개를 채웠습니다.` +
        (body.skippedCount ? ` (이미 등록된 ${body.skippedCount}개 제외)` : "")
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mod ID 저장에 실패했습니다.");
    } finally {
      setSavingBackfill(false);
    }
  }

  async function lookupSteamTitles() {
    if (!plan || lookingUpSteam || registering) return;
    const targetIds = plan.unregistered
      .map(item => item.workshopId)
      .filter(id => selectedNewWorkshops.includes(id) && !steamByWorkshop[id]?.record);
    if (targetIds.length === 0) {
      setStatus("선택한 항목의 Steam 제목은 이미 조회됐습니다.");
      return;
    }

    setLookingUpSteam(true);
    setError(null);
    setStatus(null);
    let found = 0;
    let missed = 0;
    try {
      for (let i = 0; i < targetIds.length; i += STEAM_BATCH_SIZE) {
        const chunk = targetIds.slice(i, i + STEAM_BATCH_SIZE);
        setSteamProgress(`Steam 제목 조회 중 (${Math.min(i + chunk.length, targetIds.length)}/${targetIds.length})...`);
        const response = await fetch("/api/workshop-metadata", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workshopIds: chunk })
        });
        const body = (await response.json().catch(() => ({}))) as {
          records?: ResearchRecord[];
          suggestedCategoriesByWorkshopId?: Record<string, SuggestedCategories>;
          error?: string;
        };
        const foundMap = new Map<string, ResearchRecord>();
        if (response.ok && Array.isArray(body.records)) {
          for (const rec of body.records) foundMap.set(rec.workshopId, rec);
        }
        const suggestedMap = body.suggestedCategoriesByWorkshopId ?? {};
        setSteamByWorkshop(current => {
          const next = { ...current };
          for (const wid of chunk) {
            const match = foundMap.get(wid) ?? null;
            next[wid] = { record: match, suggested: suggestedMap[wid], failed: !match };
          }
          return next;
        });
        for (const wid of chunk) {
          if (foundMap.has(wid)) found += 1;
          else missed += 1;
        }
      }
      setStatus(
        `Steam 제목 조회 완료: 확인 ${found}개` +
        (missed > 0 ? ` · 미조회 ${missed}개(임시 제목 사용 가능)` : "")
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Steam 제목 조회 중 오류가 발생했습니다.");
    } finally {
      setLookingUpSteam(false);
      setSteamProgress(null);
    }
  }

  async function registerSelectedNewMods() {
    if (!plan || !writeEnabled || registering || lookingUpSteam) return;
    const chosen = plan.unregistered.filter(item => selectedNewWorkshops.includes(item.workshopId));
    if (chosen.length === 0) return;

    setRegistering(true);
    setConfirmRegister(false);
    setError(null);
    setStatus(null);

    const today = new Date().toISOString().slice(0, 10);
    const doneWorkshops = new Set<string>();
    const categoryApplyItems: { modId: string; categoryNames: readonly string[]; primaryCategoryName: string }[] = [];
    let saved = 0;
    let alreadyRegistered = 0;
    let failed = 0;
    let lastError = "";

    try {
      for (let i = 0; i < chosen.length; i += 1) {
        const item = chosen[i];
        setRegisterProgress(`새 모드 등록 중 (${i + 1}/${chosen.length})...`);
        const payload = buildPcRegistrationPayload(
          item,
          steamByWorkshop[item.workshopId]?.record ?? null,
          today
        );
        const response = await fetch("/api/mods", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        if (response.status === 201) {
          saved += 1;
          doneWorkshops.add(item.workshopId);
          const created = (await response.json().catch(() => ({}))) as { id?: string };
          const suggested = steamByWorkshop[item.workshopId]?.suggested;
          if (created.id && suggested && suggested.categoryNames.length > 0 && suggested.primaryCategoryName) {
            categoryApplyItems.push({
              modId: created.id,
              categoryNames: suggested.categoryNames,
              primaryCategoryName: suggested.primaryCategoryName
            });
          }
        } else if (response.status === 409) {
          alreadyRegistered += 1;
          doneWorkshops.add(item.workshopId);
        } else {
          failed += 1;
          const body = (await response.json().catch(() => ({}))) as { error?: string };
          lastError = body.error || `HTTP ${response.status}`;
        }
      }

      let categorized = 0;
      if (categoryApplyItems.length > 0) {
        setRegisterProgress("추천 카테고리 자동 적용 중...");
        const catRes = await fetch("/api/mod-categories/auto-classify", {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: categoryApplyItems })
        }).catch(() => null);
        if (catRes?.ok) {
          const catBody = (await catRes.json().catch(() => ({}))) as { appliedCount?: number };
          categorized = catBody.appliedCount ?? 0;
        }
      }

      const remaining = plan.unregistered.filter(item => !doneWorkshops.has(item.workshopId));
      setPlan({
        ...plan,
        unregistered: remaining,
        unmatchedScanWorkshops: remaining.length,
        alreadyCompleteCount: plan.alreadyCompleteCount + saved + alreadyRegistered
      });
      setSelectedNewWorkshops(current => current.filter(id => !doneWorkshops.has(id)));
      setStatus(
        `새 모드 등록 완료: 추가 ${saved}개` +
        (categorized > 0 ? ` · 자동 분류 ${categorized}개` : "") +
        (alreadyRegistered > 0 ? ` · 기존 등록 ${alreadyRegistered}개` : "") +
        (failed > 0 ? ` · 실패 ${failed}개` : "")
      );
      if (failed > 0 && lastError) setError(`일부 등록 실패: ${lastError}`);
      if (saved > 0) router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "새 모드 등록 중 오류가 발생했습니다.");
    } finally {
      setRegistering(false);
      setRegisterProgress(null);
    }
  }

  const chosenUpdates = plan ? plan.updates.filter(item => selectedUpdateIds.includes(item.modId)) : [];
  const chosenModIdTotal = chosenUpdates.reduce((sum, item) => sum + item.newModIds.length, 0);
  const chosenNew = plan ? plan.unregistered.filter(item => selectedNewWorkshops.includes(item.workshopId)) : [];
  const chosenWithoutSteamCount = chosenNew.filter(item => !steamByWorkshop[item.workshopId]?.record).length;

  const filteredUnregistered = useMemo(() => {
    if (!plan) return [];
    const q = newFilter.trim().toLowerCase();
    if (!q) return plan.unregistered;
    return plan.unregistered.filter(item => {
      const steamTitle = steamByWorkshop[item.workshopId]?.record?.title?.toLowerCase() ?? "";
      return item.workshopId.includes(q)
        || steamTitle.includes(q)
        || item.modIds.some(id => id.toLowerCase().includes(q));
    });
  }, [plan, newFilter, steamByWorkshop]);

  const busy = loadingRepo || savingBackfill || lookingUpSteam || registering;

  return (
    <details className="panel group p-4">
      <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold">
        <span>PC 스캔으로 모드 등록 · Mod ID 채우기</span>
        <span className="muted text-xs group-open:hidden">펼치기</span>
        <span className="muted hidden text-xs group-open:inline">접기</span>
      </summary>
      <div className="mt-3 space-y-3">
        <p className="muted text-xs leading-5">
          저장소의 PC 스캔(81개 워크숍)을 불러오거나 새 <code className="font-mono">zomboid-workshop-audit*.json</code>을 선택해,
          이미 등록된 모드의 빈 Mod ID를 채우거나 미등록 모드를 골라 카탈로그에 등록할 수 있습니다. (B42.22·멀티 호환성은 미확인 유지)
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => { void loadRepoAudit(); }}
            className="action min-h-11 text-xs"
          >
            {loadingRepo ? "스캔 불러오는 중..." : "저장소 PC 스캔 불러오기"}
          </button>
          <label className="secondary-action inline-flex min-h-11 cursor-pointer items-center text-xs">
            다른 JSON 파일 선택
            <input
              type="file"
              accept=".json,application/json"
              className="sr-only"
              disabled={busy}
              onChange={(event) => { void onFileSelected(event); }}
            />
          </label>
          {plan && (
            <button
              type="button"
              disabled={busy}
              className="secondary-action min-h-11 text-xs"
              onClick={() => {
                setPlan(null);
                setFileName(null);
                setSelectedUpdateIds([]);
                setSelectedNewWorkshops([]);
                setSteamByWorkshop({});
                setConfirmRegister(false);
                setError(null);
                setStatus(null);
              }}
            >
              닫기
            </button>
          )}
          {fileName && <span className="muted truncate text-xs">{fileName}</span>}
        </div>

        {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
        {status && <p role="status" className="text-xs text-[#b9efb0]">{status}</p>}
        {(steamProgress || registerProgress) && (
          <p role="status" className="text-xs text-amber-200">{steamProgress || registerProgress}</p>
        )}

        {plan && (
          <div className="space-y-4">
            <p className="text-xs">
              Mod ID 채울 기존 모드 <strong>{plan.updates.length}개</strong> · 미등록 새 모드 <strong>{plan.unregistered.length}개</strong> · 이미 완료 {plan.alreadyCompleteCount}개
            </p>

            {plan.updates.length > 0 && (
              <div className="space-y-3 rounded-xl border border-[#304154] bg-[#10202d] p-3">
                <h3 className="text-xs font-bold text-[#b9efb0]">1. 기존 모드에 빈 Mod ID 채우기 ({plan.updates.length}개)</h3>
                <ul className="max-h-60 space-y-2 overflow-y-auto">
                  {plan.updates.map((item) => {
                    const checked = selectedUpdateIds.includes(item.modId);
                    return (
                      <li key={item.modId} className="rounded-lg border border-[#304154] bg-[#152333] p-2.5">
                        <label className="flex cursor-pointer items-start gap-2.5">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={busy}
                            onChange={() => toggleUpdate(item.modId)}
                            className="mt-0.5 h-4 w-4 shrink-0 accent-[#8fcb85]"
                          />
                          <div className="min-w-0 flex-1 space-y-1">
                            <p className="break-words text-sm font-semibold">{item.title}</p>
                            <p className="muted text-[11px]">Workshop {item.workshopId}</p>
                            <div className="flex flex-wrap gap-1">
                              {item.newModIds.map((id) => (
                                <span
                                  key={id}
                                  className="rounded-md bg-[#234332] px-1.5 py-0.5 font-mono text-[11px] text-[#b9efb0]"
                                >
                                  +{id}
                                </span>
                              ))}
                            </div>
                          </div>
                        </label>
                      </li>
                    );
                  })}
                </ul>
                <button
                  type="button"
                  className="action w-full text-xs"
                  disabled={!writeEnabled || busy || chosenUpdates.length === 0}
                  onClick={() => { void applySelectedBackfill(); }}
                >
                  {!writeEnabled
                    ? "이 환경에서는 저장할 수 없습니다"
                    : savingBackfill
                      ? "Mod ID 저장 중..."
                      : `선택한 ${chosenUpdates.length}개 모드에 Mod ID ${chosenModIdTotal}개 채우기`}
                </button>
              </div>
            )}

            {plan.unregistered.length > 0 && (
              <div className="space-y-3 rounded-xl border border-[#304154] bg-[#10202d] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xs font-bold text-[#bfe3ff]">
                    2. 미등록 새 모드 추가 ({chosenNew.length}/{plan.unregistered.length}개 선택)
                  </h3>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setConfirmRegister(false);
                        setSelectedNewWorkshops(plan.unregistered.map(item => item.workshopId));
                      }}
                      className="secondary-action px-2.5 py-1 text-[11px]"
                    >
                      전체 선택
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setConfirmRegister(false);
                        setSelectedNewWorkshops([]);
                      }}
                      className="secondary-action px-2.5 py-1 text-[11px]"
                    >
                      선택 해제
                    </button>
                  </div>
                </div>

                <input
                  type="search"
                  value={newFilter}
                  onChange={(event) => setNewFilter(event.target.value)}
                  placeholder="미등록 모드 검색 (Workshop ID · Mod ID · 제목)"
                  className="field w-full text-xs"
                />

                <ul className="max-h-72 space-y-2 overflow-y-auto">
                  {filteredUnregistered.map((item) => {
                    const checked = selectedNewWorkshops.includes(item.workshopId);
                    const steam = steamByWorkshop[item.workshopId];
                    const displayTitle = steam?.record?.title ?? item.modIds[0] ?? `Workshop ${item.workshopId}`;
                    return (
                      <li key={item.workshopId} className="rounded-lg border border-[#304154] bg-[#152333] p-2.5">
                        <label className="flex cursor-pointer items-start gap-2.5">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={busy}
                            onChange={() => toggleNewWorkshop(item.workshopId)}
                            className="mt-0.5 h-4 w-4 shrink-0 accent-[#8fcb85]"
                          />
                          <div className="min-w-0 flex-1 space-y-1">
                            <p className="break-words text-sm font-semibold">{displayTitle}</p>
                            <p className="muted text-[11px]">
                              Workshop {item.workshopId}
                              {steam?.record
                                ? " · Steam 제목 확인됨"
                                : steam?.failed
                                  ? " · Steam 미조회 (임시 제목)"
                                  : " · Steam 제목 미조회"}
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {item.modIds.map((id) => (
                                <span
                                  key={id}
                                  className="rounded-md bg-[#1f3a4d] px-1.5 py-0.5 font-mono text-[11px] text-[#bfe3ff]"
                                >
                                  {id}
                                </span>
                              ))}
                            </div>
                          </div>
                        </label>
                      </li>
                    );
                  })}
                </ul>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    className="secondary-action w-full text-xs"
                    disabled={busy || chosenNew.length === 0}
                    onClick={() => { void lookupSteamTitles(); }}
                  >
                    {lookingUpSteam
                      ? (steamProgress ?? "Steam 제목 조회 중...")
                      : `1단계: 선택한 ${chosenNew.length}개 Steam 제목 조회`}
                  </button>
                  <button
                    type="button"
                    className="action w-full text-xs"
                    disabled={!writeEnabled || busy || chosenNew.length === 0}
                    onClick={() => setConfirmRegister(true)}
                  >
                    {!writeEnabled
                      ? "이 환경에서는 등록할 수 없습니다"
                      : registering
                        ? (registerProgress ?? "등록 중...")
                        : `2단계: 선택한 ${chosenNew.length}개 모드 등록`}
                  </button>
                </div>

                {confirmRegister && writeEnabled && chosenNew.length > 0 && (
                  <div className="space-y-2 rounded-lg border border-[#5b704d] bg-[#172821] p-3 text-xs">
                    <p className="font-semibold">
                      선택한 {chosenNew.length}개 모드를 카탈로그에 등록할까요?
                    </p>
                    <p className="muted leading-5">
                      PC 스캔의 실제 Mod ID와 함께 저장되며, B42.22·멀티 호환성은 모두 미확인 상태로 등록됩니다.
                      {chosenWithoutSteamCount > 0 && (
                        ` (Steam 제목 미조회 ${chosenWithoutSteamCount}개는 Mod ID 기반 임시 제목으로 저장됩니다. 먼저 1단계 'Steam 제목 조회'를 누르면 실제 제목으로 저장됩니다.)`
                      )}
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="action text-xs"
                        disabled={busy}
                        onClick={() => { void registerSelectedNewMods(); }}
                      >
                        최종 승인 및 등록
                      </button>
                      <button
                        type="button"
                        className="secondary-action text-xs"
                        disabled={busy}
                        onClick={() => setConfirmRegister(false)}
                      >
                        취소
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {plan.updates.length === 0 && plan.unregistered.length === 0 && (
              <p className="muted text-xs">스캔된 모든 워크숍과 Mod ID가 이미 카탈로그에 등록되어 있습니다.</p>
            )}
          </div>
        )}
      </div>
    </details>
  );
}
