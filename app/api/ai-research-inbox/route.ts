import { NextResponse } from "next/server";
import { getOwnerAccess } from "@/lib/auth";
import { aiResearchInbox } from "@/lib/ai-research-inbox";
import { normalizeResearchRecord, type ResearchRecord } from "@/lib/workshop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function respond(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0" }
  });
}

// Read-only transport from ChatGPT-authored files in the private GitHub repository.
// Vercel must deploy the GitHub commit before this endpoint can see new records.
// It never calls a paid AI API and never writes to the catalog.
export async function GET() {
  const access = await getOwnerAccess();
  if (access.kind !== "authorized") {
    return respond({ error: "이 작업을 수행할 권한이 없습니다." }, 403);
  }

  const records: ResearchRecord[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  for (const [index, item] of aiResearchInbox.entries()) {
    const result = normalizeResearchRecord(item);
    if (!result.record) {
      errors.push(`${index + 1}번 조사 결과: ${result.error ?? "형식 오류"}`);
      continue;
    }
    if (seen.has(result.record.workshopId)) {
      errors.push(`Workshop ID ${result.record.workshopId} 중복`);
      continue;
    }
    seen.add(result.record.workshopId);
    records.push(result.record);
  }

  // Already-approved Workshop IDs should not reappear as pending work.
  if (records.length === 0) return respond({ records: [], errors, alreadyRegistered: 0 });
  const { data, error } = await access.supabase
    .from("mods")
    .select("workshop_id")
    .eq("owner_id", access.user.id)
    .in("workshop_id", records.map((record) => record.workshopId));
  if (error) return respond({ error: "기존 카탈로그를 확인하지 못했습니다." }, 500);

  const approvedIds = new Set((data ?? []).map((item) => item.workshop_id));
  return respond({
    records: records.filter((record) => !approvedIds.has(record.workshopId)),
    alreadyRegistered: approvedIds.size,
    errors
  });
}
