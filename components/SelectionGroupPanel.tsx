"use client";

import { useEffect, useState } from "react";
import type { ProfileModSelection } from "@/lib/profile-mod-id-state";
import { describeGroupStatus, MAX_GROUP_MEMBERS, type StoredSelectionGroup } from "@/lib/selection-group-input";

type RuleChoice = "free" | "max1" | "min1" | "exact1";
const ruleLabels: Record<RuleChoice, string> = {
  free: "자유 선택 (기본, 0~N개)",
  max1: "최대 1개 (배타)",
  min1: "최소 1개 (필수)",
  exact1: "정확히 1개"
};
function ruleValues(choice: RuleChoice): { minSelected: number | null; maxSelected: number | null } {
  if (choice === "max1") return { minSelected: null, maxSelected: 1 };
  if (choice === "min1") return { minSelected: 1, maxSelected: null };
  if (choice === "exact1") return { minSelected: 1, maxSelected: 1 };
  return { minSelected: null, maxSelected: null };
}

async function fetchGroups(): Promise<StoredSelectionGroup[] | null> {
  try {
    const res = await fetch("/api/selection-groups", { credentials: "same-origin", cache: "no-store" });
    const data = (await res.json().catch(() => ({}))) as { groups?: StoredSelectionGroup[] };
    return res.ok && Array.isArray(data.groups) ? data.groups : null;
  } catch { return null; }
}

export function SelectionGroupPanel({ selections, writeEnabled, onGroupsChange }: {
  selections: readonly ProfileModSelection[];
  writeEnabled: boolean;
  onGroupsChange: (groups: readonly StoredSelectionGroup[]) => void;
}) {
  const [groups, setGroups] = useState<StoredSelectionGroup[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [rule, setRule] = useState<RuleChoice>("free");
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    let alive = true;
    fetchGroups().then((loaded) => {
      if (!alive) return;
      if (loaded) { setGroups(loaded); onGroupsChange(loaded); setStatus("ready"); } else setStatus("error");
    });
    return () => { alive = false; };
  }, [reloadKey, onGroupsChange]);
  const load = () => setReloadKey((key) => key + 1);

  const candidates = selections.filter((s) => typeof s.modIdUuid === "string");
  const ruleOk = (() => {
    const { minSelected, maxSelected } = ruleValues(rule);
    return (minSelected ?? 0) <= picked.size && (maxSelected ?? 0) <= picked.size;
  })();

  async function send(method: "POST" | "DELETE", body: unknown, done: string) {
    setBusy(true); setMessage(null);
    try {
      const res = await fetch("/api/selection-groups", {
        method, credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? `요청 실패 (HTTP ${res.status})`);
      setMessage({ text: done });
      load();
      return true;
    } catch (caught) {
      setMessage({ text: caught instanceof Error ? caught.message : "요청에 실패했습니다.", error: true });
      return false;
    } finally { setBusy(false); }
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = label.trim();
    if (!writeEnabled || busy || !trimmed || picked.size === 0 || !ruleOk) return;
    const ok = await send("POST", { id: null, label: trimmed, ...ruleValues(rule), modIdRefs: [...picked] }, `"${trimmed}" 선택 그룹을 저장했습니다.`);
    if (ok) { setLabel(""); setRule("free"); setPicked(new Set()); }
  }

  return (
    <section aria-label="선택 그룹" className="panel mt-4 space-y-3 p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold">선택 그룹 <span className="muted font-normal">{status === "ready" ? `${groups.length}개` : ""}</span></h2>
        {writeEnabled && (
          <button type="button" className="secondary-action min-h-11 text-sm" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            {open ? "닫기" : "새 그룹"}
          </button>
        )}
      </div>
      <p className="muted text-xs leading-5">
        기본은 자유 선택입니다. 그룹 규칙은 안내용이며 모드를 자동으로 켜거나 끄지 않습니다. 근거가 확인되지 않은 규칙은 복사를 막지 않습니다.
      </p>
      {status === "loading" && <p className="muted">불러오는 중…</p>}
      {status === "error" && (
        <p role="alert" className="text-[#ffd2d5]">선택 그룹을 불러오지 못했습니다.{" "}
          <button type="button" className="underline" onClick={() => { setStatus("loading"); load(); }}>다시 시도</button>
        </p>
      )}
      {message && <p role={message.error ? "alert" : "status"} className={message.error ? "text-[#ffd2d5]" : "text-[#b9e6ae]"}>{message.text}</p>}

      {open && writeEnabled && (
        <form onSubmit={create} className="space-y-3 rounded-lg border border-[#304154] p-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold">그룹 이름</span>
            <input value={label} maxLength={120} onChange={(e) => setLabel(e.target.value)}
              className="min-h-11 w-full rounded-lg border border-[#304154] bg-[#101a26] px-3" placeholder="예: 체형 모드" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold">규칙</span>
            <select value={rule} onChange={(e) => setRule(e.target.value as RuleChoice)}
              className="min-h-11 w-full rounded-lg border border-[#304154] bg-[#101a26] px-3">
              {(Object.keys(ruleLabels) as RuleChoice[]).map((key) => <option key={key} value={key}>{ruleLabels[key]}</option>)}
            </select>
          </label>
          <fieldset>
            <legend className="mb-1 text-xs font-semibold">구성원 (선택한 모드 중, 최대 {MAX_GROUP_MEMBERS}개) · {picked.size}개</legend>
            {candidates.length === 0 ? <p className="muted text-xs">저장 가능한 선택 모드가 없습니다. 모드 추가 탭에서 먼저 선택하세요.</p> : (
              <div className="grid max-h-64 gap-1.5 overflow-y-auto sm:grid-cols-2">
                {candidates.map((s) => {
                  const ref = s.modIdUuid as string;
                  return (
                    <label key={ref} className="flex min-h-11 items-center gap-2 rounded-lg border border-[#304154] bg-[#101a26] px-2.5">
                      <input type="checkbox" className="h-5 w-5 accent-[#8fcb85]" checked={picked.has(ref)}
                        disabled={!picked.has(ref) && picked.size >= MAX_GROUP_MEMBERS}
                        onChange={() => setPicked((prev) => {
                          const next = new Set(prev);
                          if (next.has(ref)) next.delete(ref); else next.add(ref);
                          return next;
                        })} />
                      <span className="min-w-0 flex-1 font-mono text-xs [overflow-wrap:anywhere]">{s.modId}</span>
                      <span className="muted shrink-0 text-[11px]">{s.workshopId}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </fieldset>
          {!ruleOk && picked.size > 0 && <p className="text-xs text-[#f2d6a0]">규칙에 필요한 구성원 수보다 적습니다.</p>}
          <button type="submit" className="action min-h-11 w-full sm:w-auto" disabled={busy || !label.trim() || picked.size === 0 || !ruleOk}>
            그룹 저장
          </button>
        </form>
      )}

      {status === "ready" && groups.length === 0 && <p className="muted">저장된 선택 그룹이 없습니다.</p>}
      {groups.length > 0 && (
        <ul className="space-y-2">
          {groups.map((group) => {
            const info = describeGroupStatus(group, selections);
            const tone = info.tone === "warn" ? "text-[#f2d6a0]" : info.tone === "ok" ? "text-[#b9e6ae]" : "text-[#d0e0ef]";
            return (
              <li key={group.id} className="rounded-lg border border-[#304154] p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold [overflow-wrap:anywhere]">{group.label}</p>
                    <p className={`text-xs ${tone}`}>{info.text}</p>
                  </div>
                  {writeEnabled && (confirmDelete === group.id ? (
                    <div className="flex gap-1.5">
                      <button type="button" className="secondary-action min-h-11 text-xs" disabled={busy}
                        onClick={() => { setConfirmDelete(null); void send("DELETE", { id: group.id }, `"${group.label}" 그룹을 삭제했습니다.`); }}>삭제 확인</button>
                      <button type="button" className="secondary-action min-h-11 text-xs" onClick={() => setConfirmDelete(null)}>취소</button>
                    </div>
                  ) : (
                    <button type="button" className="secondary-action min-h-11 text-xs" aria-label={`${group.label} 그룹 삭제`}
                      onClick={() => setConfirmDelete(group.id)}>삭제</button>
                  ))}
                </div>
                <p className="muted mt-1 text-xs [overflow-wrap:anywhere]">{group.members.map((m) => m.modId).join(", ")}</p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
