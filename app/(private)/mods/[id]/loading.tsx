export default function ModDetailLoading() {
  return (
    <section aria-busy="true" aria-live="polite" className="animate-pulse space-y-4">
      <div className="h-5 w-24 rounded bg-[#233243]" />
      <div className="panel space-y-3 p-5 sm:p-6">
        <div className="h-7 w-2/3 rounded bg-[#233243]" />
        <div className="h-4 w-full rounded bg-[#1b2938]" />
        <div className="flex gap-1.5">
          <div className="h-6 w-20 rounded bg-[#1d3228]" />
          <div className="h-6 w-16 rounded bg-[#1b2d3c]" />
        </div>
        <div className="flex justify-between border-t border-[#304154] pt-3">
          <div className="h-4 w-36 rounded bg-[#1b2938]" />
          <div className="h-4 w-28 rounded bg-[#1d3228]" />
        </div>
      </div>
      <div className="panel space-y-2 p-5">
        <div className="h-4 w-full rounded bg-[#1b2938]" />
        <div className="h-4 w-5/6 rounded bg-[#1b2938]" />
        <div className="h-4 w-2/3 rounded bg-[#1b2938]" />
      </div>
      <div className="panel h-32 p-5" />
    </section>
  );
}
