export default function Loading() {
  return (
    <main aria-busy="true" aria-live="polite" className="mx-auto min-h-screen max-w-5xl px-6 py-10">
      <div className="mb-12 flex items-center justify-between border-b border-[#304154] pb-6">
        <span className="text-xl font-bold tracking-wide">PZ MODS</span>
      </div>
      <div className="animate-pulse space-y-5">
        <div className="h-4 w-44 rounded bg-[#304154]" />
        <div className="h-9 w-60 rounded bg-[#304154]" />
        <div className="h-5 w-72 max-w-full rounded bg-[#253447]" />
        <div className="mt-10 grid grid-cols-2 gap-4">
          <div className="h-36 rounded-2xl border border-[#304154] bg-[#141e2b]" />
          <div className="h-36 rounded-2xl border border-[#304154] bg-[#141e2b]" />
        </div>
        <div className="h-28 rounded-2xl border border-[#304154] bg-[#141e2b]" />
      </div>
      <p className="mt-8 text-sm text-[#9baebe]">화면을 불러오는 중...</p>
    </main>
  );
}
