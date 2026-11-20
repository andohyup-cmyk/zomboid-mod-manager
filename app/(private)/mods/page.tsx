import Link from "next/link";
import { getOwnerAccess } from "@/lib/auth";

type CatalogMod = {
  id: string;
  title: string;
  workshop_id: string;
  verification_status: string;
  build_compatibility: string;
  multiplayer_compatibility: string;
  is_archived: boolean;
  created_at: string;
  mod_ids: { value: string }[] | null;
};

type Filters = {
  q?: string; archive?: string; build?: string; multiplayer?: string; sort?: string;
};
const states = ["unverified", "confirmed", "reported_issue"];

export default async function ModsPage({ searchParams }: { searchParams: Promise<Filters> }) {
  const access = await getOwnerAccess();
  if (access.kind !== "authorized") return null;
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim().slice(0, 80) : "";
  const archive = ["active", "archived", "all"].includes(params.archive ?? "") ? params.archive : "active";
  const sort = ["recent", "oldest", "name"].includes(params.sort ?? "") ? params.sort : "recent";
  const build = states.includes(params.build ?? "") ? params.build : "";
  const multiplayer = states.includes(params.multiplayer ?? "") ? params.multiplayer : "";

  let req = access.supabase.from("mods")
    .select("id,title,workshop_id,verification_status,build_compatibility,multiplayer_compatibility,is_archived,created_at,mod_ids(value)")
    .eq("owner_id", access.user.id)
    .limit(100);

  if (archive !== "all") req = req.eq("is_archived", archive === "archived");
  if (build) req = req.eq("build_compatibility", build);
  if (multiplayer) req = req.eq("multiplayer_compatibility", multiplayer);
  if (query) {
    if (/^\d{5,20}$/.test(query)) req = req.eq("workshop_id", query);
    else {
      // Escape LIKE wildcards so a search is literal, not an accidental broad query.
      const literal = query.replace(/[\\%_]/g, "\\$&");
      req = req.ilike("title", "%" + literal + "%");
    }
  }
  if (sort === "name") req = req.order("title", { ascending: true });
  else req = req.order("created_at", { ascending: sort === "oldest" });

  const { data, error } = await req;
  const items = (data ?? []) as CatalogMod[];

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="kicker">CATALOG</p>
          <h1 className="mt-2 text-3xl font-bold">모드 카탈로그</h1>
        </div>
        <Link href="/register" className="action shrink-0 text-sm">모드 등록</Link>
      </div>
      <form method="get" className="panel space-y-3 p-4">
        <label className="block text-sm font-semibold" htmlFor="q">이름 또는 Workshop ID 검색</label>
        <input id="q" className="field" name="q" defaultValue={query}
          placeholder="모드 이름 또는 숫자 Workshop ID" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-sm">목록
            <select name="archive" defaultValue={archive} className="field mt-1">
              <option value="active">사용 중</option><option value="archived">보관</option><option value="all">전체</option>
            </select>
          </label>
          <label className="text-sm">정렬
            <select name="sort" defaultValue={sort} className="field mt-1">
              <option value="recent">최근 등록</option><option value="oldest">오래된 순</option><option value="name">이름 순</option>
            </select>
          </label>
          <label className="text-sm">B42.22 상태
            <select name="build" defaultValue={build} className="field mt-1">
              <option value="">전체</option><option value="unverified">미확인</option>
              <option value="confirmed">확인</option><option value="reported_issue">문제 제보</option>
            </select>
          </label>
          <label className="text-sm">멀티플레이 상태
            <select name="multiplayer" defaultValue={multiplayer} className="field mt-1">
              <option value="">전체</option><option value="unverified">미확인</option>
              <option value="confirmed">확인</option><option value="reported_issue">문제 제보</option>
            </select>
          </label>
        </div>
        <div className="flex gap-2">
          <button type="submit" className="action">검색·필터 적용</button>
          <Link href="/mods" className="secondary-action">초기화</Link>
        </div>
      </form>
      {error && <p role="alert" className="text-sm text-red-300">모드 목록을 불러오지 못했습니다.</p>}
      {!error && items.length === 0 && (
        <div className="panel p-7 text-center">
          <p className="font-semibold">조건에 맞는 모드가 없습니다.</p>
          <p className="muted mt-2 text-sm">필터를 초기화하거나 등록 화면에서 추가해 주세요.</p>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map(mod => (
          <Link key={mod.id} href={`/mods/${mod.id}`}
            className="panel block space-y-2 p-5 transition-colors hover:border-[#6ca67b]">
            <h2 className="text-lg font-bold">{mod.title}</h2>
            <p className="muted text-xs">Workshop ID: {mod.workshop_id}</p>
            <p className="text-sm">Mod ID: {mod.mod_ids?.length ? mod.mod_ids.map(x => x.value).join(", ") : "미확인"}</p>
            <div className="muted flex flex-wrap gap-2 text-xs">
              <span>B42.22: {mod.build_compatibility}</span><span>멀티: {mod.multiplayer_compatibility}</span>
              {mod.is_archived && <span>보관됨</span>}
            </div>
            <p className="text-xs text-[#b9efb0]">상세 보기</p>
          </Link>
        ))}
      </div>
      {items.length >= 100 && <p className="muted text-xs">최대 100건만 표시됩니다. 조건을 좁혀 검색해 주세요.</p>}
    </section>
  );
}
