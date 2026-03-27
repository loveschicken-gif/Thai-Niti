type ResultCardProps = {
  rank: number;
  law_title: string;
  section: string;
  score: number;
  context_text: string;
};

function preview(text: string, maxChars = 360): string {
  const clean = (text || "").trim();
  if (clean.length <= maxChars) return clean;
  return `${clean.slice(0, maxChars - 3)}...`;
}

export default function ResultCard({ rank, law_title, section, score, context_text }: ResultCardProps) {
  return (
    <article className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-5">
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className="rounded-full bg-slate-800 px-2 py-1 font-semibold text-slate-200">#{rank}</span>
        <span className="text-slate-200">{law_title || "ไม่ระบุชื่อกฎหมาย"}</span>
        <span className="text-slate-400">มาตรา {section || "ไม่ระบุ"}</span>
        <span className="text-slate-400">คะแนน {Number.isFinite(score) ? score.toFixed(4) : "-"}</span>
      </div>
      <p className="text-sm leading-7 text-slate-200">{preview(context_text)}</p>
    </article>
  );
}
