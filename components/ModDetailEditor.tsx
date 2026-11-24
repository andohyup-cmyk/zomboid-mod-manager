"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  COMPATIBILITY_STATUSES,
  parseModIdText,
  type CompatibilityStatus
} from "@/lib/mod-detail-edit";
import { statusLabel, statusStyle } from "@/lib/status-display";

type ModIdRow = { id: string; value: string };

type Props = {
  modId: string;
  initialModIds: readonly ModIdRow[];
  idsError: boolean;
  initialVerificationStatus: string;
  initialBuildCompatibility: string;
  initialMultiplayerCompatibility: string;
  initialResearchedAt: string | null;
  initialDescription: string;
  writeEnabled: boolean;
};

function toStatus(value: string): CompatibilityStatus {
  return value === "confirmed" || value === "reported_issue" ? value : "unverified";
}

function StatusPicker({
  label,
  value,
  onChange
}: {
  label: string;
  value: CompatibilityStatus;
  onChange: (next: CompatibilityStatus) => void;
}) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-xs font-semibold text-[#c9d8e5]">{label}</legend>
      <div className="grid grid-cols-3 gap-1.5">
        {COMPATIBILITY_STATUSES.map((option) => {
          const active = value === option;
          return (
            <button
              key={option}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(option)}
              className={
                "min-h-10 rounded-xl border px-2 py-1.5 text-xs font-semibold transition-colors " +
                (active
                  ? "border-[#8fcb85] bg-[#294535] text-[#b9efb0]"
                  : "border-[#304154] bg-[#10202d] text-[#9baebe]")
              }
            >
              {statusLabel(option)}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function ModDetailEditor({
  modId,
  initialModIds,
  idsError,
  initialVerificationStatus,
  initialBuildCompatibility,
  initialMultiplayerCompatibility,
  initialResearchedAt,
  initialDescription,
  writeEnabled
}: Props) {
  const router = useRouter();
  const [modIds, setModIds] = useState<ModIdRow[]>([...initialModIds]);
  const [newModIdText, setNewModIdText] = useState("");
  const [addingId, setAddingId] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [modIdMessage, setModIdMessage] = useState<string | null>(null);
  const [modIdError, setModIdError] = useState<string | null>(null);

  const [editingStatus, setEditingStatus] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<CompatibilityStatus>(toStatus(initialVerificationStatus));
  const [buildCompatibility, setBuildCompatibility] = useState<CompatibilityStatus>(toStatus(initialBuildCompatibility));
  const [multiplayerCompatibility, setMultiplayerCompatibility] = useState<CompatibilityStatus>(toStatus(initialMultiplayerCompatibility));
  const [researchedAt, setResearchedAt] = useState(initialResearchedAt ?? "");
  const [description, setDescription] = useState(initialDescription);
  const [savingStatus, setSavingStatus] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  async function handleAddModIds(event: FormEvent) {
    event.preventDefault();
    if (!writeEnabled || addingId) return;
    setModIdError(null);
    setModIdMessage(null);
    const parsed = parseModIdText(newModIdText);
    if (parsed.invalid.length > 0) {
      setModIdError(`형식이 올바르지 않은 Mod ID: ${parsed.invalid.join(", ")}`);
      return;
    }
    if (parsed.valid.length === 0) {
      setModIdError("추가할 Mod ID를 입력해 주세요.");
      return;
    }
    setAddingId(true);
    try {
      const response = await fetch("/api/mod-ids", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modId, values: parsed.valid })
      });
      const body = (await response.json().catch(() => ({}))) as {
        added?: { id: string; value: string }[];
        addedCount?: number;
        skippedCount?: number;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(body.error || "Mod ID 추가에 실패했습니다.");
      }
      if (body.added?.length) {
        setModIds(current =>
          [...current, ...body.added!].sort((a, b) => a.value.localeCompare(b.value))
        );
      }
      setNewModIdText("");
      setModIdMessage(
        body.addedCount
          ? `Mod ID ${body.addedCount}개를 추가했습니다.` +
            (body.skippedCount ? ` (중복 ${body.skippedCount}개 제외)` : "")
          : "이미 모두 등록된 Mod ID입니다."
      );
      router.refresh();
    } catch (err) {
      setModIdError(err instanceof Error ? err.message : "Mod ID 추가에 실패했습니다.");
    } finally {
      setAddingId(false);
    }
  }

  async function handleDeleteModId(entryId: string) {
    if (!writeEnabled || deletingId) return;
    setDeletingId(entryId);
    setModIdError(null);
    setModIdMessage(null);
    try {
      const response = await fetch("/api/mod-ids", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modId, modIdEntryId: entryId })
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(body.error || "Mod ID 삭제에 실패했습니다.");
      }
      setModIds(current => current.filter(item => item.id !== entryId));
      setConfirmDeleteId(null);
      setModIdMessage("Mod ID를 삭제했습니다.");
      router.refresh();
    } catch (err) {
      setModIdError(err instanceof Error ? err.message : "Mod ID 삭제에 실패했습니다.");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleSaveStatus(event: FormEvent) {
    event.preventDefault();
    if (!writeEnabled || savingStatus) return;
    setSavingStatus(true);
    setStatusError(null);
    setStatusMessage(null);
    try {
      const response = await fetch(`/api/mods/${modId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          verificationStatus,
          buildCompatibility,
          multiplayerCompatibility,
          researchedAt: researchedAt || null,
          description
        })
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(body.error || "상태 저장에 실패했습니다.");
      }
      setStatusMessage("호환성·메모를 저장했습니다.");
      setEditingStatus(false);
      router.refresh();
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : "상태 저장에 실패했습니다.");
    } finally {
      setSavingStatus(false);
    }
  }

  return (
    <div className="panel space-y-4 p-5">
      <div className="space-y-3">
        <h2 className="text-lg font-bold">실제 Mod ID</h2>
        {idsError && <p role="alert" className="text-sm text-red-300">Mod ID를 읽지 못했습니다.</p>}
        {modIds.length > 0 ? (
          <ul className="space-y-2 text-sm">
            {modIds.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-2 rounded-lg bg-[#152333] p-2.5"
              >
                <span className="min-w-0 break-all font-mono">{item.value}</span>
                {writeEnabled && (
                  confirmDeleteId === item.id ? (
                    <div className="flex shrink-0 gap-1.5">
                      <button
                        type="button"
                        disabled={deletingId === item.id}
                        onClick={() => { void handleDeleteModId(item.id); }}
                        className="rounded-lg bg-[#5b2a2f] px-2.5 py-1 text-xs font-semibold text-[#ffd2d5]"
                      >
                        {deletingId === item.id ? "삭제 중" : "삭제 확인"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="rounded-lg border border-[#304154] px-2.5 py-1 text-xs text-[#9baebe]"
                      >
                        취소
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(item.id)}
                      className="shrink-0 rounded-lg border border-[#304154] px-2.5 py-1 text-xs text-[#9baebe]"
                    >
                      삭제
                    </button>
                  )
                )}
              </li>
            ))}
          </ul>
        ) : (
          !idsError && <p className="muted text-sm">실제 Mod ID 미확인. Workshop ID로 대체하지 않습니다.</p>
        )}

        {writeEnabled && (
          <form onSubmit={(event) => { void handleAddModIds(event); }} className="flex gap-2">
            <label className="sr-only" htmlFor="add-mod-id">Mod ID 추가</label>
            <input
              id="add-mod-id"
              type="text"
              value={newModIdText}
              onChange={(event) => setNewModIdText(event.target.value)}
              placeholder="Mod ID 직접 입력 (쉼표로 여러 개 가능)"
              className="field min-w-0 flex-1 text-sm"
            />
            <button type="submit" disabled={addingId} className="action shrink-0 text-xs">
              {addingId ? "추가 중" : "추가"}
            </button>
          </form>
        )}
        {modIdMessage && <p role="status" className="text-xs text-[#b9efb0]">{modIdMessage}</p>}
        {modIdError && <p role="alert" className="text-xs text-red-300">{modIdError}</p>}
      </div>

      <div className="space-y-3 border-t border-[#304154] pt-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5 text-xs">
            <span className={"rounded-md px-2 py-1 " + statusStyle(verificationStatus)}>
              조사 {statusLabel(verificationStatus)}
            </span>
            <span className={"rounded-md px-2 py-1 " + statusStyle(buildCompatibility)}>
              B42.22 {statusLabel(buildCompatibility)}
            </span>
            <span className={"rounded-md px-2 py-1 " + statusStyle(multiplayerCompatibility)}>
              멀티 {statusLabel(multiplayerCompatibility)}
            </span>
          </div>
          {writeEnabled && (
            <button
              type="button"
              onClick={() => {
                setEditingStatus(open => !open);
                setStatusError(null);
              }}
              className="secondary-action shrink-0 px-3 py-1.5 text-xs"
            >
              {editingStatus ? "닫기" : "상태·메모 편집"}
            </button>
          )}
        </div>
        <p className="muted text-xs">확인일: {researchedAt || "미확인"}</p>
        {statusMessage && <p role="status" className="text-xs text-[#b9efb0]">{statusMessage}</p>}
        {statusError && <p role="alert" className="text-xs text-red-300">{statusError}</p>}

        {editingStatus && writeEnabled && (
          <form
            onSubmit={(event) => { void handleSaveStatus(event); }}
            className="space-y-3 rounded-xl border border-[#304154] bg-[#101824] p-3.5"
          >
            <StatusPicker label="조사 상태" value={verificationStatus} onChange={setVerificationStatus} />
            <StatusPicker label="B42.22 호환성" value={buildCompatibility} onChange={setBuildCompatibility} />
            <StatusPicker label="멀티 호환성" value={multiplayerCompatibility} onChange={setMultiplayerCompatibility} />
            <div className="space-y-1.5">
              <label htmlFor="researched-at" className="block text-xs font-semibold text-[#c9d8e5]">확인일</label>
              <div className="flex gap-2">
                <input
                  id="researched-at"
                  type="date"
                  value={researchedAt}
                  onChange={(event) => setResearchedAt(event.target.value)}
                  className="field min-w-0 flex-1 text-sm"
                />
                <button
                  type="button"
                  onClick={() => setResearchedAt(new Date().toISOString().slice(0, 10))}
                  className="secondary-action shrink-0 px-3 text-xs"
                >
                  오늘
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="mod-description" className="block text-xs font-semibold text-[#c9d8e5]">메모 / 설명</label>
              <textarea
                id="mod-description"
                rows={4}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="field w-full resize-y text-sm"
                placeholder="호환성 확인 근거나 개인 메모를 남길 수 있습니다."
              />
            </div>
            <button type="submit" disabled={savingStatus} className="action w-full text-xs">
              {savingStatus ? "저장 중..." : "상태·메모 저장"}
            </button>
          </form>
        )}

        <p className="muted text-xs">
          싱글플레이 및 서버 중간 추가는 별도 상태로 보관되며, 아래 조사 기록의 근거를 확인해야 합니다.
        </p>
      </div>
    </div>
  );
}
