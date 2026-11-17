import Link from "next/link";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { isSupabaseConfigured } from "@/lib/supabase/server";

export default async function LoginPage({
  searchParams
}: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const configured = isSupabaseConfigured();

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <section className="panel w-full max-w-md p-7 sm:p-10">
        <p className="kicker">PROJECT ZOMBOID · B42.22</p>
        <h1 className="mt-3 text-3xl font-black">Zomboid Mod Manager</h1>
        <p className="muted mt-3 mb-7 text-sm leading-6">
          Steam Workshop 모드를 정리하고, 서버 프로필을 구성하는 개인용 관리 앱입니다.
        </p>
        {error && <p role="alert" className="mb-4 rounded-xl bg-red-950 p-3 text-sm text-red-200">로그인 인증에 실패했습니다. 다시 시도해 주세요.</p>}
        {configured ? <GoogleSignInButton /> : (
          <p className="rounded-xl border border-amber-700/60 bg-amber-950/25 p-4 text-sm text-amber-200">
            Supabase 연결 정보가 아직 설정되지 않았습니다. 설정 후 Google 로그인을 사용할 수 있습니다.
          </p>
        )}
        <Link href="/dashboard" className="muted mt-6 inline-block text-sm underline">앱 설정 상태 확인</Link>
      </section>
    </main>
  );
}
