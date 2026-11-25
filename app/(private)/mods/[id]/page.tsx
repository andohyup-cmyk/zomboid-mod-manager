import Link from "next/link";
import { notFound } from "next/navigation";
import { getOwnerAccess } from "@/lib/auth";
import { extractCatalogResearchSources, isCatalogModUuid } from "@/lib/catalog-read";
import { isCatalogWriteAllowed } from "@/lib/catalog-write-protection";
import { isTestCategoryWriteAllowed } from "@/lib/category-persistence-input";
import { ModCategoryPanel } from "@/components/ModCategoryPanel";
import { ModDetailEditor } from "@/components/ModDetailEditor";

export const dynamic = "force-dynamic";

type CatalogDetail = {
  id: string; title: string; description: string; workshop_id: string; source_url: string;
  verification_status: string; build_compatibility: string; multiplayer_compatibility: string;
  researched_at: string | null; is_archived: boolean; created_at: string; updated_at: string;
};

export default async function ModDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await getOwnerAccess();
  if (access.kind !== "authorized") return null;
  const { id } = await params;
  if (!isCatalogModUuid(id)) notFound();
  const [
    { data, error },
    { data: ids, error: idsError },
    { data: records, error: recordsError }
  ] = await Promise.all([
    access.supabase.from("mods")
      .select("id,title,description,workshop_id,source_url,verification_status,build_compatibility,multiplayer_compatibility,researched_at,is_archived,created_at,updated_at")
      .eq("owner_id", access.user.id).eq("id", id).maybeSingle(),
    access.supabase.from("mod_ids").select("id,value").eq("mod_id", id).order("value").limit(50),
    access.supabase.from("research_records").select("raw_payload,created_at").eq("mod_id", id)
      .order("created_at", { ascending: false }).limit(20)
  ]);
  if (error || !data) notFound();
  const mod = data as CatalogDetail;
  const sources = extractCatalogResearchSources(records ?? []);
  const steamLink = `https://steamcommunity.com/sharedfiles/filedetails/?id=${mod.workshop_id}`;
  const writeEnabled = isCatalogWriteAllowed(process.env, process.env.NEXT_PUBLIC_SUPABASE_URL)
    || isTestCategoryWriteAllowed(process.env);

  return (
    <section className="space-y-4">
      <Link href="/mods" className="inline-block py-2 text-sm text-[#b9efb0] underline">← 모드 목록</Link>
      <div className="panel space-y-3 p-5 sm:p-7">
        <p className="kicker">WORKSHOP {mod.workshop_id}</p>
        <h1 className="break-words text-2xl font-bold sm:text-3xl">{mod.title}</h1>
        {mod.is_archived && <p className="text-sm text-amber-200">보관된 모드</p>}
        <p className="muted whitespace-pre-wrap text-sm leading-6">{mod.description || "설명이 없습니다."}</p>
        <a href={steamLink} target="_blank" rel="noopener noreferrer"
          className="inline-block break-all text-sm text-[#b9efb0] underline">Steam Workshop 원문 열기</a>
      </div>
      <ModDetailEditor
        modId={id}
        initialModIds={(ids ?? []) as { id: string; value: string }[]}
        idsError={Boolean(idsError)}
        initialVerificationStatus={mod.verification_status}
        initialBuildCompatibility={mod.build_compatibility}
        initialMultiplayerCompatibility={mod.multiplayer_compatibility}
        initialResearchedAt={mod.researched_at}
        initialDescription={mod.description}
        initialIsArchived={mod.is_archived}
        writeEnabled={writeEnabled}
      />
      <ModCategoryPanel modId={id} writeEnabled={isTestCategoryWriteAllowed(process.env)} />
      <details className="panel space-y-3 p-5" open={sources.length > 0 && sources.length <= 2}>
        <summary className="cursor-pointer text-lg font-bold">조사 기록과 출처 ({sources.length})</summary>
        {recordsError && <p role="alert" className="text-sm text-red-300">조사 기록 조회에 실패했습니다.</p>}
        {!recordsError && sources.length === 0 && <p className="muted text-sm">확인 가능한 조사 기록이 없습니다.</p>}
        {sources.map(({ record, createdAt }, index) => (
          <article key={createdAt + index} className="space-y-2 border-t border-[#304154] pt-3">
            <p className="text-xs">기록: {createdAt} · 조사 확인일: {record.checkedAt || "미확인"}</p>
            <p className="text-sm">{record.title}</p>
            <div className="flex flex-wrap gap-2 text-xs">
              <span>싱글: {record.singleplayerCompatibility}</span>
              <span>서버 중간 추가: {record.midServerAdditionCompatibility}</span>
            </div>
            {record.sources.map(url => (
              <a key={url} href={url} target="_blank" rel="noopener noreferrer"
                className="block break-all text-xs text-[#b9efb0] underline">{url}</a>
            ))}
          </article>
        ))}
      </details>
    </section>
  );
}
