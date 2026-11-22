import Link from "next/link";
import { notFound } from "next/navigation";
import { getOwnerAccess } from "@/lib/auth";
import { extractCatalogResearchSources, isCatalogModUuid } from "@/lib/catalog-read";
import { isTestCategoryWriteAllowed } from "@/lib/category-persistence-input";
import { ModCategoryPanel } from "@/components/ModCategoryPanel";

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
  const { data, error } = await access.supabase.from("mods")
    .select("id,title,description,workshop_id,source_url,verification_status,build_compatibility,multiplayer_compatibility,researched_at,is_archived,created_at,updated_at")
    .eq("owner_id", access.user.id).eq("id", id).maybeSingle();
  if (error || !data) notFound();
  const mod = data as CatalogDetail;
  const [{ data: ids, error: idsError }, { data: records, error: recordsError }] = await Promise.all([
    access.supabase.from("mod_ids").select("value").eq("mod_id", id).order("value").limit(50),
    access.supabase.from("research_records").select("raw_payload,created_at").eq("mod_id", id)
      .order("created_at", { ascending: false }).limit(20)
  ]);
  const sources = extractCatalogResearchSources(records ?? []);
  const steamLink = `https://steamcommunity.com/sharedfiles/filedetails/?id=${mod.workshop_id}`;

  return (
    <section className="space-y-5">
      <Link href="/mods" className="text-sm text-[#b9efb0] underline">모드 목록으로</Link>
      <div className="panel space-y-3 p-5 sm:p-7">
        <p className="kicker">WORKSHOP {mod.workshop_id}</p>
        <h1 className="break-words text-2xl font-bold sm:text-3xl">{mod.title}</h1>
        {mod.is_archived && <p className="text-sm text-amber-200">보관된 모드</p>}
        <p className="muted whitespace-pre-wrap text-sm leading-6">{mod.description || "설명이 없습니다."}</p>
        <a href={steamLink} target="_blank" rel="noopener noreferrer"
          className="inline-block break-all text-sm text-[#b9efb0] underline">Steam Workshop 원문 열기</a>
      </div>
      <div className="panel space-y-3 p-5">
        <h2 className="text-lg font-bold">실제 Mod ID</h2>
        {idsError && <p role="alert" className="text-sm text-red-300">Mod ID를 읽지 못했습니다.</p>}
        <ul className="space-y-2 text-sm">
          {(ids ?? []).map(item => <li key={item.value} className="rounded-lg bg-[#152333] p-2 font-mono break-all">{item.value}</li>)}
        </ul>
        {!idsError && !ids?.length && <p className="muted text-sm">실제 Mod ID 미확인. Workshop ID로 대체하지 않습니다.</p>}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <p>조사 상태: {mod.verification_status}</p><p>B42.22: {mod.build_compatibility}</p>
          <p>멀티: {mod.multiplayer_compatibility}</p><p>확인일: {mod.researched_at || "미확인"}</p>
        </div>
        <p className="muted text-xs">싱글플레이 및 서버 중간 추가는 별도 상태로 보관되며, 아래 조사 기록의 근거를 확인해야 합니다.</p>
      </div>
      <ModCategoryPanel modId={id} writeEnabled={isTestCategoryWriteAllowed(process.env)} />
      <div className="panel space-y-3 p-5">
        <h2 className="text-lg font-bold">조사 기록과 출처</h2>
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
      </div>
    </section>
  );
}
