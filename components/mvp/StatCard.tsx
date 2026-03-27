type StatCardProps = {
  label: string;
  value: string;
  hint?: string;
  icon?: string;
  iconClassName?: string;
};

export default function StatCard({ label, value, hint, icon, iconClassName = "text-indigo-200 bg-indigo-300/10" }: StatCardProps) {
  return (
    <article className="glass-panel rounded-2xl border border-indigo-300/20 p-4 shadow-[0_10px_30px_rgba(6,12,62,0.35)]">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs uppercase tracking-wider text-slate-300">{label}</p>
        {icon ? <span className={`rounded-full px-2 py-1 text-xs ${iconClassName}`}>{icon}</span> : null}
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight text-indigo-50">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-400">{hint}</p> : null}
    </article>
  );
}
