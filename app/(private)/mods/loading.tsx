export default function ModsLoading() {
  return (
    <section aria-busy="true" aria-live="polite" className="animate-pulse space-y-4">
      <div className="h-8 w-36 rounded-lg bg-[#233243]" />
      <div className="h-11 w-full rounded-xl bg-[#182534]" />
      <div className="grid grid-cols-3 gap-1.5">
        <div className="h-11 rounded-xl border border-[#304154] bg-[#141e2b]" />
        <div className="h-11 rounded-xl border border-[#304154] bg-[#141e2b]" />
        <div className="h-11 rounded-xl border border-[#304154] bg-[#141e2b]" />
      </div>
      <div className="h-11 w-full rounded-xl bg-[#182534]" />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {[0, 1, 2, 3, 4, 5].map((idx) => (
          <div key={idx} className="panel space-y-2.5 p-4">
            <div className="h-5 w-2/3 rounded bg-[#233243]" />
            <div className="h-3.5 w-full rounded bg-[#1b2938]" />
            <div className="h-5 w-20 rounded bg-[#1d3228]" />
          </div>
        ))}
      </div>
    </section>
  );
}
