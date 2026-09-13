import { PasteForm } from "@/components/paste-form";

export default function GeneratePage() {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="enter">
        <h1 className="display text-[34px]">Paste a posting</h1>
        <p className="mt-2 text-ink-2">The extension does this with one click. Use this for sites it cannot read, or a posting someone sent you.</p>
      </div>
      <PasteForm />
    </div>
  );
}
