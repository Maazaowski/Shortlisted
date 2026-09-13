// Functions injected into the job page with chrome.scripting.executeScript.
// They run in the page, so they must be self-contained: no imports, no
// closures over module state.

import type { Capture } from "./types";

/** Reads the posting. JSON-LD JobPosting first, visible text as the fallback. */
export function extractPage(): Capture {
  const ld: unknown[] = [];
  for (const s of Array.from(document.querySelectorAll('script[type="application/ld+json"]'))) {
    try {
      ld.push(JSON.parse(s.textContent ?? ""));
    } catch {
      // ignore malformed blocks
    }
  }
  const main = document.querySelector<HTMLElement>("main, [role='main'], article");
  const mainText = main?.innerText ?? "";
  const text = mainText.length > 500 ? mainText : document.body.innerText;
  return { url: location.href, pageTitle: document.title, jsonLd: ld.length ? ld : null, text: (text ?? "").slice(0, 60_000) };
}

export type AttachResult = { attached: boolean; coverFilled: boolean; inputs: number };

/**
 * Sets the PDF on the page's resume file input and fills a cover letter
 * textarea when one exists. Works on standard inputs; custom uploaders need
 * the file dialog.
 */
export function attachFiles(b64: string, fileName: string, coverText: string | null): AttachResult {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const file = new File([bytes], fileName, { type: "application/pdf" });

  const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="file"]'));
  const score = (el: HTMLInputElement): number => {
    const label = el.labels?.[0]?.textContent ?? "";
    const hay = `${el.name} ${el.id} ${el.accept} ${label} ${el.getAttribute("aria-label") ?? ""} ${el.closest("label")?.textContent ?? ""}`.toLowerCase();
    let s = 0;
    if (/resume|cv|curriculum/.test(hay)) s += 10;
    if (/pdf/.test(el.accept)) s += 2;
    if (/cover/.test(hay)) s -= 5;
    return s;
  };
  const target = inputs.sort((a, b) => score(b) - score(a))[0];
  let attached = false;
  if (target) {
    const dt = new DataTransfer();
    dt.items.add(file);
    target.files = dt.files;
    target.dispatchEvent(new Event("input", { bubbles: true }));
    target.dispatchEvent(new Event("change", { bubbles: true }));
    attached = true;
  }

  let coverFilled = false;
  if (coverText) {
    const ta = Array.from(document.querySelectorAll<HTMLTextAreaElement>("textarea")).find((t) => {
      const hay = `${t.name} ${t.id} ${t.placeholder} ${t.labels?.[0]?.textContent ?? ""} ${t.getAttribute("aria-label") ?? ""}`.toLowerCase();
      return /cover/.test(hay);
    });
    if (ta) {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      setter ? setter.call(ta, coverText) : (ta.value = coverText);
      ta.dispatchEvent(new Event("input", { bubbles: true }));
      ta.dispatchEvent(new Event("change", { bubbles: true }));
      coverFilled = true;
    }
  }
  return { attached, coverFilled, inputs: inputs.length };
}
