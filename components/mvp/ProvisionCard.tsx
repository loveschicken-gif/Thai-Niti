type ProvisionCardProps = {
  lawTitle: string;
  section: string;
  promptText: string;
};

export default function ProvisionCard({ lawTitle, section, promptText }: ProvisionCardProps) {
  return (
    <article className="relative overflow-hidden rounded-3xl border border-indigo-300/25 bg-gradient-to-b from-[#212a86]/50 to-[#1a206e]/70 p-6 shadow-[0_20px_50px_rgba(0,0,0,0.32)]">
      <div className="pointer-events-none absolute inset-0 opacity-[0.04] [background-image:radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.7)_1px,transparent_0)] [background-size:14px_14px]" />
      <p className="mb-3 text-xs font-semibold tracking-wide text-indigo-200/80">
        {lawTitle} - Section {section}
      </p>
      <p className="thai-text relative whitespace-pre-wrap text-base font-medium text-slate-100 sm:text-lg">{promptText}</p>
    </article>
  );
}
