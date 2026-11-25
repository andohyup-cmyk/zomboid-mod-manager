"use client";

import Link from "next/link";
import { useState } from "react";
import { CategoryManager, type ManagedCategory } from "@/components/CategoryManager";
import { SteamCategoryAutoClassifyPanel } from "@/components/SteamCategoryAutoClassifyPanel";
import { UNCLASSIFIED_CATEGORY_FILTER } from "@/lib/catalog-read";

type ActiveTab = "filter" | "category" | "auto" | null;

export function ModsToolbar({
  query,
  archive,
  category,
  modIdFilter,
  categories,
  categoryWriteEnabled,
  autoWriteEnabled
}: {
  query: string;
  archive: string;
  category: string;
  modIdFilter: string;
  categories: ManagedCategory[];
  categoryWriteEnabled: boolean;
  autoWriteEnabled: boolean;
}) {
  const activeFilterCount = [archive !== "active", category !== "", modIdFilter !== ""].filter(Boolean).length;
  const [openTab, setOpenTab] = useState<ActiveTab>(null);

  function toggle(tab: Exclude<ActiveTab, null>) {
    setOpenTab((current) => (current === tab ? null : tab));
  }

  return (
    <div className="space-y-2.5">
      <form method="get" className="flex gap-2">
        <label className="sr-only" htmlFor="q">이름 또는 Workshop ID 검색</label>
        <input
          id="q"
          className="field min-w-0 flex-1"
          name="q"
          defaultValue={query}
          type="search"
          inputMode="search"
          placeholder="모드 이름 또는 Workshop ID"
        />
        {archive !== "active" && <input type="hidden" name="archive" value={archive} />}
        {category && <input type="hidden" name="category" value={category} />}
        {modIdFilter && <input type="hidden" name="modId" value={modIdFilter} />}
        <button type="submit" className="action shrink-0">검색</button>
      </form>

      {/* 1-row compact 3-tab bar (A안) */}
      <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="모드 관리 도구">
        {(
          [
            { id: "filter", label: activeFilterCount > 0 ? `필터 (${activeFilterCount})` : "필터" },
            { id: "category", label: `카테고리 (${categories.length})` },
            { id: "auto", label: "자동 카테고리 설정" }
          ] as const
        ).map((item) => {
          const active = openTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-expanded={active}
              onClick={() => toggle(item.id)}
              className={
                "min-h-11 rounded-xl border px-2 py-2 text-center text-xs font-semibold transition-colors " +
                (active
                  ? "border-[#8fcb85] bg-[#294535] text-[#b9efb0]"
                  : "border-[#304154] bg-[#101824] text-[#c9d8e5] hover:border-[#6ca67b]")
              }
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {openTab === "filter" && (
        <form method="get" className="panel space-y-3 p-4">
          {query && <input type="hidden" name="q" value={query} />}
          <div className="grid grid-cols-3 gap-2.5">
            <label className="text-xs font-semibold">
              목록
              <select name="archive" defaultValue={archive} className="field mt-1 text-xs">
                <option value="active">사용 중</option>
                <option value="archived">보관</option>
                <option value="all">전체</option>
              </select>
            </label>
            <label className="text-xs font-semibold">
              카테고리
              <select name="category" defaultValue={category} className="field mt-1 text-xs">
                <option value="">전체</option>
                <option value={UNCLASSIFIED_CATEGORY_FILTER}>미분류</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold">
              Mod ID
              <select name="modId" defaultValue={modIdFilter} className="field mt-1 text-xs">
                <option value="">전체</option>
                <option value="missing">미확인만</option>
                <option value="present">확인됨만</option>
              </select>
            </label>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="action text-xs">적용</button>
            <Link href="/mods" className="secondary-action text-xs">초기화</Link>
          </div>
        </form>
      )}

      {openTab === "category" && (
        <div className="panel p-4">
          <CategoryManager initialCategories={categories} writeEnabled={categoryWriteEnabled} embedded />
        </div>
      )}

      {openTab === "auto" && (
        <div className="panel p-4">
          <SteamCategoryAutoClassifyPanel writeEnabled={autoWriteEnabled} embedded />
        </div>
      )}
    </div>
  );
}
