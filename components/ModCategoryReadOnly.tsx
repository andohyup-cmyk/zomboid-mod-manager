"use client";

import { useEffect, useState } from "react";

type Category = { id: string; name: string; sort_order: number };
type CategoryState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; categories: Category[]; selected: string[]; primary: string | null };

function isCategory(value: unknown): value is Category {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string" && typeof row.name === "string"
    && typeof row.sort_order === "number";
}

export function ModCategoryReadOnly({ modId }: { modId: string }) {
  const [state, setState] = useState<CategoryState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const [definitions, assignments] = await Promise.all([
          fetch("/api/categories", { cache: "no-store", signal: controller.signal }),
          fetch(`/api/mod-categories?modId=${encodeURIComponent(modId)}`,
            { cache: "no-store", signal: controller.signal })
        ]);
        if (!definitions.ok || !assignments.ok) throw new Error("카테고리 정보를 조회하지 못했습니다.");
        const list: unknown = await definitions.json();
        const mapping: unknown = await assignments.json();
        if (!list || typeof list !== "object" || !mapping || typeof mapping !== "object")
          throw new Error("카테고리 응답 형식이 올바르지 않습니다.");
        const definitionsData = list as { categories?: unknown };
        const assignmentsData = mapping as { categoryIds?: unknown; primaryCategoryId?: unknown };
        if (!Array.isArray(definitionsData.categories)
          || !definitionsData.categories.every(isCategory)
          || !Array.isArray(assignmentsData.categoryIds)
          || !assignmentsData.categoryIds.every(id => typeof id === "string")
          || !(typeof assignmentsData.primaryCategoryId === "string"
            || assignmentsData.primaryCategoryId === null)) {
          throw new Error("카테고리 응답 형식이 올바르지 않습니다.");
        }
        const categories = definitionsData.categories as Category[];
        const selected = assignmentsData.categoryIds as string[];
        const primary = assignmentsData.primaryCategoryId as string | null;
        const known = new Set(categories.map(row => row.id));
        if (selected.some(id => !known.has(id)) || (primary !== null && !selected.includes(primary)))
          throw new Error("카테고리 연결 정보가 일치하지 않습니다.");
        if (!controller.signal.aborted) setState({ status: "ready", categories, selected, primary });
      } catch {
        if (!controller.signal.aborted)
          setState({ status: "error", message: "카테고리 정보를 표시할 수 없습니다. 잠시 후 다시 확인해 주세요." });
      }
    }
    void load();
    return () => controller.abort();
  }, [modId]);

  return (
    <section className="panel space-y-3 p-5" aria-labelledby="mod-category-heading">
      <h2 id="mod-category-heading" className="text-lg font-bold">카테고리</h2>
      <p className="muted text-xs">현재 소속과 대표 카테고리만 표시합니다. 분류 변경 및 저장 기능은 아직 연결되지 않았습니다.</p>
      {state.status === "loading" && <p role="status" className="muted text-sm">카테고리 조회 중...</p>}
      {state.status === "error" && <p role="alert" className="text-sm text-amber-200">{state.message}</p>}
      {state.status === "ready" && (
        <>
          {state.selected.length === 0
            ? <p className="muted text-sm">미분류 모드입니다.</p>
            : <ul className="flex flex-wrap gap-2">
                {state.categories.filter(category => state.selected.includes(category.id)).map(category => (
                  <li key={category.id} className="rounded-lg border border-[#304154] bg-[#152333] px-3 py-2 text-sm">
                    {category.name}{state.primary === category.id && <span className="ml-2 text-[#b9efb0]">대표</span>}
                  </li>
                ))}
              </ul>}
          {state.categories.length === 0 && <p className="muted text-xs">등록된 카테고리가 없습니다.</p>}
        </>
      )}
    </section>
  );
}
