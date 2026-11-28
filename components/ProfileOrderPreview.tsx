import { getEnabledProfileMods } from "@/lib/profile-mod-id-state";
import { profileModKey } from "@/lib/profile-mod-order";
import {
  isBlockingProfileOrderWarning,
  type ProfileOrderPreview as Preview
} from "@/lib/profile-order-preview";
import type {
  ProfileOrderEvidence,
  ProfileOrderReason,
  ProfileOrderReference,
  ProfileOrderRule,
  ProfileOrderWarning
} from "@/lib/profile-mod-recommended-order";

type Props = {
  preview: Preview;
  current: boolean;
  canApply: boolean;
  titles: ReadonlyMap<string, string>;
  categories: ReadonlyMap<string, string>;
  onCancel: () => void;
  onApply: () => void;
};

const ruleNames: Record<ProfileOrderRule["kind"], string> = {
  requires: "필수 의존성",
  loadBefore: "선행 규칙",
  loadAfter: "후행 규칙",
  loadFirst: "처음 로드",
  loadLast: "마지막 로드",
  incompatibleMods: "비호환"
};

function reference(mod: ProfileOrderReference): string {
  return mod.workshopId === undefined ? mod.modId : `${mod.modId} · Workshop ${mod.workshopId}`;
}

function ruleDescription(rule: ProfileOrderRule): string {
  if ("scope" in rule) {
    const scope = { on: "전체 활성 목록", category: "같은 카테고리", off: "사용 안 함" }[rule.scope];
    return `${reference(rule.mod)} · ${scope}`;
  }
  if (rule.kind === "requires") return `${reference(rule.mod)}에 필요 · ${reference(rule.target)}`;
  if (rule.kind === "incompatibleMods") return `${reference(rule.mod)} ↔ ${reference(rule.target)}`;
  const [before, after] = rule.kind === "loadBefore" ? [rule.mod, rule.target] : [rule.target, rule.mod];
  return `${reference(before)} → ${reference(after)}`;
}

function RuleEvidence({ evidence }: { evidence?: ProfileOrderEvidence }) {
  if (!evidence) return null;
  return (
    <div className="muted mt-1 space-y-0.5 text-xs">
      {evidence.source && <p>출처 {evidence.source}</p>}
      {evidence.checkedAt && <p>확인일 {evidence.checkedAt}</p>}
      {evidence.verificationNote && <p>{evidence.verificationNote}</p>}
    </div>
  );
}

function RuleLine({ rule }: { rule: ProfileOrderRule }) {
  return (
    <li>
      <p><strong>{ruleNames[rule.kind]}</strong> · {ruleDescription(rule)}</p>
      <RuleEvidence evidence={rule.evidence} />
    </li>
  );
}

function Diagnostic({ warning }: { warning: ProfileOrderWarning }) {
  if (warning.code === "cycle") {
    return (
      <li>
        <p className="font-semibold">순환 제약</p>
        <p>{warning.cycle.map(reference).join(" → ")}</p>
        <ul className="mt-2 space-y-1.5">{warning.rules.map((rule, index) => <RuleLine key={index} rule={rule} />)}</ul>
      </li>
    );
  }
  if (warning.code === "duplicate-selection") return <li>같은 선택이 목록에 반복됩니다. {reference(warning.mod)}</li>;

  let message: string;
  if (warning.code === "ambiguous-reference") {
    const endpoint = warning.endpoint === "mod" ? "주체" : "상대";
    message = `규칙의 ${endpoint}를 특정할 수 없습니다. 후보 ${warning.matches.map(reference).join(", ")}`;
  } else if (warning.code === "incompatible-mods") {
    message = `두 항목이 활성 상태입니다. 순서 변경으로 비호환이 해소되지는 않습니다. ${warning.mods.map(reference).join(" / ")}`;
  } else {
    message = {
      "unverified-rule": "확인 근거가 부족해 규칙을 건너뛰었습니다.",
      "missing-target": "상대 항목이 선택 목록에 없습니다.",
      "disabled-target": "상대 항목이 비활성 상태입니다.",
      "missing-category": "대표 카테고리를 확인할 수 없습니다."
    }[warning.code];
  }

  return (
    <li>
      <p>{message}</p>
      <p className="mt-1"><strong>{ruleNames[warning.rule.kind]}</strong> · {ruleDescription(warning.rule)}</p>
      <RuleEvidence evidence={warning.rule.evidence} />
    </li>
  );
}

function MoveReason({
  reason, categories
}: {
  reason: ProfileOrderReason;
  categories: Props["categories"];
}) {
  if (reason.kind === "verified-order") {
    return (
      <li>
        <p>검증된 순서 · {reference(reason.before)} → {reference(reason.after)}</p>
        <ul className="mt-2 space-y-1.5">{reason.rules.map((rule, index) => <RuleLine key={index} rule={rule} />)}</ul>
      </li>
    );
  }
  if (reason.kind === "category-priority") {
    const before = categories.get(reason.beforeCategoryId) ?? reason.beforeCategoryId;
    const after = reason.afterCategoryId === null
      ? "미확인"
      : categories.get(reason.afterCategoryId) ?? reason.afterCategoryId;
    return <li>카테고리 우선순위 · {before} 항목을 {after} 항목보다 앞에 배치했습니다. {reference(reason.before)} → {reference(reason.after)}</li>;
  }
  return <li>다른 항목의 이동에 따라 위치가 바뀌었습니다.</li>;
}

export function ProfileOrderPreview({
  preview, current, canApply, titles, categories, onCancel, onApply
}: Props) {
  const { result, options } = preview;
  const blockers = result.warnings.filter(isBlockingProfileOrderWarning);
  const incompatibilities = result.warnings.filter((warning) => warning.code === "incompatible-mods");
  const unknowns = result.warnings.filter((warning) => warning.code === "unverified-rule"
    || warning.code === "missing-category"
    || (warning.code === "ambiguous-reference" && !isBlockingProfileOrderWarning(warning)));
  const cautions = result.warnings.filter((warning) => (warning.code === "missing-target"
    || warning.code === "disabled-target") && !isBlockingProfileOrderWarning(warning));
  const diagnostics = [
    { label: "차단 오류", items: blockers, className: "border-[#84414a] bg-[#3d222a] text-[#ffd2d5]" },
    { label: "비호환 경고", items: incompatibilities, className: "border-[#67532e] bg-[#302717] text-[#f2d6a0]" },
    { label: "검토 경고", items: cautions, className: "border-[#67532e] bg-[#302717] text-[#f2d6a0]" },
    { label: "미확인 정보", items: unknowns, className: "border-[#435468] bg-[#1d2a39] text-[#c9dbec]" }
  ];

  const enabled = getEnabledProfileMods(result.currentOrder);
  const verifiedRules = options.rules?.filter((rule) => {
    const evidence = rule.evidence;
    return (!("scope" in rule) || rule.scope !== "off")
      && evidence?.verified && (evidence.source?.trim() || evidence.verificationNote?.trim())
      && enabled.some((selection) => selection.modId.trim() === rule.mod.modId.trim()
        && (rule.mod.workshopId === undefined || selection.workshopId.trim() === rule.mod.workshopId.trim()));
  }) ?? [];
  const shownRules = verifiedRules.filter((rule) => rule.kind !== "incompatibleMods");
  const nextPosition = new Map(result.recommendedOrder?.map((mod, index) => [profileModKey(mod), index + 1]));
  const changes = new Map(result.changes.map((change) => [profileModKey(change.mod), change]));

  return (
    <section
      id="profile-recommendation"
      aria-labelledby="profile-recommendation-title"
      className="panel space-y-3 p-3 text-sm [overflow-wrap:anywhere] sm:p-4"
    >
      <h2 id="profile-recommendation-title" className="text-base font-bold">추천 순서 미리보기</h2>
      {!current ? (
        <p role="alert" className="rounded-xl border border-[#67532e] bg-[#302717] p-3 text-[#f2d6a0]">
          편집 목록이나 정렬 설정이 변경됐습니다. 추천 정렬을 다시 계산하세요.
        </p>
      ) : (
        <>
          {options.exampleRules && <p className="rounded-lg bg-[#26384a] p-2 text-[#d0e0ef]">예시 정렬 규칙을 사용한 결과입니다.</p>}
          {verifiedRules.length === 0 && (
            <p className="muted">제공된 검증 관계가 없어 카테고리 우선순위와 기존 순서로 계산했습니다.</p>
          )}
          <p className="muted text-xs">B42.22 실제 게임 로드 호환성은 별도 확인이 필요합니다.</p>
          {result.status === "blocked" ? (
            <p className="font-semibold text-[#ffd2d5]">차단된 추천입니다. 아래 오류를 해결한 뒤 다시 계산하세요.</p>
          ) : result.changes.length === 0 ? (
            <p className="font-semibold">현재 순서와 추천 순서가 같습니다.</p>
          ) : (
            <p className="font-semibold">위치가 바뀌는 항목 {result.changes.length}개</p>
          )}
          {diagnostics.map(({ label, items, className }, group) => items.length > 0 && (
            <div key={label} role={group === 0 ? "alert" : undefined} className={`rounded-xl border p-3 ${className}`}>
              <h3 className="font-semibold">{label}</h3>
              <ul className="mt-2 space-y-2">
                {items.map((warning, index) => <Diagnostic key={index} warning={warning} />)}
              </ul>
            </div>
          ))}
          {shownRules.length > 0 && (
            <details className="rounded-xl border border-[#304154] px-3 py-2">
              <summary className="min-h-9 cursor-pointer py-1.5 font-semibold">검증된 의존성 및 순서 규칙</summary>
              <ul className="space-y-2 pb-1">{shownRules.map((rule, index) => <RuleLine key={index} rule={rule} />)}</ul>
            </details>
          )}
          <div className="max-h-[50dvh] overflow-auto rounded-xl border border-[#304154]">
            <table aria-label="현재 순서와 추천 순서 비교" className="w-full table-fixed text-left text-sm">
              <thead className="sticky top-0 bg-[#1a2736] text-[#d0e0ef]">
                <tr>
                  <th scope="col" className="px-2.5 py-2 font-semibold">항목</th>
                  <th scope="col" className="w-12 px-1 py-2 text-center font-semibold">현재</th>
                  <th scope="col" className="w-12 px-1 py-2 text-center font-semibold">추천</th>
                </tr>
              </thead>
              <tbody>
                {result.currentOrder.map((mod, index) => {
                  const key = profileModKey(mod);
                  const change = changes.get(key);
                  return (
                    <tr key={`${key}-${index}`} className="border-t border-[#304154] align-top">
                      <th scope="row" className="px-2.5 py-2.5 font-normal">
                        <p className="font-semibold">{titles.get(mod.workshopId) ?? mod.modId}</p>
                        <p className="font-mono text-[#d1e2ef]">{mod.modId}</p>
                        <p className="muted text-xs">Workshop ID {mod.workshopId}{!mod.enabled && " · 비활성"}</p>
                        {change && (
                          <details className="mt-1.5">
                            <summary className="min-h-9 cursor-pointer py-1.5 text-xs font-semibold text-[#bde6b0]">이동 이유</summary>
                            <ul className="space-y-2 py-1.5 text-xs leading-5 text-[#d1e2ef]">
                              {change.reasons.map((reason, reasonIndex) => (
                                <MoveReason key={reasonIndex} reason={reason} categories={categories} />
                              ))}
                            </ul>
                          </details>
                        )}
                      </th>
                      <td className="px-1 py-2.5 text-center tabular-nums">{index + 1}</td>
                      <td className={`px-1 py-2.5 text-center tabular-nums ${change ? "font-bold text-[#bde6b0]" : ""}`}>
                        {nextPosition.get(key) ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      <div className="flex flex-wrap justify-end gap-2 pt-1">
        <button type="button" className="secondary-action min-h-11 text-sm" onClick={onCancel}>취소</button>
        <button type="button" className="action min-h-11 text-sm" disabled={!canApply} onClick={onApply}>
          추천 순서 적용
        </button>
      </div>
    </section>
  );
}
