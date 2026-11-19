import Link from "next/link";
import { getOwnerAccess } from "@/lib/auth";

type CatalogMod = {
  id: string;
  title: string;
  workshop_id: string;
  verification_status: string;
  build_compatibility: string;
  multiplayer_compatibility: string;
  created_at: string;
  mod_ids: { value: string }[] | null;
};

export default async function ModsPage({
  searchParams
}: { searchParams: Promise<{ q?: string }> }) {
  const access = await getOwnerAccess();
  if (access.kind !== "authorized") return null;
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";

  let req = access.supabase
    .from("mods")
    .select("id,title,workshop_id,verification_status,build_compatibility,multiplayer_compatibility,created_at,mod_ids(value)")
    .eq("is_archived", false)
    .order("created_at", { ascending: false })
    .limit(100);
  if (query) req = req.ilike("title", "%" + query + "%");
  const { data, error } = await req;
  const items = (data ?? []) as CatalogMod[];

  return (
    <section className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="kicker">CATALOG</p>
          <h1 className="mt-2 text-3xl font-bold">모드 카탈로그</h1>
        </div>
        <Link href="/register" className="action shrink-0 text-sm">모드 등록</Link>
      </div>
      <form method="get">
        <label className="mb-2 block text-sm font-semibold" htmlFor="q">모드 이름 검색</label>
        <div className="flex gap-2">
          <input id="q" className="field" name="q" defaultValue={query} placeholder="모드 이름으로 검색" />
          <button type="submit" className="secondary-action shrink-0">검색</button>
        </div>
      </form>
      {error && <p role="alert" className="text-sm text-red-300">모드 목록을 불러오지 못했습니다.</p>}
      {!error && items.length === 0 && (
        <div className="panel p-7 text-center">
          <p className="font-semibold">{query ? "검색 결과가 없습니다." : "아직 등록한 모드가 없습니다."}</p>
          <p className="muted mt-2 text-sm">등록 화면에서 조사 결과를 검토하고 최종 승인하면 여기에 표시됩니다.</p>
        </div>
      )}
      <div className="grid gap-3">
        {items.map((mod) => (
          <article key={mod.id} className="panel p-5">
            <h2 className="text-lg font-bold">{mod.title}</h2>
            <p className="muted mt-1 text-xs">Workshop ID: {mod.workshop_id}</p>
            <p className="mt-3 text-sm">Mod ID: {mod.mod_ids?.length ? mod.mod_ids.map((x) => x.value).join(", ") : "미확인"}</p>
            <div className="muted mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
              <span>조사: {mod.verification_status}</span>
              <span>B42.22: {mod.build_compatibility}</span>
              <span>멀티: {mod.multiplayer_compatibility}</span>
            </div>
          </article>
        ))}
      </div>
      {items.length >= 100 && <p className="muted text-xs">최근 100개까지만 표시됩니다. 검색어로 범위를 좁혀 주세요.</p>}
    </section>
  );
}
