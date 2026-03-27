export default function ResearchBetaPage() {
  return (
    <main className="min-h-screen bg-slate-950">
      <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
        <section className="space-y-3 rounded-2xl border border-slate-700/80 bg-slate-900/70 p-5">
          <h1 className="text-xl font-semibold">โหมดวิจัยเบต้า (ล็อก)</h1>
          <p className="text-sm text-slate-300">ระบบวิจัยถูกแยกจากผลิตภัณฑ์ฝึกสาธารณะ และยังปิดไว้ใน MVP เวอร์ชันนี้</p>
          <a
            href="https://forms.gle/placeholder"
            target="_blank"
            rel="noreferrer"
            className="inline-block rounded-lg border border-slate-600 px-4 py-2 text-sm"
          >
            ขอสิทธิ์เข้าใช้งาน (ตัวอย่าง)
          </a>
        </section>
      </div>
    </main>
  );
}
