import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { getOwnerAccess } from "@/lib/auth";

export default async function PrivateLayout({ children }: { children: ReactNode }) {
  const access = await getOwnerAccess();
  if (access.kind === "signed-out") redirect("/login");

  if (access.kind === "unconfigured") {
    return (
      <main className="mx-auto max-w-lg px-4 py-12">
        <div className="panel p-7">
          <p className="kicker">설정 필요</p>
          <h1 className="mt-3 text-2xl font-bold">앱 기본 코드가 준비되었습니다</h1>
          <p className="muted mt-4 leading-7">Supabase 프로젝트 연결 및 Google OAuth 설정 후 로그인과 개인 데이터 관리를 시작할 수 있습니다.</p>
          <p className="muted mt-3 text-sm">설정 방법은 저장소의 README.md를 참고하세요.</p>
        </div>
      </main>
    );
  }

  if (access.kind === "permission-setup" || access.kind === "denied") {
    return (
      <main className="mx-auto max-w-lg px-4 py-12">
        <section className="panel p-7">
          <p className="kicker">접근 제한</p>
          <h1 className="mt-3 text-2xl font-bold">허용된 계정이 아닙니다</h1>
          <p className="muted mt-4 text-sm leading-6">
            초기 앱은 승인된 본인 계정만 이용할 수 있습니다. Supabase 설정 담당자는 아래 사용자 ID를 접근 허용 목록에 등록해야 합니다.
          </p>
          <code className="mt-4 block break-all rounded-lg bg-[#0a131d] p-3 text-sm">{access.userId}</code>
          {access.kind === "permission-setup" && <p className="mt-3 text-sm text-amber-200">데이터베이스 초기 마이그레이션도 확인해 주세요.</p>}
          <form action="/logout" method="post" className="mt-6">
            <button className="secondary-action w-full" type="submit">다른 계정으로 로그인</button>
          </form>
        </section>
      </main>
    );
  }

  return <AppShell email={access.user.email}>{children}</AppShell>;
}
