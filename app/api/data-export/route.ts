import { getOwnerAccess } from "@/lib/auth";
import { inspectBackupSnapshot } from "@/lib/backup-preview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 250;
const MAX_ROWS_PER_TABLE = 10000;

export async function GET() {
  const access = await getOwnerAccess();
  if (access.kind !== "authorized") {
    return Response.json({ error: "접근 권한이 없습니다." }, {
      status: 403, headers: { "Cache-Control": "private, no-store" }
    });
  }

  const supabase = access.supabase;

  async function readRows(table: string, by: string, ids: string[], orderBy: string, secondOrder?: string, thirdOrder?: string) {
    const rows: Record<string, unknown>[] = [];
    if (!ids.length) return rows;
    for (let offset = 0; offset <= MAX_ROWS_PER_TABLE; offset += PAGE_SIZE) {
      let query = supabase.from(table).select("*")
        .in(by, ids).order(orderBy, { ascending: true });
      if (secondOrder) query = query.order(secondOrder, { ascending: true });
      if (thirdOrder) query = query.order(thirdOrder, { ascending: true });
      const { data, error } = await query.range(offset, offset + PAGE_SIZE - 1);
      if (error) throw new Error(`${table}: query failed`);
      const page = (data ?? []) as Record<string, unknown>[];
      if (offset === MAX_ROWS_PER_TABLE && page.length) {
        throw new Error(`${table}: too many records for a verified export`);
      }
      rows.push(...page);
      if (page.length < PAGE_SIZE) break;
    }
    return rows;
  }

  try {
    const uid = access.user.id;
    const mods = await readRows("mods", "owner_id", [uid], "id");
    const modIds = mods.map(mod => mod.id).filter((id): id is string => typeof id === "string");
    const profiles = await readRows("profiles", "owner_id", [uid], "id");
    const profileIds = profiles.map(profile => profile.id).filter((id): id is string => typeof id === "string");

    const [gameModIds, researchRecords, profileMods, profileRevisions, profileModChoices, profileDownloads, modRelations] = await Promise.all([
      readRows("mod_ids", "mod_id", modIds, "id"),
      readRows("research_records", "mod_id", modIds, "id"),
      readRows("profile_mods", "profile_id", profileIds, "profile_id", "mod_id"),
      readRows("profile_revision", "owner_id", [uid], "profile_id", "revision"),
      readRows("profile_mod_choices", "owner_id", [uid], "profile_id", "revision", "load_order"),
      readRows("profile_downloads", "owner_id", [uid], "profile_id", "revision", "load_order"),
      readRows("mod_relations", "owner_id", [uid], "created_at", "id")
    ]);

    const warnings: string[] = [];
    let queue: Record<string, unknown>[] | null = null;
    try {
      queue = await readRows("research_queue", "owner_id", [uid], "id");
    } catch {
      // The proposed queue migration may not have been approved/applied yet.
      // Never silently describe a partial export as a complete backup.
      warnings.push("영구 대기함을 내보내지 못했습니다. DB 마이그레이션 적용 여부를 확인해야 합니다.");
    }

    const snapshot = {
      schemaVersion: 3,
      exportedAt: new Date().toISOString(),
      scope: "authorized-user-catalog-and-profiles",
      complete: warnings.length === 0,
      warnings,
      data: {
        mods, modIds: gameModIds, researchRecords, profiles, profileMods,
        researchQueue: queue, profileRevisions, profileModChoices, profileDownloads, modRelations
      }
    };
    // A readable JSON structure is not enough: never label inconsistent
    // profile/mod/relation links as a complete export, even under owner RLS.
    const inspected = inspectBackupSnapshot(snapshot);
    if (!inspected.preview) {
      return Response.json({ error: "데이터 연결이 일치하지 않아 내보내기를 중단했습니다." }, {
        status: 503, headers: { "Cache-Control": "private, no-store" }
      });
    }
    const json = JSON.stringify(snapshot, null, 2);
    if (Buffer.byteLength(json, "utf8") > 8_000_000) {
      return Response.json({ error: "내보내기 크기가 제한을 초과했습니다." }, {
        status: 413, headers: { "Cache-Control": "private, no-store" }
      });
    }

    const date = new Date().toISOString().slice(0, 10);
    return new Response(json, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="zomboid-mod-manager-${date}.json"`,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch {
    return Response.json({ error: "데이터를 모두 확인하지 못해 내보내기를 중단했습니다." }, {
      status: 503, headers: { "Cache-Control": "private, no-store" }
    });
  }
}
