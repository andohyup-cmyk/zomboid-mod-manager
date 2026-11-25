/**
 * Steam Workshop tag -> in-game load-order category classifier.
 *
 * Aligns with Project Zomboid B42 "Mod Load Order Sorter [b42]" (Workshop 3423660713)
 * 9-tier category order:
 *   1. Framework/API/Tweak
 *   2. Resources/Textures
 *   3. Maps/Locations
 *   4. Vehicles
 *   5. Code-only mods (QoL / Balance / Traits / Skills)
 *   6. Clothing
 *   7. Interface
 *   8. Other mods (Items / Weapons / Military / Food / Farming / Animals / Building / Literature / Misc)
 *   9. Localization
 *
 * Never infers gameplay compatibility or B42.22 verification status from Steam tags.
 */

export type LoadOrderCategoryPreset = Readonly<{
  sortOrder: number;
  name: string;
  englishLabel: string;
  steamTags: readonly string[];
}>;

export const LOAD_ORDER_CATEGORY_PRESETS: readonly LoadOrderCategoryPreset[] = [
  {
    sortOrder: 1,
    name: "프레임워크·API·트윅",
    englishLabel: "Framework/API/Tweak",
    steamTags: ["Framework", "Tweak"]
  },
  {
    sortOrder: 2,
    name: "리소스·텍스처",
    englishLabel: "Resources/Textures",
    steamTags: ["Textures", "Models", "Audio"]
  },
  {
    sortOrder: 3,
    name: "맵·지역",
    englishLabel: "Maps/Locations",
    steamTags: ["Map"]
  },
  {
    sortOrder: 4,
    name: "차량",
    englishLabel: "Vehicles",
    steamTags: ["Vehicles"]
  },
  {
    sortOrder: 5,
    name: "기능·코드",
    englishLabel: "Code-only mods",
    steamTags: ["QOL", "Balance", "Traits", "Skills"]
  },
  {
    sortOrder: 6,
    name: "의상·방어구",
    englishLabel: "Clothing",
    steamTags: ["Clothing/Armor"]
  },
  {
    sortOrder: 7,
    name: "UI·인터페이스",
    englishLabel: "Interface",
    steamTags: ["Interface"]
  },
  {
    sortOrder: 8,
    name: "기타 모드",
    englishLabel: "Other mods",
    steamTags: ["Items", "Weapons", "Military", "Food", "Farming", "Animals", "Building", "Literature", "Misc"]
  },
  {
    sortOrder: 9,
    name: "번역·한글화",
    englishLabel: "Localization",
    steamTags: ["Language/Translation"]
  }
];

const OTHER_CATEGORY_NAME = "기타 모드";

/**
 * Primary category precedence when a mod carries multiple Steam tags.
 * Example: a Korean translation mod tagged [Language/Translation, Interface]
 * keeps both memberships, with "번역·한글화" as its primary category.
 */
const PRIMARY_PRECEDENCE: readonly string[] = [
  "번역·한글화",
  "프레임워크·API·트윅",
  "맵·지역",
  "차량",
  "의상·방어구",
  "리소스·텍스처",
  "UI·인터페이스",
  "기능·코드",
  "기타 모드"
];

const TAG_TO_CATEGORY = new Map<string, string>();
const PRESET_ORDER_BY_NAME = new Map<string, number>();

for (const preset of LOAD_ORDER_CATEGORY_PRESETS) {
  PRESET_ORDER_BY_NAME.set(preset.name, preset.sortOrder);
  for (const tag of preset.steamTags) {
    TAG_TO_CATEGORY.set(tag.toLowerCase(), preset.name);
  }
}

export type SuggestedCategories = Readonly<{
  categoryNames: readonly string[];
  primaryCategoryName: string | null;
}>;

export function getCategoryPresetSortOrder(name: string): number | null {
  return PRESET_ORDER_BY_NAME.get(name.trim()) ?? null;
}

export function extractSteamTagsFromDetail(entry: Readonly<Record<string, unknown>>): string[] {
  const raw = entry.tags;
  if (!Array.isArray(raw)) return [];
  const tags: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const value = (item as Record<string, unknown>).tag;
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    const lower = trimmed.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    tags.push(trimmed);
  }
  return tags;
}

/**
 * Maps Steam Workshop public tags to multi-category memberships + 1 primary category.
 * Meta/version/compatibility tags (Build 42, Multiplayer, WIP, Realistic, etc.) are ignored.
 */
export function classifySteamTags(tags: readonly string[]): SuggestedCategories {
  const matched = new Set<string>();
  for (const rawTag of tags) {
    if (typeof rawTag !== "string") continue;
    const mapped = TAG_TO_CATEGORY.get(rawTag.trim().toLowerCase());
    if (mapped) matched.add(mapped);
  }

  if (matched.size === 0) {
    return { categoryNames: [], primaryCategoryName: null };
  }

  // Drop generic "기타 모드" when at least one more specific category matched.
  if (matched.size > 1 && matched.has(OTHER_CATEGORY_NAME)) {
    matched.delete(OTHER_CATEGORY_NAME);
  }

  const ordered = LOAD_ORDER_CATEGORY_PRESETS
    .map((preset) => preset.name)
    .filter((name) => matched.has(name));

  const primaryCategoryName = PRIMARY_PRECEDENCE.find((name) => matched.has(name)) ?? ordered[0] ?? null;

  return {
    categoryNames: ordered,
    primaryCategoryName
  };
}

/**
 * Sorts owner categories for load-order recommendation:
 * 1) Explicit sort_order > 0 (or built-in preset sortOrder 1..9 if sort_order === 0)
 * 2) Custom categories with sort_order === 0 placed after the 9 load-order tiers, sorted by name.
 */
export function sortCategoriesForLoadOrder<T extends { id: string; name: string; sort_order?: number | null }>(
  categories: readonly T[]
): T[] {
  const rankOf = (item: T): number => {
    const explicit = typeof item.sort_order === "number" && Number.isSafeInteger(item.sort_order) && item.sort_order > 0
      ? item.sort_order
      : null;
    if (explicit !== null) return explicit;
    return getCategoryPresetSortOrder(item.name) ?? 999;
  };
  return [...categories].sort((a, b) => {
    const diff = rankOf(a) - rankOf(b);
    if (diff !== 0) return diff;
    return a.name.localeCompare(b.name, "ko");
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AutoClassifyApplyItem = Readonly<{
  modId: string;
  categoryNames: readonly string[];
  primaryCategoryName: string;
}>;

export function parseAutoClassifyApplyInput(input: unknown): { items: AutoClassifyApplyItem[] } | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const obj = input as Record<string, unknown>;
  if (!Array.isArray(obj.items) || obj.items.length < 1 || obj.items.length > 300) return null;

  const seenMods = new Set<string>();
  const items: AutoClassifyApplyItem[] = [];
  for (const raw of obj.items) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const row = raw as Record<string, unknown>;
    if (typeof row.modId !== "string" || !UUID_RE.test(row.modId)) return null;
    const modId = row.modId.toLowerCase();
    if (seenMods.has(modId)) return null;
    seenMods.add(modId);

    if (!Array.isArray(row.categoryNames) || row.categoryNames.length < 1 || row.categoryNames.length > 64) {
      return null;
    }
    const names: string[] = [];
    const seenNames = new Set<string>();
    for (const rawName of row.categoryNames) {
      if (typeof rawName !== "string") return null;
      const trimmed = rawName.trim();
      if (!trimmed || trimmed.length > 120 || trimmed !== rawName) return null;
      if (seenNames.has(trimmed)) return null;
      seenNames.add(trimmed);
      names.push(trimmed);
    }
    if (typeof row.primaryCategoryName !== "string" || !seenNames.has(row.primaryCategoryName)) {
      return null;
    }
    items.push({
      modId,
      categoryNames: names,
      primaryCategoryName: row.primaryCategoryName
    });
  }
  return { items };
}
