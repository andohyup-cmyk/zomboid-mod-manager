import { buildServerConfig, canonicalWorkshopId, type ServerConfigInput, type ServerConfigOptions } from "./server-config";

type ModIdEntry = { readonly id: string; readonly value: string };

// Profile reads need mod_ids(id, value). The catalog list currently selects value only.
export type ProfileCatalogRow = {
  readonly id: string;
  readonly title: string;
  readonly workshop_id: string;
  readonly is_archived: boolean;
  readonly mod_ids: readonly ModIdEntry[] | null;
};

export type ProfileCatalogItem = {
  readonly id: string;
  readonly title: string;
  readonly workshopId: string;
  readonly isArchived: boolean;
  readonly modIds: readonly ModIdEntry[];
};

export function toProfileCatalog(rows: readonly ProfileCatalogRow[]): ProfileCatalogItem[] {
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    workshopId: row.workshop_id,
    isArchived: row.is_archived,
    modIds: (row.mod_ids ?? []).map(({ id, value }) => ({ id, value }))
  }));
}

export type ProfileDraft = {
  readonly profileId: string;
  readonly revision: number;
  readonly selectedModEntryIds: readonly string[];
  readonly downloadOnlyWorkshopIds: readonly string[];
  readonly legacyConverted?: boolean;
};

export type ProfileEditorState = { readonly draft: ProfileDraft; readonly warningsAcknowledged: boolean };

export type ProfileEdit =
  | { type: "select-mod"; modEntryId: string; selected: boolean }
  | { type: "move-mod"; index: number; direction: -1 | 1 }
  | { type: "select-download"; workshopId: string; selected: boolean }
  | { type: "acknowledge-warnings"; acknowledged: boolean };

function setMembership(values: readonly string[], value: string, selected: boolean) {
  if (values.includes(value) === selected) return values;
  return selected ? [...values, value] : values.filter((item) => item !== value);
}

export function editProfile(state: ProfileEditorState, edit: ProfileEdit): ProfileEditorState {
  const { draft } = state;
  switch (edit.type) {
    case "acknowledge-warnings":
      return edit.acknowledged === state.warningsAcknowledged
        ? state : { draft, warningsAcknowledged: edit.acknowledged };
    case "select-mod": {
      const selectedModEntryIds = setMembership(draft.selectedModEntryIds, edit.modEntryId, edit.selected);
      return selectedModEntryIds === draft.selectedModEntryIds
        ? state : { draft: { ...draft, selectedModEntryIds }, warningsAcknowledged: false };
    }
    case "select-download": {
      const workshopId = canonicalWorkshopId(edit.workshopId);
      if (!workshopId) return state;
      const matchesWorkshop = (id: string) => canonicalWorkshopId(id) === workshopId;
      if (edit.selected === draft.downloadOnlyWorkshopIds.some(matchesWorkshop)) return state;
      const downloadOnlyWorkshopIds = edit.selected
        ? [...draft.downloadOnlyWorkshopIds, workshopId]
        : draft.downloadOnlyWorkshopIds.filter((id) => !matchesWorkshop(id));
      return { draft: { ...draft, downloadOnlyWorkshopIds }, warningsAcknowledged: false };
    }
    case "move-mod": {
      const { index, direction } = edit;
      const target = index + direction;
      const selectedModEntryIds = [...draft.selectedModEntryIds];
      if (!Number.isInteger(index) || index < 0 || index >= selectedModEntryIds.length ||
          target < 0 || target >= selectedModEntryIds.length ||
          selectedModEntryIds[index] === selectedModEntryIds[target]) return state;
      [selectedModEntryIds[index], selectedModEntryIds[target]] = [selectedModEntryIds[target], selectedModEntryIds[index]];
      return { draft: { ...draft, selectedModEntryIds }, warningsAcknowledged: false };
    }
  }
}

function indexModEntries(catalog: readonly ProfileCatalogItem[]) {
  const entries = new Map<string, { workshop: ProfileCatalogItem; modId: string }>();
  for (const workshop of catalog) {
    for (const entry of workshop.modIds) entries.set(entry.id, { workshop, modId: entry.value });
  }
  return entries;
}

type ProfileSavePreparation =
  | { status: "ready"; payload: ProfileDraft }
  | { status: "blocked"; errors: string[] };

function prepareSave(draft: ProfileDraft, entries: ReturnType<typeof indexModEntries>): ProfileSavePreparation {
  const errors: string[] = [];
  if (!draft.profileId.trim()) errors.push("프로필 식별자가 없습니다.");
  if (!Number.isSafeInteger(draft.revision) || draft.revision < 0 || draft.revision === Number.MAX_SAFE_INTEGER) {
    errors.push("프로필 버전을 확인해 주세요.");
  }
  for (const id of draft.selectedModEntryIds) {
    if (!entries.has(id)) errors.push(`카탈로그에서 선택한 Mod ID 참조 ${id}를 찾을 수 없습니다.`);
  }
  const downloads = new Set<string>();
  for (const id of draft.downloadOnlyWorkshopIds) {
    const workshopId = canonicalWorkshopId(id);
    if (!workshopId) errors.push(`다운로드 전용 Workshop ID ${id}의 형식을 확인해 주세요.`);
    else downloads.add(workshopId);
  }
  if (errors.length > 0) return { status: "blocked", errors };

  return {
    status: "ready",
    payload: { ...draft, selectedModEntryIds: [...draft.selectedModEntryIds], downloadOnlyWorkshopIds: [...downloads] }
  };
}

export function prepareProfileDraftSave(draft: ProfileDraft, catalog: readonly ProfileCatalogItem[]) {
  return prepareSave(draft, indexModEntries(catalog));
}

export function evaluateProfileEditor(
  state: ProfileEditorState,
  catalog: readonly ProfileCatalogItem[],
  options: Pick<ServerConfigOptions, "modIdPrefix"> & Pick<ServerConfigInput, "relationships">
) {
  const { draft, warningsAcknowledged } = state;
  const entries = indexModEntries(catalog);
  const selectedMods = draft.selectedModEntryIds.map((id) => {
    const entry = entries.get(id);
    return { id, workshopId: entry?.workshop.workshopId, modId: entry?.modId ?? "", isArchived: entry?.workshop.isArchived ?? false };
  });
  const downloads = new Set(draft.downloadOnlyWorkshopIds.map(canonicalWorkshopId));
  const archivedWorkshopIds = [
    ...selectedMods.flatMap(({ isArchived, workshopId }) => isArchived && workshopId ? [workshopId] : []),
    ...catalog.filter((workshop) => workshop.isArchived && downloads.has(canonicalWorkshopId(workshop.workshopId)))
      .map((workshop) => workshop.workshopId)
  ];
  const output = buildServerConfig({
    catalog: catalog.map(({ workshopId, modIds }) => ({ workshopId, modIds: modIds.map(({ value }) => value) })),
    selectedMods,
    downloadOnlyWorkshopIds: draft.downloadOnlyWorkshopIds,
    archivedWorkshopIds,
    relationships: options.relationships
  }, { modIdPrefix: options.modIdPrefix, warningsAcknowledged });
  return { selectedMods, output, save: prepareSave(draft, entries) };
}
