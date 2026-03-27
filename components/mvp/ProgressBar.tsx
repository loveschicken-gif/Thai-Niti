type ProgressBarProps = {
  value: number;
  max?: number;
};

export default function ProgressBar({ value, max = 100 }: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-800/80">
      <div className="h-full rounded-full bg-gradient-to-r from-violet-300 via-blue-300 to-indigo-300 shadow-[0_0_12px_rgba(176,198,255,0.45)]" style={{ width: `${pct}%` }} />
    </div>
  );
}
