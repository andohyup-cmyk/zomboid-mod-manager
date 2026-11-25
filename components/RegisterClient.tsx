"use client";

import { useRouter } from "next/navigation";
import { ImportWorkbench } from "@/components/ImportWorkbench";

export function RegisterClient({
  readOnly,
  queueWritable
}: {
  readOnly: boolean;
  queueWritable: boolean;
}) {
  const router = useRouter();
  return (
    <ImportWorkbench
      readOnly={readOnly}
      queueWritable={queueWritable}
      onCatalogSaved={() => router.refresh()}
    />
  );
}
