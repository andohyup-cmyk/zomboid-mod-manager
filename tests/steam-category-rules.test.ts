import assert from "node:assert/strict";
import test from "node:test";
import {
  classifySteamTags,
  extractSteamTagsFromDetail,
  getCategoryPresetSortOrder,
  LOAD_ORDER_CATEGORY_PRESETS,
  parseAutoClassifyApplyInput,
  sortCategoriesForLoadOrder
} from "../lib/steam-category-rules";
import { parseSteamWorkshopDetails } from "../lib/steam-metadata";

test("defines all 9 Mod Load Order Sorter [b42] tiers in strict 1..9 load order", () => {
  assert.equal(LOAD_ORDER_CATEGORY_PRESETS.length, 9);
  assert.deepEqual(
    LOAD_ORDER_CATEGORY_PRESETS.map((p) => p.sortOrder),
    [1, 2, 3, 4, 5, 6, 7, 8, 9]
  );
  assert.equal(getCategoryPresetSortOrder("프레임워크·API·트윅"), 1);
  assert.equal(getCategoryPresetSortOrder("번역·한글화"), 9);
  assert.equal(getCategoryPresetSortOrder("사용자 커스텀"), null);
});

test("classifySteamTags maps multi-category memberships, picks 1 primary, and ignores version/meta tags", () => {
  // Meta tags only -> unclassified
  assert.deepEqual(classifySteamTags(["Build 42", "Multiplayer", "WIP", "Realistic", "Silly/Fun"]), {
    categoryNames: [],
    primaryCategoryName: null
  });

  // Translation + Interface + Misc -> keeps Translation & Interface, drops generic 기타 모드, primary = 번역·한글화
  assert.deepEqual(
    classifySteamTags(["Build 42", "Language/Translation", "Interface", "Misc"]),
    {
      categoryNames: ["UI·인터페이스", "번역·한글화"],
      primaryCategoryName: "번역·한글화"
    }
  );

  // Framework + QOL -> keeps both in load order, primary = 프레임워크·API·트윅
  assert.deepEqual(
    classifySteamTags(["QOL", "Framework", "Multiplayer"]),
    {
      categoryNames: ["프레임워크·API·트윅", "기능·코드"],
      primaryCategoryName: "프레임워크·API·트윅"
    }
  );

  // Only generic item/weapon/building tags -> 기타 모드
  assert.deepEqual(
    classifySteamTags(["Build 42", "Weapons", "building"]),
    {
      categoryNames: ["기타 모드"],
      primaryCategoryName: "기타 모드"
    }
  );
});

test("sortCategoriesForLoadOrder orders 1..9 tiers first and places custom sort_order=0 categories after", () => {
  const sorted = sortCategoriesForLoadOrder([
    { id: "c-custom", name: "내 즐겨찾기", sort_order: 0 },
    { id: "c-loc", name: "번역·한글화", sort_order: 9 },
    { id: "c-fw", name: "프레임워크·API·트윅", sort_order: 1 },
    { id: "c-veh", name: "차량", sort_order: 0 } // preset name with legacy sort_order=0 still maps to 4
  ]);
  assert.deepEqual(sorted.map((c) => c.id), ["c-fw", "c-veh", "c-loc", "c-custom"]);
});

test("extractSteamTagsFromDetail and parseSteamWorkshopDetails extract deduplicated Steam tags", () => {
  assert.deepEqual(
    extractSteamTagsFromDetail({
      tags: [{ tag: "Framework" }, { tag: " framework " }, { tag: "" }, null, { tag: "Interface" }]
    }),
    ["Framework", "Interface"]
  );

  const parsed = parseSteamWorkshopDetails(["3552615247"], {
    response: {
      publishedfiledetails: [{
        publishedfileid: "3552615247",
        result: 1,
        consumer_app_id: 108600,
        title: "Sample Mod",
        description: "Desc",
        tags: [{ tag: "Build 42" }, { tag: "Vehicles" }, { tag: "QOL" }]
      }]
    }
  }, "2026-11-25");

  assert.deepEqual(parsed.tagsByWorkshopId["3552615247"], ["Build 42", "Vehicles", "QOL"]);
  assert.deepEqual(classifySteamTags(parsed.tagsByWorkshopId["3552615247"]), {
    categoryNames: ["차량", "기능·코드"],
    primaryCategoryName: "차량"
  });
});

test("parseAutoClassifyApplyInput validates UUIDs, primary membership, and rejects invalid payloads", () => {
  const modA = "10000000-0000-4000-8000-000000000001";
  const ok = parseAutoClassifyApplyInput({
    items: [{
      modId: modA.toUpperCase(),
      categoryNames: ["차량", "기능·코드"],
      primaryCategoryName: "차량"
    }]
  });
  assert.deepEqual(ok, {
    items: [{
      modId: modA,
      categoryNames: ["차량", "기능·코드"],
      primaryCategoryName: "차량"
    }]
  });

  // Invalid cases
  assert.equal(parseAutoClassifyApplyInput({ items: [] }), null);
  assert.equal(parseAutoClassifyApplyInput({
    items: [{ modId: modA, categoryNames: ["차량"], primaryCategoryName: "UI·인터페이스" }]
  }), null);
  assert.equal(parseAutoClassifyApplyInput({
    items: [{ modId: "bad-uuid", categoryNames: ["차량"], primaryCategoryName: "차량" }]
  }), null);
  assert.equal(parseAutoClassifyApplyInput({
    items: [
      { modId: modA, categoryNames: ["차량"], primaryCategoryName: "차량" },
      { modId: modA, categoryNames: ["차량"], primaryCategoryName: "차량" }
    ]
  }), null);
});
