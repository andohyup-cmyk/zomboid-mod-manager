"use client";

import { useRouter } from "next/navigation";
import { ImportWorkbench, type QueueItem } from "@/components/ImportWorkbench";

export function RegisterClient({
  readOnly,
  queueWritable,
  initialQueueRecords,
  initialQueueLoaded
}: {
  readOnly: boolean;
  queueWritable: boolean;
  initialQueueRecords?: QueueItem[];
  initialQueueLoaded?: boolean;
}) {
  const router = useRouter();
  return (
    <ImportWorkbench
      readOnly={readOnly}
      queueWritable={queueWritable}
      initialQueueRecords={initialQueueRecords}
      initialQueueLoaded={initialQueueLoaded}
      onCatalogSaved={() => router.refresh()}
    />
  );
}
