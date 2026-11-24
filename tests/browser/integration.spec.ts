import { createHmac } from "node:crypto";
import { expect, test, type APIRequestContext } from "playwright/test";

const approved = process.env.BROWSER_TEST_MODE === "approved";
// Next 16 dev reports request.url as localhost, so the browser must use localhost to pass the same-origin write guard.
const baseURL = "http://localhost:3172";
const manual = { workshopId: "3552615247", title: "Manual variant", modIds: ["ManualOnly"] };

async function savedRecords(request: APIRequestContext) {
  const response = await request.get("https://127.0.0.1:3173/test/approvals", { ignoreHTTPSErrors: true });
  expect(response.ok()).toBe(true);
  return response.json();
}

test.beforeEach(async ({ context }) => {
  const expiry = Math.floor(Date.now() / 1000) + 3600;
  const user = { id: "00000000-0000-4000-8000-000000000001", email: "owner@example.test" };
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const jwt = encode({ alg: "HS256", typ: "JWT" }) + "." + encode({ sub: user.id, exp: expiry });
  const signature = createHmac("sha256", "local-browser-test").update(jwt).digest("base64url");
  const session = { access_token: jwt + "." + signature, token_type: "bearer", refresh_token: "test-only",
    expires_in: 3600, expires_at: expiry, user };
  await context.addCookies([{ name: "sb-127-auth-token", value: "base64-" + encode(session), url: baseURL }]);
});

async function loadInbox(page: import("playwright/test").Page) {
  await page.getByText("기존 AI 조사 결과 불러오기 (선택)").click();
  await page.getByRole("button", { name: "저장된 조사 결과 불러오기" }).click();
}

test("saved inbox research shows as a candidate; only final approval stores the chosen record", async ({ page, request }) => {
  const posts: string[] = [];
  page.on("request", req => {
    if (req.method() === "POST" && new URL(req.url()).pathname === "/api/mods") posts.push(req.postData() ?? "");
  });
  expect((await request.get(baseURL + "/api/ai-research-inbox")).status()).toBe(403);
  await page.goto("/register");
  await page.getByLabel("Workshop URL 또는 ID").fill("3552615247,https://steamcommunity.com/sharedfiles/filedetails/?id=67890 3552615247 invalid");
  await expect(page.getByText("인식된 Workshop ID 2개")).toBeVisible();
  await expect(page.getByText(/4번 항목/)).toBeVisible();
  await loadInbox(page);
  const inboxCard = page.locator("article").filter({ has: page.getByText("조사함", { exact: true }) });
  await expect(inboxCard).toContainText("QoLMiscItemWeights");
  expect(posts).toHaveLength(0);
  expect(await savedRecords(request)).toEqual([]);
  if (!approved) {
    await expect(inboxCard.getByRole("button", { name: /시험 환경/ })).toBeDisabled();
    for (const data of ["{", JSON.stringify(manual)]) {
      const response = await page.request.post(baseURL + "/api/mods", { data, headers: { "Content-Type": "application/json" } });
      expect(response.status()).toBe(403);
      expect(response.headers()["cache-control"]).toBe("private, no-store");
    }
    expect(await savedRecords(request)).toEqual([]);
    return;
  }

  // Invalid input blocks approval until corrected.
  await expect(inboxCard.getByRole("button", { name: "확인 후 추가하기" })).toBeDisabled();
  await page.getByLabel("Workshop URL 또는 ID").fill("3552615247");
  await expect(inboxCard.getByRole("button", { name: "확인 후 추가하기" })).toBeEnabled();
  const dialog = page.getByRole("dialog", { name: "등록 내용 확인" });
  await inboxCard.getByRole("button", { name: "확인 후 추가하기" }).click();
  await expect(dialog).toContainText("QoLMiscItemWeights");
  await dialog.getByRole("button", { name: "취소" }).click();
  await expect(dialog).toHaveCount(0);
  expect(posts).toHaveLength(0);
  expect(await savedRecords(request)).toEqual([]);
  await inboxCard.getByRole("button", { name: "확인 후 추가하기" }).click();
  await dialog.getByRole("button", { name: "최종 승인" }).click();
  await expect(page.getByText(/등록 완료 · 조사함/)).toBeVisible();
  expect(posts).toHaveLength(1);
  expect(await savedRecords(request)).toHaveLength(1);
});

test("mobile editor preserves disabled positions while emitting only active Mod IDs", async ({ page }) => {
  test.skip(approved, "Run the profile lifecycle once against the read-only fixture.");
  await page.goto("/profiles/editor");
  const ids = ["Core", "Options", "Patch"];
  for (const [index, id] of ids.entries()) {
    await page.getByRole("checkbox", { name: `Mod ID ${id} · Workshop ID ${index === 2 ? "67890" : "12345"}`, exact: true }).check();
  }
  await page.getByRole("button", { name: "선택한 Mod ID 추가" }).click();
  await page.getByRole("tab", { name: "선택한 모드" }).click();
  const output = page.getByLabel("설정 문자열 미리보기");
  const lines = (mods: string) => new RegExp("Mods=" + mods.replaceAll("\\", "\\\\") + "\\s+WorkshopItems=12345;67890");
  await expect(output).toContainText(lines("\\Core;\\Options;\\Patch"));
  await page.getByRole("button", { name: "Options · 12345 비활성화", exact: true }).click();
  await expect(output).toContainText(lines("\\Core;\\Patch"));
  await expect(page.getByRole("textbox", { name: "Options · 12345 순서 번호" })).toHaveValue("2");
  await page.getByRole("button", { name: "Options · 12345 활성화", exact: true }).click();
  await expect(output).toContainText(lines("\\Core;\\Options;\\Patch"));
});

test("read-only Preview shows researched data but no batch approval or queue writes", async ({ page }) => {
  test.skip(approved, "Preview protection only; write-enabled mock uses a separate test.");
  await page.goto("/register");
  await page.getByLabel("Workshop URL 또는 ID").fill("3552615247");
  await loadInbox(page);
  await expect(page.getByText("QoLMiscItemWeights").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "시험 환경: 정식 카탈로그 등록 불가" })).toBeDisabled();
  await expect(page.getByRole("button", { name: /선택 모드 등록/ })).toHaveCount(0);
  const response = await page.request.post("/api/research-queue", {
    data: { items: [{ source: "manual", record: manual }] }
  });
  expect(response.status()).toBe(403);
});
