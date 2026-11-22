"use client";

import { useEffect, useState } from "react";
import type { DraftRelationInput } from "@/lib/mod-relation-review-input";

type Fixture = DraftRelationInput & { profileId: string };
type TestResult = { status: string; message: string };

async function jsonRequest(path: string, method: "GET" | "POST" = "GET", body?: unknown) {
  const response = await fetch(path, {
    method, credentials: "same-origin",
    headers: method === "POST" ? { "Content-Type": "application/json" } : {},
    cache: "no-store",
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("응답 JSON 형식이 올바르지 않습니다.");
  }
  return { status: response.status, ok: response.ok, data: payload as Record<string, unknown> };
}

export function RelationE2EClient({
  fixture, writeEnabled
}: { fixture: Fixture | null; writeEnabled: boolean }) {
  const [relationId, setRelationId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(true);
  const [approvedExisting, setApprovedExisting] = useState(false);
  const [history, setHistory] = useState<TestResult[]>([]);

  // A browser refresh must not strand an already-created draft in the DB.
  // Only restore the exact owner-visible fictional fixture, never an unrelated relation.
  useEffect(() => {
    let live = true;
    async function restoreExisting() {
      try {
        const response = await jsonRequest("/api/mod-relations");
        if (!response.ok || !fixture || !Array.isArray(response.data.relations)) return;
        const matches = response.data.relations.filter((raw): raw is Record<string, unknown> => {
          if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
          const row = raw as Record<string, unknown>;
          return row.kind === fixture.kind
            && row.subject_mod_id_entry_id === fixture.subjectModIdUuid
            && row.target_mod_id_entry_id === fixture.targetModIdUuid
            && row.research_record_id === fixture.evidenceRecordId
            && row.evidence_url === fixture.sourceUrl
            && row.checked_at === fixture.checkedAt;
        });
        if (!live || matches.length !== 1) return;
        const row = matches[0];
        if (typeof row.id !== "string") return;
        setRelationId(row.id);
        setApprovedExisting(row.approved === true);
      } catch {
        // A manual GET still reports HTTP errors; do not enable writes on failure.
      } finally {
        if (live) setLoadingExisting(false);
      }
    }
    void restoreExisting();
    return () => { live = false; };
  }, [fixture]);

  async function run(label: string, action: () => Promise<string>) {
    if (busy) return;
    setBusy(true);
    try {
      const message = await action();
      setHistory(previous => [...previous, { status: "통과", message: label + ": " + message }]);
    } catch (err) {
      setHistory(previous => [...previous, {
        status: "확인 필요", message: label + ": " +
          (err instanceof Error ? err.message : "예상하지 못한 오류")
      }]);
    } finally {
      setBusy(false);
    }
  }
  function fail(status: number, data: Record<string, unknown>) {
    throw new Error(`HTTP ${status}: ${typeof data.error === "string" ? data.error : "요청 실패"}`);
  }

  const action = "secondary-action w-full text-sm";
  return (
    <section className="space-y-5">
      <div>
        <p className="kicker">PREVIEW ONLY · E2E DIAGNOSTICS</p>
        <h1 className="mt-2 text-2xl font-bold">모드 관계 모바일 검증</h1>
        <p className="muted mt-3 text-sm leading-6">
          시험 브랜치와 시험 DB의 허용된 계정에서만 보입니다. 앱의 기존 홈·모드·서버 화면은
          변경하지 않으며, 게임 서버 파일도 수정하지 않습니다.
        </p>
      </div>
      <div className="panel space-y-3 p-5">
        <p className="font-semibold">검증 준비 상태</p>
        <p className="text-sm">{fixture
          ? "시험용 가상 모드·프로필 및 조사 근거가 확인됐습니다."
          : "시험용 데이터가 아직 없습니다. 실제 카탈로그에는 가상 모드를 추가하지 않았습니다."}</p>
        <p className="text-sm">{writeEnabled
          ? "이 시험 Preview의 관계 초안/승인 쓰기가 명시적으로 허용되었습니다."
          : "이 Preview의 관계 초안/승인 쓰기는 차단되어 있습니다."}</p>
        <p className="text-sm" aria-live="polite">{loadingExisting
          ? "기존 시험 관계를 조회하고 있습니다."
          : relationId
            ? approvedExisting
              ? "기존 시험 관계는 이미 승인되었습니다."
              : "기존 미승인 초안을 찾았습니다. 2번을 다시 누르지 말고 3번 승인 버튼을 누르세요."
            : "기존 시험 관계가 없으면 2번에서 초안을 만들 수 있습니다."}</p>
        <p className="muted text-xs leading-5">
          관계 등록과 승인은 서로 다른 버튼으로 진행하며, 승인은 확인창이 표시됩니다.
          버튼을 누르기 전에는 쓰기 요청을 하지 않습니다.
        </p>
      </div>
      <div className="panel space-y-3 p-5">
        <button className={action} disabled={busy} onClick={() => void run("본인 관계 조회", async () => {
          const result = await jsonRequest("/api/mod-relations");
          if (!result.ok) fail(result.status, result.data);
          const rows = result.data.relations;
          if (!Array.isArray(rows)) throw new Error("관계 목록이 배열이 아닙니다.");
          return `HTTP ${result.status}, 관계 ${rows.length}건`;
        })}>1. 관계 조회 (읽기 전용)</button>
        <button className={action} disabled={busy || loadingExisting || !!relationId || !fixture || !writeEnabled} onClick={() => void run("초안 생성", async () => {
          if (!fixture) throw new Error("시험 자료 없음");
          const draft = {
            kind: fixture.kind, subjectModIdUuid: fixture.subjectModIdUuid,
            targetModIdUuid: fixture.targetModIdUuid,
            evidenceRecordId: fixture.evidenceRecordId,
            sourceUrl: fixture.sourceUrl, checkedAt: fixture.checkedAt
          };
          const result = await jsonRequest("/api/mod-relations", "POST", draft);
          if (!result.ok) fail(result.status, result.data);
          if (result.data.approved !== false || typeof result.data.relationId !== "string") {
            throw new Error("초안 미승인 상태를 검증하지 못했습니다.");
          }
          setRelationId(result.data.relationId);
          setApprovedExisting(false);
          return "미승인 초안 생성 (201)";
        })}>2. 미승인 관계 초안 생성 (시험 DB 쓰기)</button>
        <button className={action} disabled={busy || loadingExisting || !relationId || approvedExisting || !writeEnabled} onClick={() => {
          if (!relationId || !window.confirm("시험 DB의 관계 초안을 명시적으로 승인할까요?")) return;
          void run("관계 승인", async () => {
            const result = await jsonRequest("/api/mod-relations/approve",
              "POST", { relationId, confirm: true });
            if (!result.ok) fail(result.status, result.data);
            if (result.data.approved !== true) throw new Error("승인 결과를 확인하지 못했습니다.");
            setApprovedExisting(true);
            return "명시적 승인 완료 (200)";
          });
        }}>3. 관계 명시적 승인 (별도 확인)</button>
        <button className={action} disabled={busy || !fixture} onClick={() => void run("저장 프로필 출력", async () => {
          if (!fixture) throw new Error("시험 자료 없음");
          const result = await jsonRequest(
            `/api/profile-snapshots?profileId=${encodeURIComponent(fixture.profileId)}&outputPrefix=none`
          );
          if (!result.ok) fail(result.status, result.data);
          const preview = result.data.outputPreview;
          if (!preview || typeof preview !== "object" || Array.isArray(preview)) {
            throw new Error("출력 미리보기 정보가 없습니다.");
          }
          const output = preview as Record<string, unknown>;
          const issues = Array.isArray(output.issues) ? output.issues : [];
          const blocked = issues.some(issue => {
            if (!issue || typeof issue !== "object") return false;
            return (issue as Record<string, unknown>).code === "missing-required-mod";
          });
          if (output.readyForCopy !== false) throw new Error("복사 잠금이 예상과 다릅니다.");
          return `HTTP 200, 검증된 필수 모드 누락 ${blocked ? "감지" : "없음"}, 복사 잠금 유지`;
        })}>4. 프로필 출력 검사 (읽기 전용)</button>
        <button className={action} disabled={busy} onClick={() => void run("백업 v3", async () => {
          const result = await jsonRequest("/api/data-export");
          if (!result.ok) fail(result.status, result.data);
          if (result.data.schemaVersion !== 3) throw new Error("백업 스키마 버전 불일치");
          const data = result.data.data;
          if (!data || typeof data !== "object" || Array.isArray(data)) {
            throw new Error("백업 데이터 영역 오류");
          }
          const rel = (data as Record<string, unknown>).modRelations;
          if (!Array.isArray(rel)) throw new Error("관계 승인 기록 누락");
          return `HTTP 200, v3 관계 기록 ${rel.length}건 (다운로드·복원하지 않음)`;
        })}>5. 백업 v3 구조 검사 (읽기 전용)</button>
      </div>
      <div className="panel space-y-2 p-5" aria-live="polite">
        <p className="font-semibold">검증 결과</p>
        {history.length ? history.map((item, index) => (
          <p key={index} className="text-sm leading-6">{item.status}: {item.message}</p>
        )) : <p className="muted text-sm">아직 검사하지 않았습니다.</p>}
      </div>
    </section>
  );
}
