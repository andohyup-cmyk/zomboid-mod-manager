import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ServerProfilePreview } from "@/components/ServerProfilePreview";

export const metadata: Metadata = { title: "서버 프로필 개발 미리보기" };

export default function ServerProfilePreviewPage() {
  if (process.env.NODE_ENV !== "development" || process.env.SERVER_PROFILE_PREVIEW !== "1") {
    notFound();
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-7 md:py-10">
      <header className="mb-6">
        <p className="kicker">개발 전용 · 가상 데이터</p>
        <h1 className="mt-2 text-2xl font-bold sm:text-3xl">서버 프로필 출력 미리보기</h1>
        <p className="muted mt-2 text-sm leading-6">
          샘플 모드로 선택, 로드 순서, 설정 복사를 연습할 수 있습니다. 새로고침하면 선택이 초기화됩니다.
        </p>
      </header>
      <ServerProfilePreview />
    </main>
  );
}
