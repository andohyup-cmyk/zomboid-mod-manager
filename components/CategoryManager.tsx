"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type ManagedCategory = { id: string; name: string };

export function CategoryManager({
  initialCategories,
  writeEnabled
}: {
  initialCategories: ManagedCategory[];
  writeEnabled: boolean;
}) {
  const router = useRouter();
  const [override, setOverride] = useState<{ base: ManagedCategory[]; items: ManagedCategory[] } | null>(null);
  const items = override?.base === initialCategories ? override.items : initialCategories;
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function refreshFromApi() {
    const res = await fetch("/api/categories", { credentials: "same-origin", cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as { categories?: ManagedCategory[] };
      if (Array.isArray(data.categories)) {
        setOverride({ base: initialCategories, items: data.categories });
      }
    }
    router.refresh();
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = newName.trim();
    if (!writeEnabled || busy || !trimmed) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const res = await fetch("/api/categories", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed })
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? `등록 실패 (HTTP ${res.status})`);
      setNewName("");
      setNotice(`"${trimmed}" 카테고리를 추가했습니다.`);
      await refreshFromApi();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "카테고리를 등록하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRename(id: string) {
    const trimmed = editingName.trim();
    if (!writeEnabled || busy || !trimmed) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const res = await fetch("/api/categories", {
        method: "PATCH", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, name: trimmed })
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? `수정 실패 (HTTP ${res.status})`);
      setEditingId(null); setEditingName("");
      setNotice(`카테고리 이름을 "${trimmed}"(으)로 변경했습니다.`);
      await refreshFromApi();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "카테고리를 수정하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!writeEnabled || busy) return;
    setBusy(true); setError(""); setNotice(""); setConfirmDeleteId(null);
    try {
      const res = await fetch("/api/categories", {
        method: "DELETE", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? `삭제 실패 (HTTP ${res.status})`);
      setNotice(`"${name}" 카테고리를 삭제했습니다.`);
      await refreshFromApi();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "카테고리를 삭제하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="panel group p-4">
      <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold">
        <span>카테고리 관리 ({items.length})</span>
        <span className="muted text-xs group-open:hidden">펼치기</span>
        <span className="muted hidden text-xs group-open:inline">접기</span>
      </summary>
      <div className="mt-3 space-y-3">
        {!writeEnabled && (
          <p className="rounded-lg border border-[#5b704d] bg-[#1a2922] p-3 text-xs" role="status">
            현재 환경은 읽기 전용입니다. 카테고리 추가·수정·삭제는 시험 쓰기 승인 후 가능합니다.
          </p>
        )}
        <form onSubmit={(event) => void handleCreate(event)} className="flex gap-2">
          <label htmlFor="new-category-name" className="sr-only">새 카테고리 이름</label>
          <input
            id="new-category-name"
            className="field min-w-0 flex-1 text-sm"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="새 카테고리 이름 (예: 의상, UI)"
            maxLength={120}
            disabled={!writeEnabled || busy}
          />
          <button
            type="submit"
            className="action shrink-0 text-sm"
            disabled={!writeEnabled || busy || !newName.trim()}
          >
            추가
          </button>
        </form>
        {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
        {notice && <p role="status" className="text-xs text-[#b9efb0]">{notice}</p>}
        {items.length === 0 ? (
          <p className="muted text-xs">등록된 카테고리가 없습니다.</p>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => {
              const isEditing = editingId === item.id;
              const isConfirming = confirmDeleteId === item.id;
              return (
                <li key={item.id} className="space-y-2 rounded-xl border border-[#304154] bg-[#10202d] p-3">
                  {isEditing ? (
                    <div className="flex flex-wrap gap-2">
                      <input
                        className="field min-w-0 flex-1 text-sm"
                        value={editingName}
                        onChange={(event) => setEditingName(event.target.value)}
                        maxLength={120}
                        aria-label="카테고리 이름 수정"
                        disabled={busy}
                      />
                      <button type="button" className="action text-xs" disabled={busy || !editingName.trim()}
                        onClick={() => void handleRename(item.id)}>저장</button>
                      <button type="button" className="secondary-action text-xs" disabled={busy}
                        onClick={() => { setEditingId(null); setEditingName(""); }}>취소</button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 break-words text-sm font-semibold">{item.name}</span>
                      <div className="flex shrink-0 gap-1.5">
                        <button type="button" className="secondary-action px-2.5 py-1.5 text-xs"
                          disabled={!writeEnabled || busy}
                          onClick={() => { setEditingId(item.id); setEditingName(item.name); setConfirmDeleteId(null); }}>
                          수정
                        </button>
                        <button type="button" className="secondary-action px-2.5 py-1.5 text-xs text-red-300"
                          disabled={!writeEnabled || busy}
                          onClick={() => { setConfirmDeleteId(item.id); setEditingId(null); }}>
                          삭제
                        </button>
                      </div>
                    </div>
                  )}
                  {isConfirming && (
                    <div className="space-y-2 rounded-lg border border-[#84414a] bg-[#2c191f] p-2.5 text-xs">
                      <p>&ldquo;{item.name}&rdquo; 카테고리를 삭제할까요? 연결된 모드는 자동으로 해제됩니다.</p>
                      <div className="flex gap-2">
                        <button type="button" className="action bg-red-400 text-xs text-[#19090b]" disabled={busy}
                          onClick={() => void handleDelete(item.id, item.name)}>삭제 확인</button>
                        <button type="button" className="secondary-action text-xs" disabled={busy}
                          onClick={() => setConfirmDeleteId(null)}>취소</button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </details>
  );
}
