import { ImportWorkbench } from "@/components/ImportWorkbench";
import { isCatalogWriteAllowed } from "@/lib/catalog-write-protection";
import { isPreviewQueueWriteAllowed } from "@/lib/preview-queue-write";

export default function RegisterPage() {
  const canWrite = isCatalogWriteAllowed(process.env, process.env.NEXT_PUBLIC_SUPABASE_URL);
  const queueWritable = canWrite || isPreviewQueueWriteAllowed(process.env, process.env.NEXT_PUBLIC_SUPABASE_URL);

  return (
    <section className="space-y-6">
      <div>
        <p className="kicker">RESEARCH & APPROVAL</p>
        <h1 className="mt-2 text-3xl font-bold">모드 등록</h1>
        <p className="muted mt-3 text-sm leading-6">
          Steam Workshop URL 또는 숫자 ID를 입력하고 AI 조사 결과를 확인할 수 있습니다.
          각 모드는 개별 승인 후 카탈로그에 저장됩니다.
        </p>
      </div>
      <ImportWorkbench readOnly={!canWrite} queueWritable={queueWritable} />
    </section>
  );
}
