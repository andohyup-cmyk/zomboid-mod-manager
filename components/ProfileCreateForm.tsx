"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function ProfileCreateForm({ writeEnabled }: { writeEnabled: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!writeEnabled) return null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("프로필 이름을 입력해 주세요.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const response = await fetch("/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed })
      });
      const body = (await response.json().catch(() => ({}))) as {
        profile?: { id: string; name: string };
        error?: string;
      };
      if (!response.ok || !body.profile?.id) {
        throw new Error(body.error || "프로필을 만들지 못했습니다.");
      }
      setName("");
      router.push(`/profiles/editor?profileId=${encodeURIComponent(body.profile.id)}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "프로필을 만들지 못했습니다.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <form onSubmit={(event) => { void handleSubmit(event); }} className="panel space-y-2.5 p-4">
      <label htmlFor="new-profile-name" className="block text-sm font-bold">새 서버 프로필 만들기</label>
      <div className="flex gap-2">
        <input
          id="new-profile-name"
          type="text"
          maxLength={120}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="예: B42 멀티 서버, 솔로 테스트"
          className="field min-w-0 flex-1 text-sm"
        />
        <button type="submit" disabled={creating} className="action shrink-0 text-xs">
          {creating ? "생성 중..." : "만들기"}
        </button>
      </div>
      {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
    </form>
  );
}
