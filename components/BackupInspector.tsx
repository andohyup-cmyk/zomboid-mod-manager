"use client";

import { useState, type ChangeEvent } from "react";
import {
  inspectBackupSnapshot,
  BACKUP_TABLES,
  OPTIONAL_GROUP_BACKUP_TABLES,
  type BackupPreview,
  type OptionalGroupBackupTable
} from "@/lib/backup-preview";

const labels: Record<typeof BACKUP_TABLES[number], string> = {
  mods: "카탈로그 모드", modIds: "실제 Mod ID", researchRecords: "조사 기록",
  profiles: "서버 프로필", profileMods: "기존 프로필 연결", researchQueue: "영구 등록 대기함",
  profileRevisions: "프로필 저장 회차", profileModChoices: "개별 Mod ID 선택", profileDownloads: "다운로드 전용 Workshop", modRelations: "모드 관계·승인 기록",
  categories: "카테고리 정의", modCategories: "모드별 카테고리", modCategoryPrimary: "대표 카테고리"
};

const optionalLabels: Record<OptionalGroupBackupTable, string> = {
  selectionGroups: "선택 그룹 정의",
  selectionGroupMembers: "선택 그룹 멤버"
};

export function BackupInspector() {
  const [preview, setPreview] = useState<BackupPreview | null>(null);
  const [error, setError] = useState("");
  async function inspect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    setPreview(null);
    setError("");
    if (!file) return;
    if (file.size > 8_000_000) {
      setError("백업 파일은 8MB 이하여야 합니다.");
      return;
    }
    try {
      const parsed = inspectBackupSnapshot(JSON.parse(await file.text()) as unknown);
      if (!parsed.preview) setError(parsed.error ?? "백업 파일 형식 오류");
      else setPreview(parsed.preview);
    } catch {
      setError("백업 JSON 파일을 확인할 수 없습니다.");
    }
  }
  return (
    <div className="panel space-y-4 p-5">
      <h2 className="text-lg font-bold">다운로드한 파일 검사</h2>
      <p className="muted text-sm">
        파일 검사는 현재 브라우저 안에서만 수행됩니다. 서버 업로드, DB 복원, 데이터 덮어쓰기는 하지 않습니다.
      </p>
      <label className="secondary-action inline-flex cursor-pointer">
        JSON 백업 파일 선택
        <input type="file" accept=".json,application/json" className="sr-only"
          onChange={event => { void inspect(event); }} />
      </label>
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      {preview && (
        <div className="space-y-3 text-sm">
          <p role="status">{preview.complete ? "파일 구조와 내부 참조 검사를 통과했습니다. DB 복구 가능성은 별도입니다." :
            "경고: 누락된 항목이 있는 부분 내보내기입니다."}</p>
          <p className="muted text-xs">생성: {preview.exportedAt}</p>
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {BACKUP_TABLES.map(name => (
              <div key={name} className="flex justify-between gap-2 rounded-lg bg-[#162432] p-2">
                <dt>{labels[name]}</dt><dd>{preview.counts[name] ?? "누락"}</dd>
              </div>
            ))}
            {preview.optionalCounts && OPTIONAL_GROUP_BACKUP_TABLES.map(name => (
              preview.optionalCounts?.[name] !== undefined ? (
                <div key={name} className="flex justify-between gap-2 rounded-lg bg-[#162432] p-2">
                  <dt>{optionalLabels[name]}</dt><dd>{preview.optionalCounts[name]}</dd>
                </div>
              ) : null
            ))}
          </dl>
          {preview.warnings.map((warning, index) => <p key={index} className="text-xs text-amber-200">{warning}</p>)}
          <p className="muted text-xs">파일 구조 검사 통과는 데이터 복구 가능성이나 실제 DB 무결성을 보장하지 않습니다.</p>
        </div>
      )}
    </div>
  );
}
