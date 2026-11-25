"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export type CatalogCategoryBadge = {
  id: string;
  name: string;
  isPrimary: boolean;
};

export type CatalogListItem = {
  id: string;
  title: string;
  shortDescription: string;
  is_archived: boolean;
  categoryIds: string[];
  categories: CatalogCategoryBadge[];
  primaryCategoryName: string | null;
};

export type CategoryFilterOption = { id: string; name: string };

export function ModCatalogList({
  items,
  categories,
  initialCategoryFilter = "all",
  hasServerFilters = false
}: {
  items: CatalogListItem[];
  categories: CategoryFilterOption[];
  initialCategoryFilter?: string;
  hasServerFilters?: boolean;
}) {
  const [selectedCategory, setSelectedCategory] = useState<string>(initialCategoryFilter);

  const countsByCategory = useMemo(() => {
    const map = new Map<string, number>();
    let unclassified = 0;
    for (const item of items) {
      if (item.categoryIds.length === 0) {
        unclassified += 1;
      } else {
        for (const catId of item.categoryIds) {
          map.set(catId, (map.get(catId) ?? 0) + 1);
        }
      }
    }
    return { all: items.length, unclassified, byCategory: map };
  }, [items]);

  const effectiveSelected =
    selectedCategory === "all" || selectedCategory === "unclassified" || categories.some((c) => c.id === selectedCategory)
      ? selectedCategory
      : "all";

  const visibleItems = useMemo(() => {
    if (effectiveSelected === "unclassified") {
      return items.filter((item) => item.categoryIds.length === 0);
    }
    if (effectiveSelected !== "all") {
      return items.filter((item) => item.categoryIds.includes(effectiveSelected));
    }
    return items;
  }, [items, effectiveSelected]);

  return (
    <div className="space-y-3">
      {/* Compact single dropdown quick selector (2-B안) */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="mods-quick-category">카테고리 빠른 선택</label>
        <select
          id="mods-quick-category"
          value={effectiveSelected}
          onChange={(event) => setSelectedCategory(event.target.value)}
          className="field min-w-0 flex-1 text-sm"
        >
          <option value="all">전체 ({countsByCategory.all})</option>
          <option value="unclassified">미분류 ({countsByCategory.unclassified})</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name} ({countsByCategory.byCategory.get(cat.id) ?? 0})
            </option>
          ))}
        </select>
        {hasServerFilters && (
          <Link
            href="/mods"
            className="secondary-action shrink-0 px-3 py-2 text-xs"
          >
            초기화
          </Link>
        )}
      </div>

      <p className="muted text-xs">{visibleItems.length}개 표시</p>

      {visibleItems.length === 0 ? (
        <div className="panel space-y-2 p-6 text-center">
          <p className="text-sm font-semibold">해당 조건의 모드가 없습니다.</p>
          {effectiveSelected !== "all" && (
            <button
              type="button"
              onClick={() => setSelectedCategory("all")}
              className="secondary-action text-xs"
            >
              전체 모드 보기 ({countsByCategory.all})
            </button>
          )}
        </div>
      ) : (
        <ul className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2">
          {visibleItems.map((mod) => (
            <li key={mod.id}>
              <Link
                href={`/mods/${mod.id}`}
                className="panel block space-y-2 p-4 transition-colors active:border-[#6ca67b] hover:border-[#6ca67b]"
              >
                <div className="flex items-start justify-between gap-2">
                  <h2 className="min-w-0 break-words text-base font-bold">{mod.title}</h2>
                  {mod.is_archived && (
                    <span className="shrink-0 rounded-md bg-[#2a3441] px-2 py-0.5 text-[11px]">보관</span>
                  )}
                </div>
                {mod.shortDescription && (
                  <p className="muted line-clamp-2 text-xs leading-5">{mod.shortDescription}</p>
                )}
                <div className="flex flex-wrap gap-1.5 text-[11px]">
                  {mod.categories.length > 0 ? (
                    mod.categories.map((cat) => (
                      <span
                        key={cat.id}
                        className={
                          cat.isPrimary
                            ? "rounded-md bg-[#234332] px-2 py-0.5 font-semibold text-[#b9efb0]"
                            : "rounded-md bg-[#1f3a4d] px-2 py-0.5 text-[#bfe3ff]"
                        }
                      >
                        {cat.isPrimary ? `★ ${cat.name}` : cat.name}
                      </span>
                    ))
                  ) : (
                    <span className="rounded-md bg-[#1f3a4d] px-2 py-0.5 text-[#bfe3ff]">미분류</span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
