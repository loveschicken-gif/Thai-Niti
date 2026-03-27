import ProgressBar from "@/components/mvp/ProgressBar";

type RunHudProps = {
  trackName: string;
  level: number;
  questionInLevel: number;
  progressValue: number;
  total: number;
  lives: number;
  combo: number;
  bestCombo: number;
  score: number;
};

export default function RunHud({
  trackName,
  level,
  questionInLevel,
  progressValue,
  total,
  lives,
  combo,
  bestCombo,
  score,
}: RunHudProps) {
  const percent = total > 0 ? Math.round((progressValue / total) * 100) : 0;
  const checkpoints = [1, 25, 50, 75, 100];
  const comboPct = Math.min(100, Math.round((combo / 10) * 100));

  return (
    <div className="relative overflow-hidden rounded-3xl border border-indigo-300/30 bg-gradient-to-br from-indigo-900/50 to-slate-900/85 p-4 shadow-[0_14px_35px_rgba(99,102,241,0.25)]">
      <div className="absolute -right-8 -top-10 h-28 w-28 rounded-full bg-indigo-300/15 blur-2xl" />
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="rounded-full border border-indigo-300/30 bg-indigo-400/10 px-3 py-1 text-xs font-medium text-indigo-100">แทร็กฝึก: {trackName}</p>
        <p className="text-sm font-bold text-white">เลเวล {level}</p>
        <p className="text-sm font-semibold text-indigo-100">ข้อ {questionInLevel} / 10</p>
        <p className="text-sm text-indigo-100">
          ความคืบหน้ารวม {progressValue} / {total}
        </p>
        <p className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-bold text-emerald-200">คะแนน: {score}</p>
        <p className="ml-auto rounded-full bg-rose-400/15 px-3 py-1 text-xs font-bold text-rose-200">ชีวิต: {"❤".repeat(Math.max(lives, 0))}</p>
      </div>

      <div className="relative mt-2 rounded-xl border border-indigo-400/20 bg-slate-950/60 p-3">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-indigo-200">เส้นทางการฝึก</p>
        <ProgressBar value={percent} />
        <div className="mt-2 flex items-center justify-between">
          {checkpoints.map((point) => {
            const reached = progressValue >= point;
            return (
              <div key={point} className="flex flex-col items-center gap-1">
                <span className={`h-2.5 w-2.5 rounded-full ring-2 ${reached ? "bg-indigo-300 ring-indigo-300/40" : "bg-slate-700 ring-slate-700/40"}`} />
                <span className={`text-[10px] font-semibold ${reached ? "text-indigo-200" : "text-slate-500"}`}>{point}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-3 rounded-2xl border border-indigo-300/20 bg-[#070d55]/70 p-3">
        <div className="mb-2 flex items-center justify-between text-xs text-indigo-100">
          <span>คอมโบ: {combo}</span>
          <span>สถิติสูงสุด: {bestCombo}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-indigo-950/80">
          <div
            className="h-full rounded-full bg-gradient-to-r from-indigo-300 via-violet-300 to-fuchsia-300 transition-all duration-200"
            style={{ width: `${comboPct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
