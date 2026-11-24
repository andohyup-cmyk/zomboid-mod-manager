import { ImportWorkbench } from "@/components/ImportWorkbench";
import { isCatalogWriteAllowed } from "@/lib/catalog-write-protection";
import { isTestCategoryWriteAllowed } from "@/lib/category-persistence-input";
import { isPreviewQueueWriteAllowed } from "@/lib/preview-queue-write";

export default function RegisterPage() {
  const canWrite = isCatalogWriteAllowed(process.env, process.env.NEXT_PUBLIC_SUPABASE_URL)
    || isTestCategoryWriteAllowed(process.env);
  const queueWritable = canWrite || isPreviewQueueWriteAllowed(process.env, process.env.NEXT_PUBLIC_SUPABASE_URL);

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
      <ImportWorkbench readOnly={!canWrite} queueWritable={queueWritable} />
    </section>
  );
}
