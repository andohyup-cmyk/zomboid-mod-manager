export default function ProfileEditorLoading() {
  return (
    <section aria-busy="true" aria-live="polite" className="animate-pulse space-y-4">
      <div className="h-7 w-40 rounded bg-[#233243]" />
      <div className="panel h-24 p-4" />
      <div className="grid grid-cols-2 gap-2">
        <div className="h-11 rounded-xl bg-[#1d3228]" />
        <div className="h-11 rounded-xl bg-[#182534]" />
      </div>
      <div className="panel h-28 p-4" />
      <div className="space-y-2">
        {[0, 1, 2].map((idx) => (
          <div key={idx} className="panel h-28 p-4" />
        ))}
      </div>
    </section>
  );
}
