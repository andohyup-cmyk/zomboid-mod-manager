import { RegisterClient } from "@/components/RegisterClient";
import type { QueueItem } from "@/components/ImportWorkbench";
import { getOwnerAccess } from "@/lib/auth";
import { isCatalogWriteAllowed } from "@/lib/catalog-write-protection";
import { isTestCategoryWriteAllowed } from "@/lib/category-persistence-input";
import { isPreviewQueueWriteAllowed } from "@/lib/preview-queue-write";
import { normalizeResearchRecord } from "@/lib/workshop";

// Evaluate write guards at request time, not at build time.
export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const canWrite = isCatalogWriteAllowed(process.env, process.env.NEXT_PUBLIC_SUPABASE_URL)
    || isTestCategoryWriteAllowed(process.env);
  const queueWritable = canWrite || isPreviewQueueWriteAllowed(process.env, process.env.NEXT_PUBLIC_SUPABASE_URL);

  let initialQueueRecords: QueueItem[] = [];
  let initialQueueLoaded = false;

  if (queueWritable) {
    const access = await getOwnerAccess();
    if (access.kind === "authorized") {
      const { data, error } = await access.supabase
        .from("research_queue")
        .select("id,workshop_id,source,payload")
        .eq("owner_id", access.user.id)
        .eq("status", "pending")
        .order("updated_at", { ascending: false })
        .range(0, 100);

      if (!error && data && data.length <= 100) {
        const parsed: QueueItem[] = [];
        for (const item of data) {
          const normalized = normalizeResearchRecord(item.payload);
          if (!normalized.record || normalized.record.workshopId !== item.workshop_id) continue;
          const src = item.source === "steam" || item.source === "manual" || item.source === "inbox"
            ? item.source
            : "steam";
          parsed.push({
            id: item.id as string,
            source: src,
            record: normalized.record
          });
        }
        if (parsed.length === 0) {
          initialQueueLoaded = true;
        } else {
          const { data: registered, error: regError } = await access.supabase
            .from("mods")
            .select("workshop_id")
            .eq("owner_id", access.user.id)
            .in("workshop_id", [...new Set(parsed.map((item) => item.record.workshopId))]);
          if (!regError) {
            const approvedIds = new Set((registered ?? []).map((row) => row.workshop_id as string));
            initialQueueRecords = parsed.filter((item) => !approvedIds.has(item.record.workshopId));
            initialQueueLoaded = true;
          }
        }
      }
    }
  }

  return (
    <section className="space-y-6">
      <div>
        <p className="kicker">RESEARCH & APPROVAL</p>
        <h1 className="mt-2 text-3xl font-bold">모드 등록</h1>
        <p className="muted mt-3 text-sm leading-6">
          Workshop 링크 또는 숫자 ID로 Steam 공개 정보를 조회합니다.
          조사된 자료는 검토 후 최종 승인해야 카탈로그에 저장됩니다.
        </p>
      </div>
      <RegisterClient
        readOnly={!canWrite}
        queueWritable={queueWritable}
        initialQueueRecords={initialQueueRecords}
        initialQueueLoaded={initialQueueLoaded}
      />
    </section>
  );
}
