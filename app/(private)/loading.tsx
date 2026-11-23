export default function PrivateLoading() {
  return (
    <div aria-busy="true" aria-live="polite" className="animate-pulse space-y-4">
      <div className="h-4 w-28 rounded bg-[#304154]" />
      <div className="h-8 w-48 rounded bg-[#304154]" />
      <div className="grid grid-cols-2 gap-2">
        <div className="h-24 rounded-2xl border border-[#304154] bg-[#141e2b]" />
        <div className="h-24 rounded-2xl border border-[#304154] bg-[#141e2b]" />
      </div>
      <div className="h-32 rounded-2xl border border-[#304154] bg-[#141e2b]" />
    </div>
  );
}
