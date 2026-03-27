import AppShell from "@/components/mvp/AppShell";

export default function LibraryPage() {
  return (
    <AppShell>
      <section className="rounded-2xl border border-indigo-400/20 bg-slate-900/70 p-5">
        <h1 className="text-xl font-semibold text-white">คลังเนื้อหา</h1>
        <p className="mt-2 text-sm text-slate-300">คลังเนื้อหาจะเปิดใช้ใน MVP เฟสถัดไป</p>
      </section>
    </AppShell>
  );
}
