import { formatMistakeDateTime } from "@/lib/game/mvp";
import type { MistakeAnalyticsRow } from "@/lib/game/mvp";

type MistakeTableProps = {
  rows: MistakeAnalyticsRow[];
};

export default function MistakeTable({ rows }: MistakeTableProps) {
  if (rows.length === 0) {
    return <p className="p-5 text-sm text-slate-300">ยังไม่มีประวัติข้อผิดพลาด</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-[#0b1261]/65 text-xs uppercase tracking-[0.15em] text-slate-300">
          <tr>
            <th className="px-4 py-3">มาตรา</th>
            <th className="px-4 py-3">แทร็ก</th>
            <th className="px-4 py-3">ผิด 24ชม.</th>
            <th className="px-4 py-3">ผิด 7 วัน</th>
            <th className="px-4 py-3">ผิด 30 วัน</th>
            <th className="px-4 py-3">ผิดล่าสุด</th>
            <th className="px-4 py-3">Mastery</th>
            <th className="px-4 py-3">ทบทวน</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const dt = formatMistakeDateTime(row.lastWrongAt);
            return (
              <tr key={`${row.lawId}-${row.section}`} className="border-t border-slate-800/80 text-slate-200">
                <td className="px-4 py-3 font-semibold">มาตรา {row.section}</td>
                <td className="px-4 py-3">{row.lawName}</td>
                <td className="px-4 py-3">{row.mistakes24h}</td>
                <td className="px-4 py-3">{row.mistakes7d}</td>
                <td className="px-4 py-3">{row.mistakes30d}</td>
                <td className="px-4 py-3">
                  {dt.day} {dt.time}
                </td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-indigo-300/15 px-2.5 py-1 text-xs font-semibold text-indigo-100">{row.masteryScore}%</span>
                </td>
                <td className="px-4 py-3">
                  <button className="rounded-full border border-indigo-300/40 bg-indigo-300/10 px-3 py-1.5 text-xs font-semibold text-indigo-100">
                    ฝึกเฉพาะจุด
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
