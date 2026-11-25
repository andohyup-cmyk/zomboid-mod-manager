"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { parseModIdText } from "@/lib/mod-detail-edit";

type ModIdRow = { id: string; value: string };

type Props = {
  modId: string;
  modTitle: string;
  initialModIds: readonly ModIdRow[];
  idsError: boolean;
  initialIsArchived: boolean;
  writeEnabled: boolean;
};

export function ModDetailEditor({
  modId,
  modTitle,
  initialModIds,
  idsError,
  initialIsArchived,
  writeEnabled
}: Props) {
  const router = useRouter();
  const [modIdsOverride, setModIdsOverride] = useState<{ base: readonly ModIdRow[]; value: ModIdRow[] } | null>(null);
  const modIds = modIdsOverride?.base === initialModIds ? modIdsOverride.value : initialModIds;
  const [newModIdText, setNewModIdText] = useState("");
  const [addingId, setAddingId] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [modIdMessage, setModIdMessage] = useState<string | null>(null);
  const [modIdError, setModIdError] = useState<string | null>(null);

  const [archiveOverride, setArchiveOverride] = useState<{ base: boolean; value: boolean } | null>(null);
  const isArchived = archiveOverride?.base === initialIsArchived ? archiveOverride.value : initialIsArchived;
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [togglingArchive, setTogglingArchive] = useState(false);
  const [archiveMessage, setArchiveMessage] = useState<string | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  const [confirmDeleteMod, setConfirmDeleteMod] = useState(false);
  const [deletingMod, setDeletingMod] = useState(false);
  const [deleteModError, setDeleteModError] = useState<string | null>(null);

  async function handleToggleArchive() {
    if (!writeEnabled || togglingArchive) return;
    setTogglingArchive(true);
    setArchiveError(null);
    setArchiveMessage(null);
    const nextArchived = !isArchived;
    try {
      const response = await fetch(`/api/mods/${modId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isArchived: nextArchived })
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(body.error || "보관 상태 변경에 실패했습니다.");
      }
      setArchiveOverride({ base: initialIsArchived, value: nextArchived });
      setConfirmArchive(false);
      setArchiveMessage(nextArchived ? "모드를 보관함으로 옮겼습니다." : "모드를 사용 중 목록으로 복원했습니다.");
      router.refresh();
    } catch (err) {
      setArchiveError(err instanceof Error ? err.message : "보관 상태 변경에 실패했습니다.");
    } finally {
      setTogglingArchive(false);
    }
  }

  async function handleDeleteMod() {
    if (!writeEnabled || deletingMod) return;
    setDeletingMod(true);
    setDeleteModError(null);
    try {
      const response = await fetch(`/api/mods/${modId}`, {
        method: "DELETE",
        credentials: "same-origin",
        cache: "no-store"
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(body.error || "모드 삭제에 실패했습니다.");
      }
      router.push("/mods");
      router.refresh();
    } catch (err) {
      setDeleteModError(err instanceof Error ? err.message : "모드 삭제에 실패했습니다.");
      setConfirmDeleteMod(false);
    } finally {
      setDeletingMod(false);
    }
  }

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
        setModIdsOverride({
          base: initialModIds,
          value: [...modIds, ...body.added].sort((a, b) => a.value.localeCompare(b.value))
        });
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
      setModIdsOverride({
        base: initialModIds,
        value: modIds.filter(item => item.id !== entryId)
      });
      setConfirmDeleteId(null);
      setModIdMessage("Mod ID를 삭제했습니다.");
      router.refresh();
    } catch (err) {
      setModIdError(err instanceof Error ? err.message : "Mod ID 삭제에 실패했습니다.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="panel space-y-4 p-5">
      <div className="space-y-3">
        <h2 className="text-base font-bold">실제 Mod ID</h2>
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

      {writeEnabled && (
        <div className="space-y-3 border-t border-[#304154] pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="muted text-xs">
              {isArchived ? "현재 보관된 모드입니다." : "사용하지 않는 모드는 보관하거나 삭제할 수 있습니다."}
            </span>
            <div className="flex flex-wrap gap-2">
              {confirmArchive ? (
                <>
                  <button
                    type="button"
                    disabled={togglingArchive}
                    onClick={() => { void handleToggleArchive(); }}
                    className="rounded-lg bg-[#294535] px-3 py-1.5 text-xs font-semibold text-[#b9efb0]"
                  >
                    {togglingArchive ? "처리 중..." : isArchived ? "복원 확인" : "보관 확인"}
                  </button>
                  <button
                    type="button"
                    disabled={togglingArchive}
                    onClick={() => setConfirmArchive(false)}
                    className="secondary-action px-3 py-1.5 text-xs"
                  >
                    취소
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  disabled={deletingMod}
                  onClick={() => { setConfirmArchive(true); setConfirmDeleteMod(false); setArchiveError(null); }}
                  className="secondary-action px-3 py-1.5 text-xs"
                >
                  {isArchived ? "사용 중으로 복원" : "모드 보관"}
                </button>
              )}

              {confirmDeleteMod ? (
                <>
                  <button
                    type="button"
                    disabled={deletingMod}
                    onClick={() => { void handleDeleteMod(); }}
                    className="rounded-lg bg-[#5b2a2f] px-3 py-1.5 text-xs font-semibold text-[#ffd2d5]"
                  >
                    {deletingMod ? "삭제 중..." : "영구 삭제 확인"}
                  </button>
                  <button
                    type="button"
                    disabled={deletingMod}
                    onClick={() => setConfirmDeleteMod(false)}
                    className="secondary-action px-3 py-1.5 text-xs"
                  >
                    취소
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  disabled={togglingArchive}
                  onClick={() => { setConfirmDeleteMod(true); setConfirmArchive(false); setDeleteModError(null); }}
                  className="secondary-action px-3 py-1.5 text-xs text-red-300"
                >
                  모드 삭제
                </button>
              )}
            </div>
          </div>

          {confirmDeleteMod && (
            <p className="rounded-lg border border-[#84414a] bg-[#2c191f] p-2.5 text-xs text-[#ffd2d5]">
              &ldquo;{modTitle}&rdquo; 모드를 카탈로그에서 영구 삭제할까요? 서버 프로필에 포함된 모드는 삭제가 차단됩니다.
            </p>
          )}
          {archiveMessage && <p role="status" className="text-xs text-[#b9efb0]">{archiveMessage}</p>}
          {archiveError && <p role="alert" className="text-xs text-red-300">{archiveError}</p>}
          {deleteModError && <p role="alert" className="text-xs text-red-300">{deleteModError}</p>}
        </div>
      )}
    </div>
  );
}
