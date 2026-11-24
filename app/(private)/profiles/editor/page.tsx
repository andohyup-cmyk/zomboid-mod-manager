import { ProfileModEditor } from "@/components/ProfileModEditor";
import { getOwnerAccess } from "@/lib/auth";
import { isTestCategoryWriteAllowed } from "@/lib/category-persistence-input";

const recommendationOptions = { categoryPriority: [] };

export default async function ProfileEditorPage() {
  const access = await getOwnerAccess();
  if (access.kind !== "authorized") return null;

  return <ProfileModEditor recommendationOptions={recommendationOptions} groupWriteEnabled={isTestCategoryWriteAllowed(process.env)} />;
}
