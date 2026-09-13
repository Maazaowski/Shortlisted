import { ImportResumeForm } from "@/components/import-resume-form";

const STEPS = [
  ["Import", "Upload the resume you send today, PDF or Word. Every bullet becomes a bank entry tagged with the skills it shows."],
  ["Refine", "Add what the resume left out. More bullets with numbers means better tailoring."],
  ["Capture", "Load the extension, open a posting, click the icon. Twenty seconds later the documents are ready."],
] as const;

export default function OnboardingPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="enter">
        <p className="label">Getting started</p>
        <h1 className="display mt-3 text-[40px]">
          Start from the resume you <em>already have</em>
        </h1>
        <p className="mt-3 max-w-lg text-ink-2">Nothing is written that you did not write first. The import only turns your document into a bank you can edit.</p>
      </div>

      <ol className="enter mt-8 grid gap-6 border-y border-hair py-6 sm:grid-cols-3" style={{ "--i": 1 } as React.CSSProperties}>
        {STEPS.map(([title, text], i) => (
          <li key={title}>
            <div className="num text-xs text-ink-3">0{i + 1}</div>
            <div className="mt-1 font-medium">{title}</div>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{text}</p>
          </li>
        ))}
      </ol>

      <ImportResumeForm />
      <p className="enter mt-4 text-xs text-ink-3" style={{ "--i": 3 } as React.CSSProperties}>
        Importing replaces any bank entries you already have. Profile details are updated in place.
      </p>
    </div>
  );
}
