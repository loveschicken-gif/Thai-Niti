type CompletionStatsProps = {
  accuracy: string;
  studyTime: string;
  provisionsMastered: string;
  xpGained: string;
};

export default function CompletionStats({ accuracy, studyTime, provisionsMastered, xpGained }: CompletionStatsProps) {
  const cards = [
    { label: "ความแม่นยำ", value: accuracy, icon: "✓" },
    { label: "เวลาเรียน", value: studyTime, icon: "⏱" },
    { label: "มาตราที่ทำได้", value: provisionsMastered, icon: "📘" },
    { label: "XP ที่ได้รับ", value: xpGained, icon: "★" },
  ];

  return (
    <section className="grid gap-3 sm:grid-cols-2">
      {cards.map((card) => (
        <article key={card.label} className="relative overflow-hidden rounded-2xl border border-indigo-300/20 bg-[#1e2884]/50 p-4 shadow-[0_12px_28px_rgba(0,0,0,0.3)]">
          <span className="absolute right-3 top-3 rounded-full bg-indigo-300/15 px-2 py-1 text-xs text-indigo-100">{card.icon}</span>
          <p className="text-xs uppercase tracking-[0.16em] text-slate-300">{card.label}</p>
          <p className="mt-2 text-2xl font-extrabold tracking-tight text-indigo-50">{card.value}</p>
        </article>
      ))}
    </section>
  );
}
