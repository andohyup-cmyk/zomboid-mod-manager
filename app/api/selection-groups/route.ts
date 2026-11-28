import { NextRequest } from "next/server";
import { getOwnerAccess } from "@/lib/auth";
import { PRIVATE_NO_STORE_HEADERS, revalidateDomain } from "@/lib/data-sync";
import { isSameOriginRequest } from "@/lib/write-origin";
import { isCategoryWriteAllowed } from "@/lib/catalog-write-protection";
import {
  parseSelectionGroupDelete, parseSelectionGroupSave, type StoredSelectionGroup
} from "@/lib/selection-group-input";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function reply(data: unknown, status = 200) {
  return Response.json(data, { status, headers: PRIVATE_NO_STORE_HEADERS });
}
type GroupRow = { id: string; label: string; min_selected: number | null; max_selected: number | null; verified: boolean; evidence_url: string | null };
type MemberRow = { group_id: string; mod_id_ref: string };
type ModIdRow = { id: string; value: string; mods: { workshop_id: string } | { workshop_id: string }[] | null };

export async function GET() {
  const access = await getOwnerAccess();
  if (access.kind !== "authorized") return reply({ error: "조회 권한이 없습니다." }, 403);
  const groups = await access.supabase.from("selection_groups")
    .select("id,label,min_selected,max_selected,verified,evidence_url").eq("owner_id", access.user.id)
    .order("label", { ascending: true }).limit(101);
  if (groups.error || !groups.data || groups.data.length > 100) return reply({ error: "선택 그룹을 조회하지 못했습니다." }, 503);
  const rows = groups.data as GroupRow[];
  if (!rows.length) return reply({ groups: [] });
  const members = await access.supabase.from("selection_group_members")
    .select("group_id,mod_id_ref").eq("owner_id", access.user.id).in("group_id", rows.map((g) => g.id)).limit(5001);
  if (members.error || !members.data || members.data.length > 5000) return reply({ error: "선택 그룹 구성원을 조회하지 못했습니다." }, 503);
  const memberRows = members.data as MemberRow[];
  const refs = [...new Set(memberRows.map((m) => m.mod_id_ref))];
  const ids = refs.length
    ? await access.supabase.from("mod_ids").select("id,value,mods(workshop_id)").in("id", refs).limit(5001)
    : { data: [] as ModIdRow[], error: null };
  if (ids.error || !ids.data) return reply({ error: "Mod ID를 조회하지 못했습니다." }, 503);
  const byRef = new Map<string, { workshopId: string; modId: string }>();
  for (const row of ids.data as ModIdRow[]) {
    const mod = Array.isArray(row.mods) ? row.mods[0] : row.mods;
    if (mod?.workshop_id) byRef.set(row.id, { workshopId: mod.workshop_id, modId: row.value });
  }
  const result: StoredSelectionGroup[] = rows.map((g) => ({
    id: g.id, label: g.label, minSelected: g.min_selected, maxSelected: g.max_selected,
    verified: g.verified, evidenceUrl: g.evidence_url,
    members: memberRows.filter((m) => m.group_id === g.id).flatMap((m) => {
      const ref = byRef.get(m.mod_id_ref);
      return ref ? [{ modIdRef: m.mod_id_ref, ...ref }] : [];
    })
  }));
  return reply({ groups: result });
}

async function readBody(request: NextRequest, limit: number): Promise<{ body: unknown } | Response> {
  try {
    const raw = await request.text();
    if (raw.length > limit) return reply({ error: "입력 크기 초과" }, 413);
    return { body: JSON.parse(raw) };
  } catch { return reply({ error: "잘못된 JSON" }, 400); }
}

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request.url, request.headers.get("origin"))
    || !isCategoryWriteAllowed(process.env)) return reply({ error: "이 배포에서 저장할 수 없습니다." }, 403);
  const access = await getOwnerAccess();
  if (access.kind !== "authorized") return reply({ error: "저장 권한이 없습니다." }, 403);
  const read = await readBody(request, 4096);
  if (read instanceof Response) return read;
  const value = parseSelectionGroupSave(read.body);
  if (!value) return reply({ error: "그룹 이름·구성원·최소/최대 선택 수를 확인하세요." }, 400);
  const { data, error } = await access.supabase.rpc("save_selection_group", {
    p_group_id: value.id, p_label: value.label, p_min: value.minSelected, p_max: value.maxSelected, p_mod_id_refs: value.modIdRefs
  });
  if (error) {
    if (error.code === "23505") return reply({ error: "같은 이름의 선택 그룹이 있습니다." }, 409);
    if (error.code === "42501") return reply({ error: "선택 그룹에 접근할 수 없습니다." }, 403);
    if (error.code === "P0002") return reply({ error: "본인 소유 그룹 또는 Mod ID가 아닙니다." }, 404);
    if (error.code === "PZ002" || error.code === "23514") return reply({ error: "선택 그룹 규칙이 올바르지 않습니다." }, 400);
    return reply({ error: "선택 그룹을 저장할 수 없습니다." }, 503);
  }
  revalidateDomain("selectionGroup");
  return reply({ id: data }, value.id ? 200 : 201);
}

export async function DELETE(request: NextRequest) {
  if (!isSameOriginRequest(request.url, request.headers.get("origin"))
    || !isCategoryWriteAllowed(process.env)) return reply({ error: "이 배포에서 삭제할 수 없습니다." }, 403);
  const access = await getOwnerAccess();
  if (access.kind !== "authorized") return reply({ error: "삭제 권한이 없습니다." }, 403);
  const read = await readBody(request, 512);
  if (read instanceof Response) return read;
  const value = parseSelectionGroupDelete(read.body);
  if (!value) return reply({ error: "그룹 ID가 올바르지 않습니다." }, 400);
  const { data, error } = await access.supabase.from("selection_groups")
    .delete().eq("id", value.id).eq("owner_id", access.user.id).select("id");
  if (error) return reply({ error: "선택 그룹을 삭제할 수 없습니다." }, 503);
  if (!data?.length) return reply({ error: "본인 소유 그룹이 없습니다." }, 404);
  revalidateDomain("selectionGroup");
  return reply({ deleted: true, id: value.id });
}
