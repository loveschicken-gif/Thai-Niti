type RunnerLaneProps = {
  obstacleX: number;
  characterAction: "idle" | "jump" | "hit";
  speedLabel: string;
  timeLeftSec: number;
};

export default function RunnerLane({ obstacleX, characterAction, speedLabel, timeLeftSec }: RunnerLaneProps) {
  return (
    <div className="relative h-32 overflow-hidden rounded-2xl border border-indigo-300/20 bg-[#050a46]/80">
      <div className="absolute left-0 right-0 top-1/2 h-[2px] -translate-y-1/2 bg-indigo-300/20" />
      <div
        className={`absolute bottom-[44px] left-[18%] h-6 w-6 rounded-full border border-indigo-100/70 bg-indigo-300 shadow-[0_0_18px_rgba(129,140,248,0.7)] transition-transform duration-300 ${
          characterAction === "jump" ? "-translate-y-8 scale-105" : characterAction === "hit" ? "translate-y-1 scale-90" : ""
        }`}
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_40%,rgba(129,140,248,0.08),transparent_35%),radial-gradient(circle_at_80%_60%,rgba(236,72,153,0.06),transparent_35%)]" />
      <div className="absolute bottom-[38px] h-10 w-10 rounded-md border border-rose-300/40 bg-rose-400/20 transition-[left] duration-100" style={{ left: `${obstacleX}%` }} />
      <div className="absolute inset-x-3 top-2 flex items-center justify-between text-[11px] text-indigo-200/90">
        <span>ความเร็ว: {speedLabel}</span>
        <span>เวลาเหลือ: {Math.max(0, Math.ceil(timeLeftSec))} วินาที</span>
      </div>
    </div>
  );
}
