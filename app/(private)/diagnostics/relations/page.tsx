import { notFound } from "next/navigation";
import { RelationE2EClient } from "@/components/RelationE2EClient";
import { getOwnerAccess } from "@/lib/auth";
import {
  isTestRelationPreview, isTestRelationWriteAllowed,
  type DraftRelationInput
} from "@/lib/mod-relation-review-input";
import { verifyOwnerRelationEvidence } from "@/lib/mod-relation-review-server";

export const dynamic = "force-dynamic";
type Access = Extract<Awaited<ReturnType<typeof getOwnerAccess>>, { kind: "authorized" }>;

const SOURCE_WORKSHOP = "9000099811";
const TARGET_WORKSHOP = "9000099812";
const SOURCE_MOD_ID = "DemoMain";
const TARGET_MOD_ID = "DemoPatch";
const FIXTURE_PROFILE = "E2E_TEST_ONLY_RELATIONS";
const FIXTURE_EVIDENCE = "https://example.test/fictional-test-proof";
const FIXTURE_DATE = "2026-11-22";

async function resolveReadOnlyFixture(access: Access):
  Promise<(DraftRelationInput & { profileId: string }) | null> {
  const { data: mods, error: modError } = await access.supabase.from("mods")
    .select("id,owner_id,workshop_id,title")
    .eq("owner_id", access.user.id)
    .in("workshop_id", [SOURCE_WORKSHOP, TARGET_WORKSHOP])
    .limit(3);
  if (modError || !mods || mods.length !== 2) return null;
  const subject = mods.find(mod => mod.workshop_id === SOURCE_WORKSHOP);
  const target = mods.find(mod => mod.workshop_id === TARGET_WORKSHOP);
  if (!subject || !target || subject.title !== "FICTIONAL_E2E_SOURCE"
    || target.title !== "FICTIONAL_E2E_TARGET") return null;
  const { data: ids, error: idError } = await access.supabase.from("mod_ids")
    .select("id,mod_id,value")
    .in("mod_id", [subject.id, target.id]).limit(3);
  if (idError || !ids || ids.length !== 2) return null;
  const sourceId = ids.find(id => id.mod_id === subject.id && id.value === SOURCE_MOD_ID);
  const targetId = ids.find(id => id.mod_id === target.id && id.value === TARGET_MOD_ID);
  if (!sourceId || !targetId) return null;

  const { data: research, error: researchError } = await access.supabase
    .from("research_records").select("id,mod_id")
    .eq("mod_id", subject.id).limit(2);
  if (researchError || !research || research.length !== 1) return null;

  const input: DraftRelationInput = {
    kind: "requires", subjectModIdUuid: sourceId.id, targetModIdUuid: targetId.id,
    evidenceRecordId: research[0].id,
    sourceUrl: FIXTURE_EVIDENCE, checkedAt: FIXTURE_DATE
  };
  if (!await verifyOwnerRelationEvidence(access, input)) return null;

  const { data: profiles, error: profileError } = await access.supabase
    .from("profiles").select("id")
    .eq("owner_id", access.user.id)
    .eq("name", FIXTURE_PROFILE).limit(2);
  if (profileError || !profiles || profiles.length !== 1) return null;

  const { data: revisions, error: revisionError } = await access.supabase
    .from("profile_revision").select("revision")
    .eq("owner_id", access.user.id)
    .eq("profile_id", profiles[0].id)
    .order("revision", { ascending: false }).limit(1);
  if (revisionError || !revisions || revisions.length !== 1) return null;
  const revision = revisions[0].revision;

  const { data: choices, error: choiceError } = await access.supabase
    .from("profile_mod_choices").select("mod_id_entry_id,enabled,load_order")
    .eq("owner_id", access.user.id).eq("profile_id", profiles[0].id)
    .eq("revision", revision).limit(3);
  if (choiceError || !choices || choices.length !== 1
    || choices[0].mod_id_entry_id !== sourceId.id
    || choices[0].enabled !== true
    || choices[0].load_order !== 0) return null;
  return { ...input, profileId: profiles[0].id };
}

export default async function MobileRelationE2EPage() {
  if (!isTestRelationPreview(process.env, process.env.NEXT_PUBLIC_SUPABASE_URL)) {
    notFound();
  }
  const access = await getOwnerAccess();
  if (access.kind !== "authorized") notFound();
  const fixture = await resolveReadOnlyFixture(access);
  const writeEnabled = isTestRelationWriteAllowed(
    process.env, process.env.NEXT_PUBLIC_SUPABASE_URL
  );
  return <RelationE2EClient fixture={fixture} writeEnabled={writeEnabled} />;
}
