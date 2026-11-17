import { ImportWorkbench } from "@/components/ImportWorkbench";

export default function RegisterPage() {
  return (
    <section className="space-y-6">
      <div>
        <p className="kicker">RESEARCH & APPROVAL</p>
        <h1 className="mt-2 text-3xl font-bold">모드 등록</h1>
        <p className="muted mt-3 text-sm leading-6">
          Steam Workshop 링크를 수집하고 AI 조사 결과를 확인한 뒤 모드를 추가합니다.
          링크 입력만으로 카탈로그에 등록되지는 않습니다.
        </p>
      </div>
      <ImportWorkbench />
    </section>
  );
}
