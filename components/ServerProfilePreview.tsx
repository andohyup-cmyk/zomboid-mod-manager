"use client";

import { useRef, useState } from "react";
import { editProfile, evaluateProfileEditor, toProfileCatalog, type ProfileEdit, type ProfileEditorState } from "@/lib/profile-draft";

const sampleCatalog = toProfileCatalog([
  {
    id: "sample-core-workshop", workshop_id: "9000000001", title: "샘플 기본 모드 묶음", is_archived: false,
    mod_ids: [{ id: "sample-core", value: "ExampleCore" }, { id: "sample-patch", value: "ExamplePatch" }]
  },
  {
    id: "sample-tools-workshop", workshop_id: "9000000002", title: "샘플 도구 모드", is_archived: false,
    mod_ids: [{ id: "sample-tools", value: "ExampleTools" }]
  }
]);
const sampleDownload = { workshopId: "9000000003", title: "샘플 리소스 묶음" };
const sampleRelationships = [
  { kind: "requires-mod", modId: "ExamplePatch", requiredModId: "ExampleCore", verifiedSource: "가상 검증 사례" },
  { kind: "load-before", beforeModId: "ExampleCore", afterModId: "ExamplePatch", verifiedSource: "가상 검증 사례" },
  { kind: "incompatible-mods", modId: "ExamplePatch", incompatibleModId: "ExampleTools", verifiedSource: "가상 검증 사례" }
] as const;

const issueGroups = [
  { severity: "error", label: "치명적 오류", className: "border-red-900/70 bg-red-950/40 text-red-200" },
  { severity: "warning", label: "일반 경고", className: "border-amber-800/70 bg-amber-950/35 text-amber-200" },
  { severity: "info", label: "미확인 정보", className: "border-[#304154] bg-[#0e1722] text-[#b8cbdd]" }
] as const;

export function ServerProfilePreview() {
  const [editor, setEditor] = useState<ProfileEditorState>({
    draft: { profileId: "sample-profile", revision: 0, selectedModEntryIds: [], downloadOnlyWorkshopIds: [] },
    warningsAcknowledged: false
  });
  const [copyFeedback, setCopyFeedback] = useState<"copied" | "failed" | null>(null);
  const copyAttempt = useRef(0);

  const { draft, warningsAcknowledged } = editor;
  const { selectedMods, output: result } = evaluateProfileEditor(editor, sampleCatalog, {
    modIdPrefix: "\\", relationships: sampleRelationships
  });
  const hasWarnings = result.issues.some(({ severity }) => severity === "warning");

  function updateEditor(edit: ProfileEdit) {
    setEditor((current) => editProfile(current, edit));
    copyAttempt.current += 1;
    setCopyFeedback(null);
  }

  async function copySettings() {
    const text = result.copyText;
    if (text === null) return;
    const attempt = ++copyAttempt.current;
    setCopyFeedback(null);
    try {
      await navigator.clipboard.writeText(text);
      if (copyAttempt.current === attempt) setCopyFeedback("copied");
    } catch {
      if (copyAttempt.current === attempt) setCopyFeedback("failed");
    }
  }

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <div className="grid min-w-0 gap-5">
        <section aria-labelledby="sample-mods" className="panel min-w-0 p-4 sm:p-5">
          <h2 id="sample-mods" className="text-lg font-bold">Mod ID 선택</h2>
          <div className="mt-4 grid gap-4">
            {sampleCatalog.map((item) => (
              <fieldset key={item.id} className="min-w-0">
                <legend className="font-semibold">{item.title}</legend>
                <p className="muted mt-1 text-xs">Workshop ID {item.workshopId}</p>
                <div className="mt-2 grid gap-1">
                  {item.modIds.map(({ id, value }) => (
                    <label key={id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg bg-[#0e1722] px-3 py-2">
                      <input
                        type="checkbox"
                        className="size-5 shrink-0 accent-[#8fcb85]"
                        checked={draft.selectedModEntryIds.includes(id)}
                        onChange={(event) => updateEditor({ type: "select-mod", modEntryId: id, selected: event.currentTarget.checked })}
                      />
                      <span className="break-all font-mono text-sm">{value}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
          <fieldset className="mt-5 min-w-0">
            <legend className="font-semibold">다운로드 전용</legend>
            <label className="mt-2 flex min-h-11 cursor-pointer items-center gap-3 rounded-lg bg-[#0e1722] px-3 py-2">
              <input
                type="checkbox"
                className="size-5 shrink-0 accent-[#8fcb85]"
                checked={draft.downloadOnlyWorkshopIds.includes(sampleDownload.workshopId)}
                onChange={(event) => updateEditor({
                  type: "select-download", workshopId: sampleDownload.workshopId, selected: event.currentTarget.checked
                })}
              />
              <span className="text-sm">
                {sampleDownload.title}
                <span className="muted block text-xs">Workshop ID {sampleDownload.workshopId}</span>
              </span>
            </label>
          </fieldset>
        </section>

        <section aria-labelledby="sample-order" className="panel min-w-0 p-4 sm:p-5">
          <h2 id="sample-order" className="text-lg font-bold">로드 순서</h2>
          {selectedMods.length === 0 ? (
            <p className="muted mt-2 text-sm">선택한 Mod ID가 없습니다.</p>
          ) : (
            <ol aria-label="현재 로드 순서" className="mt-3 grid gap-2">
              {selectedMods.map(({ id, modId }, index) => (
                <li key={id} className="flex min-w-0 items-center justify-between gap-2 rounded-lg bg-[#0e1722] p-2.5">
                  <span className="min-w-0 break-all font-mono text-sm">{index + 1}. {modId}</span>
                  <div className="flex shrink-0 gap-1.5">
                    <button type="button" aria-label={`${modId} 위로 이동`} disabled={index === 0}
                      onClick={() => updateEditor({ type: "move-mod", index, direction: -1 })}
                      className="secondary-action min-h-11 min-w-11 text-sm disabled:cursor-not-allowed disabled:opacity-40">위로</button>
                    <button type="button" aria-label={`${modId} 아래로 이동`} disabled={index === selectedMods.length - 1}
                      onClick={() => updateEditor({ type: "move-mod", index, direction: 1 })}
                      className="secondary-action min-h-11 min-w-11 text-sm disabled:cursor-not-allowed disabled:opacity-40">아래로</button>
                  </div>
                </li>
              ))}
            </ol>
          )}
          {result.recommendedModOrder && (
            <div aria-label="권장 로드 순서" className="mt-3 rounded-lg border border-amber-800/70 bg-amber-950/35 p-3 text-sm text-amber-200">
              <p className="font-semibold">권장 로드 순서</p>
              <p className="mt-1 break-words font-mono">{result.recommendedModOrder.join(" → ")}</p>
            </div>
          )}
        </section>
      </div>

      <section aria-labelledby="sample-output" className="panel min-w-0 p-4 sm:p-5">
        <h2 id="sample-output" className="text-lg font-bold">설정 출력</h2>
        <p className="muted mt-1 text-sm">가상 관계와 예시 형식으로 확인하는 출력입니다.</p>
        {result.preview ? (
          <pre aria-label="설정 문자열 미리보기" className="mt-3 overflow-x-auto rounded-lg bg-[#0e1722] p-3 font-mono text-sm leading-6">
            {`${result.preview.mods}\n${result.preview.workshopItems}`}
          </pre>
        ) : (
          <p className="muted mt-3 rounded-lg bg-[#0e1722] p-3 text-sm">표시할 설정이 없습니다.</p>
        )}
        <div aria-live="polite" className="mt-3 grid gap-2">
          {issueGroups.map(({ severity, label, className }) => {
            const issues = result.issues.filter((issue) => issue.severity === severity);
            if (issues.length === 0) return null;
            return (
              <section key={severity} aria-label={label} className={`rounded-lg border p-3 text-sm ${className}`}>
                <h3 className="font-semibold">{label}</h3>
                <ul className="mt-1 list-disc space-y-1 pl-5 leading-5">
                  {issues.map(({ code, message }, index) => <li key={`${code}:${index}`}>{message}</li>)}
                </ul>
              </section>
            );
          })}
        </div>
        {hasWarnings && (
          <label className="mt-3 flex min-h-11 items-center gap-3 text-sm">
            <input
              type="checkbox"
              className="size-5 shrink-0 accent-[#8fcb85]"
              checked={warningsAcknowledged}
              disabled={result.copyStatus === "blocked"}
              onChange={(event) => updateEditor({ type: "acknowledge-warnings", acknowledged: event.currentTarget.checked })}
            />
            경고를 확인했습니다
          </label>
        )}
        <button type="button" disabled={result.copyText === null} onClick={copySettings} className="action mt-3 min-h-11 w-full sm:w-auto">
          설정 복사
        </button>
        <p role="status" className="muted mt-2 text-sm">
          {copyFeedback === "copied" && "설정을 복사했습니다."}
          {copyFeedback === "failed" && "설정을 복사하지 못했습니다. 브라우저의 클립보드 권한을 확인해 주세요."}
        </p>
      </section>
    </div>
  );
}
