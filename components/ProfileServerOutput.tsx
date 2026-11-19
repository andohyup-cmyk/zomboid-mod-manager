"use client";

import { useMemo, useRef, useState } from "react";
import type { ProfileModSelection } from "@/lib/profile-mod-id-state";
import type { ProfileOrderPreviewOptions } from "@/lib/profile-order-preview";
import { buildProfileServerConfig } from "@/lib/profile-server-output";
import type { ServerConfigInput } from "@/lib/server-config";

type Props = {
  selections: readonly ProfileModSelection[];
  catalog: ServerConfigInput["catalog"];
  downloadOnlyWorkshopIds: readonly string[];
  recommendationOptions: ProfileOrderPreviewOptions;
  relationships?: ServerConfigInput["relationships"];
};

const issueGroups = [
  { severity: "error", label: "복사 차단" },
  { severity: "warning", label: "확인할 경고" },
  { severity: "info", label: "미확인 정보 및 참고 사항" }
] as const;

export function ProfileServerOutput({ selections, catalog, downloadOnlyWorkshopIds, recommendationOptions, relationships }: Props) {
  const [modIdPrefix, setModIdPrefix] = useState<"" | "\\">("\\");
  const snapshot = useMemo(() => ({
    selections, input: { catalog, downloadOnlyWorkshopIds, relationships }, recommendationOptions, modIdPrefix
  }), [selections, catalog, downloadOnlyWorkshopIds, recommendationOptions, relationships, modIdPrefix]);
  const [acknowledged, setAcknowledged] = useState<typeof snapshot | null>(null);
  const warningsAcknowledged = snapshot === acknowledged;
  const result = useMemo(() => buildProfileServerConfig(
    snapshot.selections, snapshot.input, snapshot.recommendationOptions, { modIdPrefix: snapshot.modIdPrefix, warningsAcknowledged }
  ), [snapshot, warningsAcknowledged]);
  const [feedback, setFeedback] = useState<{ result: typeof result; message: string } | null>(null);
  const copyAttempt = useRef(0);

  async function copySettings() {
    if (result.copyText === null) return;
    const attempt = ++copyAttempt.current;
    try {
      await navigator.clipboard.writeText(result.copyText);
      if (copyAttempt.current === attempt) setFeedback({ result, message: "설정을 복사했습니다." });
    } catch {
      if (copyAttempt.current === attempt) setFeedback({ result, message: "브라우저의 클립보드 권한을 확인하세요." });
    }
  }

  return (
    <section aria-label="서버 설정 출력" className="panel mt-5 min-w-0 space-y-3 p-4">
      <h2 className="text-lg font-bold">서버 설정 출력</h2>
      <p className="muted text-sm">현재 활성 순서와 다운로드 전용 선택을 사용합니다. B42.22 실제 서버의 접두사와 로딩 결과는 미확인입니다.</p>
      <label className="block text-sm">Mod ID 출력 접두사
        <select className="field mt-1" value={modIdPrefix}
          onChange={event => setModIdPrefix(event.target.value === "\\" ? "\\" : "")}>
          <option value={"\\"}>역슬래시 (\)</option>
          <option value="">없음</option>
        </select>
      </label>
      {result.preview && (
        <pre aria-label="설정 문자열 미리보기" className="overflow-x-auto rounded-lg bg-[#0e1722] p-3 text-sm">
          {`${result.preview.mods}\n${result.preview.workshopItems}`}
        </pre>
      )}
      {issueGroups.map(({ severity, label }) => {
        const issues = result.issues.filter((issue) => issue.severity === severity);
        return issues.length > 0 && (
          <section key={severity} aria-label={label} className="rounded-lg border border-[#304154] p-3 text-sm">
            <h3 className="font-semibold">{label}</h3>
            <ul className="mt-1 list-disc space-y-1 pl-5">{issues.map(({ code, message }, index) => (
              <li key={`${code}-${index}`}>{message}</li>
            ))}</ul>
          </section>
        );
      })}
      {result.issues.some((issue) => issue.severity === "warning") && (
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input type="checkbox" checked={warningsAcknowledged} disabled={result.copyStatus === "blocked"}
            onChange={(event) => setAcknowledged(event.target.checked ? snapshot : null)} />
          경고를 확인했습니다
        </label>
      )}
      <button type="button" className="action min-h-11 w-full sm:w-auto" disabled={result.copyText === null} onClick={copySettings}>
        설정 복사
      </button>
      <p role="status" className="muted text-sm">{feedback?.result === result ? feedback.message : ""}</p>
    </section>
  );
}
