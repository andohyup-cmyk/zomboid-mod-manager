"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ModRefreshButton({ writeEnabled }: { writeEnabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  async function handleRefresh() {
    if (!writeEnabled || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/mods/refresh-updates", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store"
      });
      const body = (await response.json().catch(() => ({}))) as {
        total?: number;
        updated?: number;
        unchanged?: number;
        failed?: number;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(body.error || "업데이트 날짜 갱신에 실패했습니다.");
      }
      const updated = body.updated ?? 0;
      const unchanged = body.unchanged ?? 0;
      const failed = body.failed ?? 0;
      setMessage({
        text: `업데이트 갱신 완료: 변경 ${updated}개 · 유지 ${unchanged}개` + (failed > 0 ? ` · 실패 ${failed}개` : "")
      });
      router.refresh();
    } catch (caught) {
      setMessage({
        text: caught instanceof Error ? caught.message : "업데이트 날짜 갱신에 실패했습니다.",
        error: true
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={!writeEnabled || busy}
        onClick={() => { void handleRefresh(); }}
        className="action shrink-0 text-sm"
      >
        {busy ? "갱신 중..." : "갱신"}
      </button>
      {message && (
        <p
          role={message.error ? "alert" : "status"}
          className={`text-right text-[11px] ${message.error ? "text-red-300" : "text-[#b9efb0]"}`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
