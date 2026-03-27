import ProgressBar from "@/components/mvp/ProgressBar";
import type { TrackAvailabilityStatus } from "@/lib/game/types";

type TrackCardProps = {
  title: string;
  subtitle: string;
  description: string;
  levelLabel: string;
  categoryLabel?: string;
  icon?: string;
  accent?: "indigo" | "amber" | "violet";
  mastery: number;
  available: boolean;
  provisionCount: number;
  onEnter: () => void;
  loading?: boolean;
  status?: TrackAvailabilityStatus;
  statusLabel?: string;
  statusMessage?: string;
  ctaLabel?: string;
  canStart?: boolean;
  onRequestTrack?: () => void;
};

export default function TrackCard({
  title,
  subtitle,
  description,
  levelLabel,
  categoryLabel,
  icon = "⚖",
  accent = "indigo",
  mastery,
  available,
  provisionCount,
  onEnter,
  loading = false,
  status = "full",
  statusLabel,
  statusMessage,
  ctaLabel = "เข้าแทร็ก",
  canStart = available,
  onRequestTrack,
}: TrackCardProps) {
  const accentClasses =
    accent === "amber"
      ? "from-amber-300 to-yellow-300 text-amber-100"
      : accent === "violet"
        ? "from-violet-300 to-fuchsia-300 text-violet-100"
        : "from-blue-300 to-indigo-300 text-indigo-100";

  const showMastery = status === "full";
  const showStatusBlock = !showMastery;
  const disabled = loading;

  return (
    <article className="glass-panel group relative overflow-hidden rounded-3xl border border-indigo-300/20 p-5 shadow-[0_12px_35px_rgba(5,10,55,0.38)] transition hover:-translate-y-1">
      <div className="pointer-events-none absolute -right-6 -top-5 text-7xl opacity-10">{icon}</div>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          {categoryLabel ? (
            <span className="mb-2 inline-block rounded-full border border-indigo-200/20 bg-indigo-300/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-indigo-100">
              {categoryLabel}
            </span>
          ) : null}
          <h3 className="text-base font-semibold text-slate-100">{title}</h3>
          <p className="text-sm text-slate-400">{subtitle}</p>
        </div>
        <span className="rounded-full border border-violet-300/40 bg-violet-400/10 px-2.5 py-1 text-xs font-semibold text-violet-200">{levelLabel}</span>
      </div>
      <p className="mb-4 text-sm leading-6 text-slate-300">{description}</p>
      {showMastery ? (
        <>
          <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
            <span>ความแม่นยำ</span>
            <span className="font-semibold text-slate-200">{mastery}%</span>
          </div>
          <div className="rounded-full bg-slate-950/40 p-1">
            <ProgressBar value={mastery} />
          </div>
          <p className="mt-2 text-xs text-slate-400">{`${provisionCount} มาตราพร้อมฝึก`}</p>
        </>
      ) : null}
      {showStatusBlock ? (
        <div className="rounded-2xl border border-indigo-200/15 bg-slate-950/35 p-3">
          {statusLabel ? (
            <span className="inline-flex rounded-full border border-indigo-300/30 bg-indigo-400/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-indigo-100">
              {statusLabel}
            </span>
          ) : null}
          <p className="mt-2 text-sm text-slate-200">{statusMessage ?? "กำลังเตรียมแทร็กนี้อยู่"}</p>
          <p className="mt-1 text-xs text-slate-400">{`${provisionCount} มาตราที่มีในตอนนี้`}</p>
        </div>
      ) : null}
      <button
        onClick={onEnter}
        disabled={disabled}
        className={`mt-4 w-full rounded-full bg-gradient-to-r px-4 py-3 text-sm font-bold uppercase tracking-wide text-slate-950 shadow-[0_10px_22px_rgba(176,198,255,0.25)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400 ${accentClasses}`}
      >
        {ctaLabel}
      </button>
      {canStart && onRequestTrack ? (
        <button
          onClick={onRequestTrack}
          className="mt-2 w-full rounded-full border border-indigo-300/35 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-indigo-100 transition hover:bg-indigo-300/10"
        >
          ขอหัวข้ออื่น
        </button>
      ) : null}
    </article>
  );
}
