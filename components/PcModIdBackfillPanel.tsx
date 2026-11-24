"use client";

import { useRouter } from "next/navigation";
import { useState, type ChangeEvent } from "react";
import { parseLocalWorkshopInventory } from "@/lib/local-workshop-inventory";
import {
  planPcModIdBackfill,
  type PcBackfillCatalogMod,
  type PcBackfillPlan
} from "@/lib/mod-detail-edit";

type Props = {
  catalogMods: readonly PcBackfillCatalogMod[];
  writeEnabled: boolean;
};

export function PcModIdBackfillPanel({ catalogMods, writeEnabled }: Props) {
  const router = useRouter();
  const [fileName, setFileName] = useState<string | null>(null);
  const [plan, setPlan] = useState<PcBackfillPlan | null>(null);
  const [selectedModIds, setSelectedModIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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
      const nextPlan = planPcModIdBackfill(parsed.inventory, catalogMods);
      setFileName(file.name);
      setPlan(nextPlan);
      setSelectedModIds(nextPlan.updates.map(item => item.modId));
    } catch {
      setPlan(null);
      setFileName(null);
      setError("JSON 파일을 읽을 수 없습니다. PC 스캔 파일인지 확인해 주세요.");
    }
  }

  function toggleMod(modId: string) {
    setSelectedModIds(current =>
      current.includes(modId) ? current.filter(id => id !== modId) : [...current, modId]
    );
  }

  async function applySelected() {
    if (!plan || !writeEnabled || saving) return;
    const chosen = plan.updates.filter(item => selectedModIds.includes(item.modId));
    if (chosen.length === 0) return;

    setSaving(true);
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
      if (!response.ok) {
        throw new Error(body.error || "Mod ID 저장에 실패했습니다.");
      }
      const appliedIds = new Set(chosen.map(item => item.modId));
      const remaining = plan.updates.filter(item => !appliedIds.has(item.modId));
      setPlan({
        ...plan,
        updates: remaining,
        alreadyCompleteCount: plan.alreadyCompleteCount + chosen.length
      });
      setSelectedModIds(remaining.map(item => item.modId));
      setStatus(
        `${chosen.length}개 모드에 Mod ID ${body.addedCount ?? 0}개를 채웠습니다.` +
        (body.skippedCount ? ` (이미 등록된 ${body.skippedCount}개 제외)` : "")
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mod ID 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  const chosenUpdates = plan ? plan.updates.filter(item => selectedModIds.includes(item.modId)) : [];
  const chosenModIdTotal = chosenUpdates.reduce((sum, item) => sum + item.newModIds.length, 0);

  return (
    <details className="panel group p-4">
      <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold">
        <span>PC 스캔으로 Mod ID 채우기</span>
        <span className="muted text-xs group-open:hidden">펼치기</span>
        <span className="muted hidden text-xs group-open:inline">접기</span>
      </summary>
      <div className="mt-3 space-y-3">
        <p className="muted text-xs leading-5">
          PC에서 추출한 <code className="font-mono">zomboid-workshop-audit*.json</code>을 선택하면
          이미 등록된 모드의 빈 Mod ID만 찾아 미리 보여줍니다. 미등록 모드는 자동 추가하지 않으며 B42.22·멀티 호환성도 바꾸지 않습니다.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="secondary-action inline-flex min-h-11 cursor-pointer items-center text-xs">
            조사 JSON 파일 선택
            <input
              type="file"
              accept=".json,application/json"
              className="sr-only"
              onChange={(event) => { void onFileSelected(event); }}
            />
          </label>
          {plan && (
            <button
              type="button"
              className="secondary-action min-h-11 text-xs"
              onClick={() => {
                setPlan(null);
                setFileName(null);
                setSelectedModIds([]);
                setError(null);
                setStatus(null);
              }}
            >
              파일 해제
            </button>
          )}
          {fileName && <span className="muted truncate text-xs">{fileName}</span>}
        </div>

        {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
        {status && <p role="status" className="text-xs text-[#b9efb0]">{status}</p>}

        {plan && (
          <div className="space-y-3 rounded-xl border border-[#304154] bg-[#10202d] p-3">
            <p className="text-xs">
              채울 대상 <strong>{plan.updates.length}개 모드</strong> · 이미 완료 {plan.alreadyCompleteCount}개
              {plan.unmatchedScanWorkshops > 0 ? ` · 미등록 워크숍 ${plan.unmatchedScanWorkshops}개(제외)` : ""}
            </p>
            {plan.updates.length === 0 ? (
              <p className="muted text-xs">등록된 모드 중 새로 채울 Mod ID가 없습니다.</p>
            ) : (
              <>
                <ul className="max-h-72 space-y-2 overflow-y-auto">
                  {plan.updates.map((item) => {
                    const checked = selectedModIds.includes(item.modId);
                    return (
                      <li key={item.modId} className="rounded-lg border border-[#304154] bg-[#152333] p-2.5">
                        <label className="flex cursor-pointer items-start gap-2.5">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleMod(item.modId)}
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
                  disabled={!writeEnabled || saving || chosenUpdates.length === 0}
                  onClick={() => { void applySelected(); }}
                >
                  {!writeEnabled
                    ? "이 환경에서는 저장할 수 없습니다"
                    : saving
                      ? "Mod ID 저장 중..."
                      : `선택한 ${chosenUpdates.length}개 모드에 Mod ID ${chosenModIdTotal}개 채우기`}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </details>
  );
}
