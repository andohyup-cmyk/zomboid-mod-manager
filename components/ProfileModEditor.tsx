"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from "react";
import { createPortableProfile, parsePortableProfile } from "@/lib/profile-portable";
import { ProfileModOrderList } from "@/components/ProfileModOrderList";
import type { ServerConfigInput } from "@/lib/server-config";
import { ProfileServerOutput } from "@/components/ProfileServerOutput";
import { ProfileOrderPreview } from "@/components/ProfileOrderPreview";
import { useProfileEditorCatalog } from "@/components/useProfileEditorCatalog";
import {
  PROFILE_CATALOG_PAGE_SIZE,
  PROFILE_CATALOG_SEARCH_LIMIT,
  type EditorCatalogPage
} from "@/lib/profile-editor-catalog";
import { addProfileModSelections, type ProfileModAddition } from "@/lib/profile-mod-id-integration";
import {
  getEnabledProfileMods,
  updateProfileModState,
  type ProfileModSelection
} from "@/lib/profile-mod-id-state";
import { moveProfileMod, profileModKey } from "@/lib/profile-mod-order";
import {
  calculateProfileOrderPreview,
  getApplicableProfileOrder,
  isCurrentProfileOrderPreview,
  type ProfileOrderPreview as OrderPreview,
  type ProfileOrderPreviewOptions
} from "@/lib/profile-order-preview";
import { describeFreeSelection } from "@/lib/group-selection-rule";
import { SelectionGroupPanel } from "@/components/SelectionGroupPanel";
import { toSelectionGroupRules, type StoredSelectionGroup } from "@/lib/selection-group-input";
import { stripWorkshopSuffixFromTitle } from "@/lib/steam-description";
import { validateProfileSelection, type ProfileSelectionError } from "@/lib/profile-selection";

const tabs = [
  { id: "add", label: "모드 추가" },
  { id: "selected", label: "선택한 모드" }
] as const;
type EditorTab = typeof tabs[number]["id"];

const errorMessages: Record<ProfileSelectionError["code"], string> = {
  "missing-workshop-id": "Workshop ID가 비어 있습니다.",
  "missing-mod-id": "Mod ID가 비어 있습니다.",
  "unknown-workshop-id": "카탈로그에서 Workshop을 찾을 수 없습니다.",
  "unknown-mod-id": "이 Workshop의 카탈로그에 없는 Mod ID입니다."
};

/** The server-output section is hidden for now; flip to true to show it again. */
const SHOW_SERVER_OUTPUT = false;

export type ProfileSummaryItem = Readonly<{ id: string; name: string }>;

type SnapshotWorkshopMeta = Readonly<{
  title: string;
  isArchived: boolean;
  primaryCategory: Readonly<{ id: string; label: string }> | null;
}>;

const EMPTY_PROFILES: readonly ProfileSummaryItem[] = [];

export function ProfileModEditor({
  recommendationOptions,
  relationships,
  groupWriteEnabled = false,
  profileWriteEnabled = false,
  initialProfiles = EMPTY_PROFILES,
  initialProfileId = null,
  initialCatalogPage = null,
  initialGroups
}: {
  recommendationOptions: ProfileOrderPreviewOptions;
  relationships?: ServerConfigInput["relationships"];
  groupWriteEnabled?: boolean;
  profileWriteEnabled?: boolean;
  initialProfiles?: readonly ProfileSummaryItem[];
  initialProfileId?: string | null;
  initialCatalogPage?: EditorCatalogPage | null;
  initialGroups?: readonly StoredSelectionGroup[];
}) {
  const router = useRouter();
  const [createdProfiles, setCreatedProfiles] = useState<ProfileSummaryItem[]>([]);
  const profiles = useMemo(() => {
    const seen = new Set(initialProfiles.map((p) => p.id));
    return [...createdProfiles.filter((p) => !seen.has(p.id)), ...initialProfiles];
  }, [createdProfiles, initialProfiles]);
  const [activeProfileId, setActiveProfileId] = useState<string>(initialProfileId ?? "");
  const [savedRevision, setSavedRevision] = useState<number | null>(null);
  const [loadNonce, setLoadNonce] = useState(0);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [creatingProfile, setCreatingProfile] = useState(false);
  const [newProfileName, setNewProfileName] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [dbFeedback, setDbFeedback] = useState<{ message: string; error?: boolean; stale?: boolean } | null>(null);
  const [snapshotMeta, setSnapshotMeta] = useState<Record<string, SnapshotWorkshopMeta>>({});
  const skipLoadIdRef = useRef<string | null>(null);

  const [storedGroups, setStoredGroups] = useState<readonly StoredSelectionGroup[]>(() => initialGroups ?? []);
  const groupRules = useMemo(() => toSelectionGroupRules(storedGroups), [storedGroups]);
  const { catalog: catalogPage, loadCatalog } = useProfileEditorCatalog(initialCatalogPage);
  const { knownEntries, request: catalogRequest, status: catalogStatus, nextCursor } = catalogPage;
  const [tab, setTab] = useState<EditorTab>("add");
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<readonly ProfileModAddition[]>([]);
  const [modInfoNotes, setModInfoNotes] = useState<ReadonlyMap<string, { warnings: number; infos: number }> | undefined>();
  const [selections, setSelections] = useState<readonly ProfileModSelection[]>([]);
  const [orderPreview, setOrderPreview] = useState<OrderPreview | null>(null);
  const [downloads, setDownloads] = useState<readonly string[]>([]);
  const [confirmedDownloads, setConfirmedDownloads] = useState<readonly string[]>([]);
  const [confirmed, setConfirmed] = useState<readonly ProfileModSelection[]>([]);
  const [errors, setErrors] = useState<ProfileSelectionError[]>([]);
  const [notice, setNotice] = useState<{ message: string; error?: boolean } | null>(null);
  const review = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!activeProfileId) return;
    if (skipLoadIdRef.current === activeProfileId) {
      skipLoadIdRef.current = null;
      return;
    }
    const controller = new AbortController();
    async function loadSnapshot() {
      setLoadingProfile(true);
      setDbFeedback(null);
      try {
        const response = await fetch(
          `/api/profile-snapshots?profileId=${encodeURIComponent(activeProfileId)}`,
          { cache: "no-store", signal: controller.signal }
        );
        const body = (await response.json().catch(() => ({}))) as {
          revision?: number;
          selections?: { workshopId: string; modId: string; modIdUuid?: string; enabled: boolean }[];
          downloadOnlyWorkshopIds?: string[];
          catalogMeta?: { byWorkshopId?: Record<string, SnapshotWorkshopMeta> };
          error?: string;
        };
        if (!response.ok) {
          throw new Error(body.error || "저장된 프로필을 불러오지 못했습니다.");
        }
        const metaByWorkshop = body.catalogMeta?.byWorkshopId ?? {};
        const loadedSelections: ProfileModSelection[] = (body.selections ?? []).map((item) => {
          const primaryCategoryId = metaByWorkshop[item.workshopId]?.primaryCategory?.id;
          return {
            workshopId: item.workshopId,
            modId: item.modId,
            ...(item.modIdUuid ? { modIdUuid: item.modIdUuid } : {}),
            ...(primaryCategoryId ? { primaryCategoryId } : {}),
            enabled: item.enabled
          };
        });
        const loadedDownloads = body.downloadOnlyWorkshopIds ?? [];
        const rev = typeof body.revision === "number" ? body.revision : 0;
        setSnapshotMeta(metaByWorkshop);
        setSelections(loadedSelections);
        setConfirmed(loadedSelections);
        setDownloads(loadedDownloads);
        setConfirmedDownloads(loadedDownloads);
        setSavedRevision(rev);
        setPending([]);
        setOrderPreview(null);
        setErrors([]);
        setDbFeedback({
          message: rev > 0
            ? `저장본 v${rev} 불러옴 (Mod ID ${loadedSelections.length}개)`
            : "아직 저장된 조합이 없는 새 프로필입니다. 모드를 고른 뒤 DB에 저장하세요."
        });
      } catch (err) {
        if (controller.signal.aborted) return;
        setDbFeedback({
          message: err instanceof Error ? err.message : "저장된 프로필을 불러오지 못했습니다.",
          error: true
        });
      } finally {
        if (!controller.signal.aborted) setLoadingProfile(false);
      }
    }
    void loadSnapshot();
    return () => controller.abort();
  }, [activeProfileId, loadNonce]);

  const catalog = useMemo(() => knownEntries.map(({ workshopId, modIds }) => ({
    workshopId, modIds: modIds.map(({ value }) => value)
  })), [knownEntries]);
  const titles = useMemo(() => {
    const map = new Map<string, string>();
    for (const [workshopId, meta] of Object.entries(snapshotMeta)) {
      map.set(workshopId, meta.title);
    }
    for (const entry of knownEntries) {
      map.set(entry.workshopId, entry.title);
    }
    return map;
  }, [knownEntries, snapshotMeta]);
  const categories = useMemo(() => {
    const labels = new Map<string, string>();
    for (const meta of Object.values(snapshotMeta)) {
      if (meta.primaryCategory) labels.set(meta.primaryCategory.id, meta.primaryCategory.label);
    }
    for (const entry of knownEntries) {
      if (entry.category) labels.set(entry.category.id, entry.category.label);
    }
    return labels;
  }, [knownEntries, snapshotMeta]);
  const archivedInProfileCount = useMemo(() => {
    const archivedWorkshops = new Set<string>();
    for (const sel of selections) {
      if (snapshotMeta[sel.workshopId]?.isArchived) archivedWorkshops.add(sel.workshopId);
    }
    for (const wid of downloads) {
      if (snapshotMeta[wid]?.isArchived) archivedWorkshops.add(wid);
    }
    return archivedWorkshops.size;
  }, [selections, downloads, snapshotMeta]);
  const selectedKeys = useMemo(() => new Set(selections.map(profileModKey)), [selections]);
  const pendingKeys = useMemo(() => new Set(pending.map(profileModKey)), [pending]);
  const warnings = useMemo(() => validateProfileSelection(catalog, selections).warnings, [catalog, selections]);
  const enabledCount = getEnabledProfileMods(selections).length;
  const currentPreview = orderPreview !== null
    && isCurrentProfileOrderPreview(orderPreview, selections, recommendationOptions);
  const applicableOrder = orderPreview
    ? getApplicableProfileOrder(orderPreview, selections, recommendationOptions)
    : null;
  const hasChanges = downloads.length !== confirmedDownloads.length
    || downloads.some((id, index) => confirmedDownloads[index] !== id)
    || selections.length !== confirmed.length || selections.some((selection, index) => {
    const previous = confirmed[index];
    return profileModKey(selection) !== profileModKey(previous)
      || selection.enabled !== previous.enabled
      || selection.primaryCategoryId !== previous.primaryCategoryId;
  });

  const visibleCatalog = catalogStatus === "denied" ? [] : catalogPage.entries;

  function selectTab(event: KeyboardEvent<HTMLButtonElement>) {
    const { key } = event;
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(key)) return;
    event.preventDefault();
    const next = key === "Home" ? "add" : key === "End" ? "selected" : tab === "add" ? "selected" : "add";
    setTab(next);
    document.getElementById(`profile-editor-tab-${next}`)?.focus();
  }

  function toggleCandidate(candidate: ProfileModAddition) {
    const key = profileModKey(candidate);
    setErrors([]);
    setNotice(null);
    setPending((current) => current.some((item) => profileModKey(item) === key)
      ? current.filter((item) => profileModKey(item) !== key)
      : [...current, candidate]);
  }

  function addCandidates() {
    if (catalogStatus === "denied") return;
    const result = addProfileModSelections(catalog, selections, pending);
    if (!result.ok) {
      setNotice(null);
      setErrors(result.errors);
      return;
    }
    setNotice({ message: `Mod ID ${result.selections.length - selections.length}개를 임시 목록에 추가했습니다.` });
    setErrors([]);
    setPending([]);
    setSelections(result.selections);
  }

  function changeState(selection: ProfileModSelection, action: "enable" | "disable" | "remove") {
    setSelections((current) => updateProfileModState(current, selection, action));
    const verb = { enable: "활성화", disable: "비활성화", remove: "제거" }[action];
    setNotice({ message: `${selection.modId} ${verb} 완료` });
  }

  function move(from: number, to: number) {
    if (from === to) {
      setNotice(null);
      return;
    }
    setSelections((current) => moveProfileMod(current, from, to));
    setNotice({ message: `${from}번 항목을 ${to}번 위치로 이동했습니다.` });
  }

  function applyRecommendation() {
    if (!orderPreview || !applicableOrder) return;
    setSelections((current) => getApplicableProfileOrder(orderPreview, current, recommendationOptions) ?? current);
    setOrderPreview(null);
    setNotice({ message: "추천 순서를 임시 목록에 반영했습니다. 변경사항 확인에서 확정할 수 있습니다." });
  }

  function toggleDownload(id: string) {
    setDownloads((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function confirm() {
    setConfirmed(selections);
    setConfirmedDownloads(downloads);
    setNotice({ message: "현재 탭에서 임시 편집을 확정했습니다." });
    review.current?.close();
  }

  function downloadPortableDraft() {
    const json = JSON.stringify(createPortableProfile(selections, downloads), null, 2);
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "zomboid-profile-draft.json";
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice({ message: "임시 프로필 JSON 파일을 만들었습니다. DB 저장 및 서버 설정 변경은 없습니다." });
  }

  async function importPortableDraft(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 250000) {
      setNotice({ message: "프로필 JSON 파일은 250KB 이하여야 합니다.", error: true });
      return;
    }
    try {
      const parsed = parsePortableProfile(JSON.parse(await file.text()) as unknown);
      if (!parsed.profile) {
        setNotice({ message: parsed.error ?? "프로필 파일 형식이 올바르지 않습니다.", error: true });
        return;
      }
      if (!window.confirm("현재 임시 선택 목록을 파일 내용으로 바꾸시겠습니까? DB와 게임 서버는 변경되지 않습니다.")) return;
      setSelections(parsed.profile.selections);
      setDownloads(parsed.profile.downloadOnlyWorkshopIds);
      setPending([]);
      setOrderPreview(null);
      setErrors([]);
      setNotice({ message: "프로필을 임시 편집 목록으로 불러왔습니다. 카탈로그 존재 여부·실제 게임 호환성을 검증해야 합니다." });
    } catch {
      setNotice({ message: "프로필 JSON 파일을 읽거나 검증할 수 없습니다.", error: true });
    }
  }

  async function handleCreateProfile(event: FormEvent) {
    event.preventDefault();
    if (!profileWriteEnabled || creatingProfile) return;
    const trimmed = newProfileName.trim();
    if (!trimmed) {
      setDbFeedback({ message: "프로필 이름을 입력해 주세요.", error: true });
      return;
    }
    setCreatingProfile(true);
    setDbFeedback(null);
    try {
      const response = await fetch("/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed })
      });
      const body = (await response.json().catch(() => ({}))) as {
        profile?: { id: string; name: string };
        error?: string;
      };
      if (!response.ok || !body.profile?.id) {
        throw new Error(body.error || "프로필을 만들지 못했습니다.");
      }
      const created = { id: body.profile.id, name: body.profile.name };
      // Keep any unsaved selections the user already built in this tab.
      skipLoadIdRef.current = created.id;
      setCreatedProfiles((current) => [created, ...current]);
      setActiveProfileId(created.id);
      setSavedRevision(0);
      setNewProfileName("");
      setShowCreateForm(false);
      setDbFeedback({ message: `'${created.name}' 프로필을 만들었습니다. 아래 'DB에 저장'을 눌러 현재 조합을 저장하세요.` });
      router.refresh();
    } catch (err) {
      setDbFeedback({
        message: err instanceof Error ? err.message : "프로필을 만들지 못했습니다.",
        error: true
      });
    } finally {
      setCreatingProfile(false);
    }
  }

  async function handleSaveToDb() {
    if (!profileWriteEnabled || !activeProfileId || savingProfile || loadingProfile) return;
    setSavingProfile(true);
    setDbFeedback(null);
    try {
      const response = await fetch("/api/profile-snapshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId: activeProfileId,
          expectedRevision: savedRevision ?? 0,
          selections: selections.map((item) => ({
            workshopId: item.workshopId,
            modId: item.modId,
            enabled: item.enabled
          })),
          downloadOnlyWorkshopIds: [...downloads]
        })
      });
      const body = (await response.json().catch(() => ({}))) as {
        revision?: number;
        error?: string;
      };
      if (response.status === 409) {
        setDbFeedback({
          message: body.error || "다른 기기에서 먼저 저장했습니다. '다시 불러오기'를 눌러 주세요.",
          error: true,
          stale: true
        });
        return;
      }
      if (!response.ok) {
        throw new Error(body.error || "프로필 DB 저장에 실패했습니다.");
      }
      const nextRev = typeof body.revision === "number" ? body.revision : (savedRevision ?? 0) + 1;
      setSavedRevision(nextRev);
      setConfirmed(selections);
      setConfirmedDownloads(downloads);
      setDbFeedback({ message: `DB에 저장 완료 (v${nextRev} · Mod ID ${selections.length}개)` });
      router.refresh();
    } catch (err) {
      setDbFeedback({
        message: err instanceof Error ? err.message : "프로필 DB 저장에 실패했습니다.",
        error: true
      });
    } finally {
      setSavingProfile(false);
    }
  }

  return (
    <section className="mx-auto max-w-3xl space-y-5">
      <header>
        <Link href="/profiles" className="inline-flex min-h-10 items-center text-sm font-semibold text-[#a8d49d]">
          <span aria-hidden="true" className="mr-2">←</span>서버 프로필
        </Link>
        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Mod ID 편집</h1>
      </header>

      <div className="panel space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold">서버 프로필 DB 저장 · 불러오기</h2>
          {savedRevision !== null && activeProfileId && (
            <span className="rounded-md bg-[#234332] px-2 py-0.5 text-[11px] font-semibold text-[#b9efb0]">
              {savedRevision > 0 ? `저장본 v${savedRevision}` : "미저장"}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="sr-only" htmlFor="active-profile-select">저장할 서버 프로필 선택</label>
          <select
            id="active-profile-select"
            value={activeProfileId}
            disabled={loadingProfile || savingProfile}
            onChange={(event) => {
              const nextId = event.target.value;
              setActiveProfileId(nextId);
              if (!nextId) {
                setSavedRevision(null);
                setDbFeedback(null);
                setSnapshotMeta({});
              }
            }}
            className="field min-w-0 flex-1 text-sm"
          >
            <option value="">임시 편집 (프로필 미선택)</option>
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>{profile.name}</option>
            ))}
          </select>
          {profileWriteEnabled && (
            <button
              type="button"
              onClick={() => setShowCreateForm((open) => !open)}
              className="secondary-action shrink-0 px-3 text-xs"
            >
              {showCreateForm ? "닫기" : "+ 새 프로필"}
            </button>
          )}
        </div>

        {showCreateForm && profileWriteEnabled && (
          <form onSubmit={(event) => { void handleCreateProfile(event); }} className="flex gap-2">
            <label className="sr-only" htmlFor="inline-new-profile-name">새 프로필 이름</label>
            <input
              id="inline-new-profile-name"
              type="text"
              maxLength={120}
              value={newProfileName}
              onChange={(event) => setNewProfileName(event.target.value)}
              placeholder="새 프로필 이름 (예: B42 멀티 서버)"
              className="field min-w-0 flex-1 text-sm"
            />
            <button type="submit" disabled={creatingProfile} className="action shrink-0 text-xs">
              {creatingProfile ? "생성 중" : "생성"}
            </button>
          </form>
        )}

        {activeProfileId && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!profileWriteEnabled || savingProfile || loadingProfile}
              onClick={() => { void handleSaveToDb(); }}
              className="action flex-1 text-xs"
            >
              {!profileWriteEnabled
                ? "이 환경에서는 DB 저장 불가"
                : savingProfile
                  ? "DB 저장 중..."
                  : `DB에 저장 (${selections.length}개)`}
            </button>
            <button
              type="button"
              disabled={loadingProfile || savingProfile}
              onClick={() => setLoadNonce((n) => n + 1)}
              className="secondary-action shrink-0 px-3 text-xs"
            >
              {loadingProfile ? "불러오는 중..." : "다시 불러오기"}
            </button>
          </div>
        )}

        {dbFeedback && (
          <p role={dbFeedback.error ? "alert" : "status"} className={`text-xs ${dbFeedback.error ? "text-red-300" : "text-[#b9efb0]"}`}>
            {dbFeedback.message}
          </p>
        )}

        <details className="border-t border-[#304154] pt-2.5">
          <summary className="muted cursor-pointer text-xs font-semibold">임시 프로필 JSON 파일 내보내기 / 불러오기</summary>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <button type="button" className="secondary-action text-xs" onClick={downloadPortableDraft}>현재 선택 JSON 내려받기</button>
            <label className="secondary-action cursor-pointer text-xs">
              JSON 파일 불러오기
              <input type="file" accept=".json,application/json" className="sr-only" onChange={event => { void importPortableDraft(event); }} />
            </label>
          </div>
        </details>
      </div>

      <div role="tablist" aria-label="Mod ID 편집" className="grid grid-cols-2 gap-1 rounded-2xl border border-[#304154] bg-[#111c29] p-1">
        {tabs.map(({ id, label }) => (
          <button
            key={id}
            id={`profile-editor-tab-${id}`}
            type="button"
            role="tab"
            aria-selected={tab === id}
            aria-controls={`profile-editor-panel-${id}`}
            tabIndex={tab === id ? 0 : -1}
            onClick={() => setTab(id)}
            onKeyDown={selectTab}
            className={`min-h-12 rounded-xl px-2 text-sm font-bold ${tab === id ? "bg-[#294535] text-[#d5efc9]" : "text-[#a5b6c7] hover:bg-[#1b2a39]"}`}
          >
            {label}{id === "selected" && <span className="ml-1.5 tabular-nums">{selections.length}</span>}
          </button>
        ))}
      </div>

      <div className="panel flex flex-wrap items-center justify-between gap-x-4 gap-y-2 p-3.5">
        <div className="text-sm">
          <p className="font-semibold text-[#e2ebf4]">활성 {enabledCount}개 · 비활성 {selections.length - enabledCount}개</p>
          {hasChanges && <p className="mt-1 text-xs text-[#d8bc87]">확정 전 변경사항</p>}
        </div>
        <button
          type="button"
          className="action min-h-11 text-sm"
          disabled={!hasChanges}
          onClick={() => review.current?.showModal()}
        >
          변경사항 확인
        </button>
      </div>

      <p role="status" className={notice && !notice.error ? "text-sm text-[#b9e6ae]" : "sr-only"}>
        {notice && !notice.error ? notice.message : ""}
      </p>
      {notice?.error && (
        <p role="alert" className="rounded-xl border border-[#84414a] bg-[#3d222a] p-3.5 text-sm text-[#ffd2d5]">
          {notice.message}
        </p>
      )}

      {archivedInProfileCount > 0 && (
        <section aria-label="보관된 모드 알림" className="rounded-xl border border-[#67532e] bg-[#302717] p-3.5 text-sm text-[#f2d6a0]">
          <p className="font-bold">보관된 모드 {archivedInProfileCount}개가 이 프로필에 포함되어 있습니다.</p>
          <p className="mt-1 text-xs leading-5 text-[#e6cf9e]">
            기존 프로필 구성은 자동으로 제거되지 않습니다. 카탈로그에서 모드를 복원하거나, 필요하면 선택한 모드 탭에서 직접 제거 후 DB에 저장하세요.
          </p>
        </section>
      )}

      {warnings.length > 0 && (
        <section aria-label="선택 경고" className="rounded-xl border border-[#67532e] bg-[#302717] p-3.5 text-sm text-[#f2d6a0]">
          <h2 className="font-bold">경고 · 조회한 카탈로그에서 여러 Workshop이 제공하는 Mod ID</h2>
          <ul className="mt-2 grid gap-2">
            {warnings.map(({ modId, workshopIds }) => (
              <li key={modId} className="[overflow-wrap:anywhere]">
                <span className="font-mono font-semibold">{modId}</span>
                <span className="ml-2">Workshop ID {workshopIds.join(", ")}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div role="tabpanel" id="profile-editor-panel-add" aria-labelledby="profile-editor-tab-add" hidden={tab !== "add"}>
        <div className="space-y-4">
          <div className="panel sticky top-2 z-10 space-y-3 p-3.5 sm:p-4">
            <form className="space-y-2" onSubmit={(event) => {
              event.preventDefault();
              loadCatalog(query.trim());
            }}>
              <label htmlFor="profile-catalog-search" className="block text-sm font-bold">카탈로그 검색</label>
              <div className="flex gap-2">
                <input
                  id="profile-catalog-search"
                  className="field min-w-0"
                  type="search"
                  placeholder="모드 이름, Mod ID, Workshop ID"
                  maxLength={PROFILE_CATALOG_SEARCH_LIMIT}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                <button type="submit" className="secondary-action shrink-0 text-sm">검색</button>
              </div>
            </form>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="muted text-sm">추가 대기 {pending.length}개</p>
              <button type="button" className="action min-h-11 text-sm" disabled={!pending.length || catalogStatus === "denied"} onClick={addCandidates}>
                선택한 Mod ID 추가
              </button>
            </div>
          </div>

          {errors.length > 0 && (
            <section role="alert" className="rounded-xl border border-[#84414a] bg-[#3d222a] p-3.5 text-sm text-[#ffd2d5]">
              <h2 className="font-bold">검증 오류</h2>
              <ul className="mt-2 grid gap-1.5">
                {errors.map((error) => (
                  <li key={`${error.index}-${error.code}`}>
                    {pending[error.index]?.modId || `${error.index + 1}번 선택`} · {errorMessages[error.code]}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {catalogStatus === "loading" && (
            <p role="status" className="panel muted p-4 text-sm">카탈로그를 불러오는 중입니다.</p>
          )}
          {(catalogStatus === "error" || catalogStatus === "denied") && (
            <div className="panel space-y-2 p-4 text-sm">
              <p role="alert" className="text-[#ffd2d5]">{catalogStatus === "denied"
                ? "카탈로그 조회 권한이 없습니다. 로그인과 계정 권한을 확인하세요."
                : "카탈로그를 불러오지 못했습니다."}</p>
              <button
                type="button"
                className="secondary-action min-h-11 text-sm"
                onClick={() => loadCatalog(catalogRequest.query, catalogRequest.after)}
              >
                다시 불러오기
              </button>
            </div>
          )}
          {catalogStatus === "ready" && visibleCatalog.length === 0 && (
            <p className="panel muted p-5 text-sm">{catalogRequest.query
              ? "검색 결과가 없습니다."
              : "보관되지 않은 등록 모드가 없습니다."}</p>
          )}
          {visibleCatalog.length > 0 && (
            <p className="muted text-xs">
              {catalogRequest.query ? "검색 결과" : "카탈로그"} {visibleCatalog.length}개 표시 · 한 번에 최대 {PROFILE_CATALOG_PAGE_SIZE}개씩 조회
            </p>
          )}
          {visibleCatalog.map((entry) => (
            <article key={entry.workshopId} className="panel min-w-0 p-3.5 sm:p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="text-base font-bold [overflow-wrap:anywhere]">{stripWorkshopSuffixFromTitle(entry.title)}</h2>
                  <p className="muted mt-1 text-xs [overflow-wrap:anywhere]">
                    Workshop ID <span className="font-mono">{entry.workshopId}</span>
                  </p>
                </div>
                <span className="rounded-md bg-[#26384a] px-2 py-1 text-xs text-[#d0e0ef]">카테고리 {entry.category?.label ?? "미확인"}</span>
              </div>
              <label className="mt-2 flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" checked={downloads.includes(entry.workshopId)}
                  aria-label={`다운로드 전용 Workshop ID ${entry.workshopId}`}
                  onChange={() => toggleDownload(entry.workshopId)} />
                다운로드 전용으로 포함
              </label>
              {entry.modIds.length > 1 && (
                <div className="mt-3 rounded-lg border border-[#3d4f63] bg-[#132131] px-2.5 py-2 text-xs leading-5">
                  <p className="font-semibold text-[#d9e6f2]">
                    {describeFreeSelection(entry.modIds.length, entry.modIds.filter(({ value }) => {
                      const k = profileModKey({ workshopId: entry.workshopId, modId: value });
                      return selectedKeys.has(k) || pendingKeys.has(k);
                    }).length)}
                  </p>
                  <p className="muted">Mod ID가 여러 개입니다. 자동으로 함께 활성화하지 않으니 필요한 것만 직접 고르세요. 필수·배타 여부는 미확인입니다.</p>
                </div>
              )}
              {entry.modIds.length ? (
                <div role="group" aria-label={`${entry.title} · 게임 Mod ID`} className="mt-3 grid gap-1.5 sm:grid-cols-2">
                  {entry.modIds.map(({ value: modId, uuid }) => {
                    const candidate = { workshopId: entry.workshopId, modId, modIdUuid: uuid, primaryCategoryId: entry.category?.id };
                    const key = profileModKey(candidate);
                    const alreadySelected = selectedKeys.has(key);
                    return (
                      <label
                        key={key}
                        className={`flex min-h-12 min-w-0 items-center gap-2.5 rounded-xl border px-2.5 py-2 text-sm ${alreadySelected ? "border-[#355545] bg-[#1b3228]" : "cursor-pointer border-[#304154] bg-[#101a26] hover:border-[#6b8978]"}`}
                      >
                        <input
                          type="checkbox"
                          className="h-5 w-5 shrink-0 accent-[#8fcb85]"
                          aria-label={`Mod ID ${modId} · Workshop ID ${entry.workshopId}`}
                          checked={alreadySelected || pendingKeys.has(key)}
                          disabled={alreadySelected}
                          onChange={() => toggleCandidate(candidate)}
                        />
                        <span className="min-w-0 flex-1 font-mono [overflow-wrap:anywhere]">{modId}</span>
                        {alreadySelected && <span className="shrink-0 text-xs text-[#bce3b2]">선택됨</span>}
                      </label>
                    );
                  })}
                </div>
              ) : <p className="muted mt-3 text-sm">확인된 Mod ID가 없습니다.</p>}
            </article>
          ))}
          {catalogStatus === "ready" && nextCursor !== null && (
            <button type="button" className="secondary-action min-h-11 w-full text-sm" onClick={() => loadCatalog(catalogRequest.query, nextCursor)}>
              {catalogRequest.query ? "검색 결과 더 불러오기" : "카탈로그 더 불러오기"}
            </button>
          )}
        </div>
      </div>

      <div role="tabpanel" id="profile-editor-panel-selected" aria-labelledby="profile-editor-tab-selected" hidden={tab !== "selected"}>
        <div className="mb-3 space-y-3">
          <button
            type="button"
            className="secondary-action min-h-11 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            disabled={enabledCount === 0}
            aria-expanded={orderPreview !== null}
            aria-controls={orderPreview ? "profile-recommendation" : undefined}
            onClick={() => setOrderPreview(calculateProfileOrderPreview(selections, recommendationOptions))}
          >
            추천 정렬
          </button>
          {orderPreview && (
            <ProfileOrderPreview
              preview={orderPreview}
              current={currentPreview}
              canApply={applicableOrder !== null}
              titles={titles}
              categories={categories}
              onCancel={() => setOrderPreview(null)}
              onApply={applyRecommendation}
            />
          )}
        </div>
        {selections.length ? (
          <div className="space-y-3">
            <p id="profile-order-help" className="muted text-sm leading-6">
              손잡이를 끌거나 순서 번호를 바꾼 뒤 Enter를 누르세요. 입력란을 벗어나도 적용됩니다.
            </p>
            <ProfileModOrderList
              selections={selections}
              titles={titles}
              categories={categories}
              modInfoNotes={modInfoNotes}
              onStateChange={changeState}
              onMove={move}
              onInvalidPosition={() => setNotice({ message: `순서를 1~${selections.length} 사이의 정수로 입력하세요.`, error: true })}
            />
          </div>
        ) : (
          <div className="panel p-5 text-sm">
            <p className="font-semibold">선택한 Mod ID가 없습니다.</p>
            <button type="button" className="secondary-action mt-3 min-h-11" onClick={() => setTab("add")}>모드 추가 열기</button>
          </div>
        )}
        {downloads.length > 0 && (
          <section aria-label="다운로드 전용 선택" className="panel mt-4 p-4 text-sm">
            <h2 className="font-bold">다운로드 전용 Workshop</h2>
            <ul className="mt-2 space-y-1">{downloads.map((id) => (
              <li key={id} className="flex items-center justify-between gap-2">
                <span>{titles.get(id)} · {id}</span>
                <button type="button" className="secondary-action min-h-11" aria-label={`다운로드 전용 ${id} 제거`} onClick={() => toggleDownload(id)}>제거</button>
              </li>
            ))}</ul>
          </section>
        )}
        {catalogStatus !== "denied" && (
          <SelectionGroupPanel
            selections={selections}
            writeEnabled={groupWriteEnabled}
            initialGroups={initialGroups}
            onGroupsChange={setStoredGroups}
          />
        )}
        {catalogStatus !== "denied" && (
          // Kept mounted but hidden (SHOW_SERVER_OUTPUT=false): reserved for later use, not deleted.
          <div hidden={!SHOW_SERVER_OUTPUT}>
          <ProfileServerOutput selectionGroups={groupRules} selections={selections} catalog={catalog} downloadOnlyWorkshopIds={downloads}
            recommendationOptions={recommendationOptions} relationships={relationships} onModInfoNotes={setModInfoNotes} />
          </div>
        )}
      </div>

      <dialog
        ref={review}
        aria-labelledby="profile-review-title"
        className="panel m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-lg p-0 text-[#ecf2f8] backdrop:bg-[#060b12cc]"
      >
        <div className="flex max-h-[90dvh] flex-col gap-4 p-4 sm:p-5">
          <header>
            <h2 id="profile-review-title" className="text-xl font-bold">변경사항 확인</h2>
            <p className="muted mt-2 text-sm leading-6">이 순서와 활성 상태를 현재 탭에서 확정합니다. 새로고침하면 확정 내용도 사라집니다.</p>
          </header>
          <p className="text-sm font-semibold">전체 {selections.length}개 · 활성 {enabledCount}개 · 비활성 {selections.length - enabledCount}개</p>
          {selections.length ? (
            <ol aria-label="확정할 Mod ID 순서" className="min-h-0 list-decimal space-y-1 overflow-auto rounded-xl bg-[#0e1722] py-2.5 pl-9 pr-3 text-sm">
              {selections.map((selection) => (
                <li key={profileModKey(selection)} className="rounded-md py-1 [overflow-wrap:anywhere]">
                  <span className="font-mono">{selection.modId}</span>
                  <p className="muted mt-0.5 text-xs">Workshop ID {selection.workshopId} · {selection.enabled ? "활성" : "비활성"}</p>
                </li>
              ))}
            </ol>
          ) : <p className="muted text-sm">선택 목록이 비어 있습니다.</p>}
          {downloads.length > 0 && <p className="text-sm">다운로드 전용 Workshop ID {downloads.join(", ")}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="secondary-action min-h-11 text-sm" onClick={() => review.current?.close()}>
              계속 편집
            </button>
            <button type="button" className="action min-h-11 text-sm" onClick={confirm}>임시 편집 확정</button>
          </div>
        </div>
      </dialog>
    </section>
  );
}
