"use client";

import { useMemo, useRef, useState, type ChangeEvent } from "react";
import type { ProfileModSelection } from "@/lib/profile-mod-id-state";
import type { ProfileOrderPreviewOptions } from "@/lib/profile-order-preview";
import { buildProfileServerConfig } from "@/lib/profile-server-output";
import type { ServerConfigInput } from "@/lib/server-config";
import { compareLocalInventory, parseLocalWorkshopInventory, type LocalWorkshopInventory } from "@/lib/local-workshop-inventory";

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
  const [localInventory, setLocalInventory] = useState<LocalWorkshopInventory | null>(null);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const localComparison = useMemo(() => localInventory
    ? compareLocalInventory(localInventory, selections)
    : null, [localInventory, selections]);

  async function loadLocalInventory(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 500000) {
      setInventoryError("조사 JSON 파일은 500KB 이하여야 합니다.");
      return;
    }
    try {
      // PowerShell 5.1 UTF8 output may start with a BOM.
      const data = JSON.parse((await file.text()).replace(/^\uFEFF/, "")) as unknown;
      const parsed = parseLocalWorkshopInventory(data);
      if (!parsed.ok) {
        setInventoryError(parsed.error);
        return;
      }
      setLocalInventory(parsed.inventory);
      setInventoryError(null);
    } catch {
      setInventoryError("조사 JSON을 읽거나 검증할 수 없습니다.");
    }
  }

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
      <section aria-label="로컬 mod.info 참고 검사" className="space-y-3 rounded-lg border border-[#304154] p-3">
        <h3 className="font-bold">로컬 mod.info 참고 검사</h3>
        <p className="muted text-xs leading-5">
          PC에서 추출한 zomboid-workshop-audit JSON을 이 기기에서만 읽습니다. 파일을 서버에 전송하거나 카탈로그·DB에 등록하지 않습니다.
          B42 하위 폴더의 require= 정보는 참고용이며 실제 게임 로드 버전·멀티 호환성·선택 그룹 규칙은 확정하지 않습니다.
          아래 검사 결과는 기존 설정 복사 허용 여부를 변경하지 않습니다.
        </p>
        <div className="flex flex-wrap gap-2">
          <label className="secondary-action min-h-11 cursor-pointer text-sm">
            조사 JSON 불러오기
            <input type="file" accept=".json,application/json" className="sr-only"
              onChange={(event) => { void loadLocalInventory(event); }} />
          </label>
          {localInventory && <button type="button" className="secondary-action min-h-11 text-sm" onClick={() => {
            setLocalInventory(null); setInventoryError(null);
          }}>검사 자료 해제</button>}
        </div>
        {inventoryError && <p role="alert" className="text-sm text-[#ffd2d5]">{inventoryError}</p>}
        {localInventory && localComparison && (
          <div className="space-y-2 text-sm">
            <p role="status">
              로컬 기록 {localInventory.mods.length}개 · 활성 Mod ID {localComparison.checked}개 중 일치 {localComparison.matched}개
            </p>
            {localInventory.targetBuild !== "42.22" && (
              <p className="text-[#f2d6a0]">조사 파일 기준 {localInventory.targetBuild}와 앱 기준 B42.22가 다릅니다. 버전 적용을 별도 확인하세요.</p>
            )}
            {localComparison.issues.length === 0 ? (
              <p className="text-[#b9e6ae]">선택한 항목과 로컬 메타데이터 사이에 추가 경고가 없습니다. 실제 게임 호환성까지 검증된 것은 아닙니다.</p>
            ) : (
              <ul aria-label="로컬 조사 결과" className="max-h-64 list-disc space-y-2 overflow-y-auto pl-5">
                {localComparison.issues.map((issue, index) => (
                  <li key={issue.code + "-" + index} className={issue.severity === "warning" ? "text-[#f2d6a0]" : "muted"}>
                    {issue.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
    </section>
  );
}
