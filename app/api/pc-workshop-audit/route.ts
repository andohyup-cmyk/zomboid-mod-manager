import { NextResponse } from "next/server";
import { getOwnerAccess } from "@/lib/auth";
import { getRepoWorkshopInventory, REPO_AUDIT_FILENAME } from "@/lib/repo-workshop-audit";

export const dynamic = "force-dynamic";

export async function GET() {
  const access = await getOwnerAccess();
  if (access.kind !== "authorized") {
    return NextResponse.json(
      { error: "이 작업을 수행할 권한이 없습니다." },
      { status: 403, headers: { "Cache-Control": "private, no-store" } }
    );
  }
  const inventory = getRepoWorkshopInventory();
  return NextResponse.json(
    { fileName: REPO_AUDIT_FILENAME, inventory },
    { status: 200, headers: { "Cache-Control": "private, no-store" } }
  );
}
