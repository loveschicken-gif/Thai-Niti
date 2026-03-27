type Citation = {
  law_title: string;
  section: string;
};

type LayeredProvision = {
  law_title: string;
  section: string;
  excerpt: string;
  full_text: string;
  score: number;
};

type AnswerPanelProps = {
  short_answer: string;
  grounded: boolean;
  main_ccc_provision: LayeredProvision | null;
  related_ccc_provisions: LayeredProvision[];
  additional_authorities: LayeredProvision[];
  citations: Citation[];
  showEmptyHint?: boolean;
};

function provisionKey(p: LayeredProvision, idx: number) {
  return `${p.law_title}-${p.section}-${idx}`;
}

function citationLabel(lawTitle: string, section: string) {
  const law = lawTitle || "ไม่ระบุชื่อกฎหมาย";
  const sec = section ? `มาตรา ${section}` : "ไม่ระบุมาตรา";
  return `${law} ${sec}`;
}

export default function AnswerPanel({
  short_answer,
  grounded,
  main_ccc_provision,
  related_ccc_provisions,
  additional_authorities,
  citations,
  showEmptyHint = false,
}: AnswerPanelProps) {
  if (showEmptyHint) {
    return (
      <section className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-5">
        <p className="text-sm text-slate-300">
          ค้นหาด้วยคำถามกฎหมายไทยเพื่อดูคำตอบแบบ grounded พร้อมมาตราอ้างอิง
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-5">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-300">คำตอบพร้อมแนวอ่านกฎหมาย</h2>
      <p className="whitespace-pre-wrap text-sm leading-7 text-slate-100">{short_answer}</p>

      <div className="mt-4 rounded-xl border border-slate-700 bg-slate-950/70 p-3">
        <p className="text-xs text-slate-300">
          {grounded
            ? "ผลลัพธ์นี้สรุปจากข้อความกฎหมายที่ค้นคืนได้เท่านั้น (เพื่อการค้นคว้า ไม่ใช่คำปรึกษากฎหมาย)"
            : "ข้อความที่ค้นคืนได้ยังไม่เพียงพอ ควรตรวจสอบบทกฎหมายเพิ่มเติมก่อนสรุปผล"}
        </p>
      </div>

      <div className="mt-5 space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">มาตราหลักใน ป.พ.พ.</h3>
        {main_ccc_provision ? (
          <article className="rounded-xl border border-blue-500/50 bg-blue-950/20 p-4">
            <p className="text-sm font-semibold text-slate-100">
              {citationLabel(main_ccc_provision.law_title, main_ccc_provision.section)}
            </p>
            <p className="mt-2 text-sm leading-7 text-slate-200">{main_ccc_provision.excerpt}</p>
            <details className="mt-3">
              <summary className="cursor-pointer text-xs font-medium text-blue-300">ดูข้อความเต็มของมาตราหลัก</summary>
              <p className="mt-2 whitespace-pre-wrap rounded-lg border border-slate-700 bg-slate-950/70 p-3 text-sm leading-7 text-slate-200">
                {main_ccc_provision.full_text}
              </p>
            </details>
          </article>
        ) : (
          <p className="rounded-xl border border-amber-500/40 bg-amber-950/20 p-3 text-sm text-amber-100">
            ยังไม่พบมาตราหลักในประมวลกฎหมายแพ่งและพาณิชย์จากผลค้นคืนโดยตรง
          </p>
        )}
      </div>

      <div className="mt-5 space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">มาตรา ป.พ.พ. ที่เกี่ยวข้อง</h3>
        {related_ccc_provisions.length === 0 ? (
          <p className="text-sm text-slate-300">ไม่พบมาตรา CCC ที่เกี่ยวข้องเพิ่มเติม</p>
        ) : (
          <ul className="space-y-2">
            {related_ccc_provisions.map((p, idx) => (
              <li key={provisionKey(p, idx)} className="rounded-xl border border-slate-700 bg-slate-950/70 p-3 text-sm">
                <p className="font-medium text-slate-100">{citationLabel(p.law_title, p.section)}</p>
                <p className="mt-1 text-slate-300">{p.excerpt}</p>
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs font-medium text-slate-400">ดูข้อความเต็ม</summary>
                  <p className="mt-2 whitespace-pre-wrap rounded-lg border border-slate-700 bg-slate-900/80 p-3 text-sm leading-7 text-slate-200">
                    {p.full_text}
                  </p>
                </details>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-5 space-y-3 rounded-xl border border-slate-700/80 bg-slate-950/60 p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">แหล่งกฎหมายประกอบเพิ่มเติม</h3>
        {additional_authorities.length === 0 ? (
          <p className="text-sm text-slate-300">ไม่มีแหล่งกฎหมายประกอบเพิ่มเติมที่เด่นชัด</p>
        ) : (
          <ul className="space-y-2">
            {additional_authorities.map((p, idx) => (
              <li key={provisionKey(p, idx)} className="rounded-xl border border-slate-700 bg-slate-900/70 p-3 text-sm">
                <p className="font-medium text-slate-100">{citationLabel(p.law_title, p.section)}</p>
                <p className="mt-1 text-slate-300">{p.excerpt}</p>
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs font-medium text-slate-400">ดูข้อความเต็ม</summary>
                  <p className="mt-2 whitespace-pre-wrap rounded-lg border border-slate-700 bg-slate-950/80 p-3 text-sm leading-7 text-slate-200">
                    {p.full_text}
                  </p>
                </details>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-5">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">รายการอ้างอิงที่แสดงผล</h3>
        {citations.length === 0 ? (
          <p className="text-sm text-slate-300">ไม่พบข้อมูลอ้างอิงที่ชัดเจน</p>
        ) : (
          <ul className="space-y-2">
            {citations.map((c, idx) => (
              <li key={`${c.law_title}-${c.section}-${idx}`} className="rounded-xl border border-slate-700 bg-slate-950/70 p-3 text-sm">
                <span className="font-medium text-slate-100">{c.law_title || "ไม่ระบุชื่อกฎหมาย"}</span>
                <span className="ml-2 text-slate-300">มาตรา {c.section || "ไม่ระบุ"}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
