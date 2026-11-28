export default function RegisterLoading() {
  return (
    <section aria-busy="true" aria-live="polite" className="animate-pulse space-y-5">
      <div className="space-y-2">
        <div className="h-4 w-32 rounded bg-[#1d3228]" />
        <div className="h-8 w-36 rounded bg-[#233243]" />
        <div className="h-4 w-5/6 rounded bg-[#1b2938]" />
      </div>
      <div className="panel space-y-3 p-4 sm:p-5">
        <div className="h-5 w-40 rounded bg-[#233243]" />
        <div className="h-16 w-full rounded-xl bg-[#182534]" />
        <div className="h-11 w-full rounded-xl bg-[#1d3228]" />
      </div>
      <div className="panel h-32 p-4" />
    </section>
  );
}
