// Functions injected into the job page with chrome.scripting.executeScript.
// They run in the page, so they must be self-contained: no imports, no
// closures over module state.

import type { Capture } from "./types";

/**
 * Reads the posting. JSON-LD JobPosting first, visible text as the fallback.
 *
 * The fallback used to send everything under <main>, which on a two-pane job
 * board (LinkedIn search, Indeed) is the whole result list plus the posting,
 * and on LinkedIn also the premium insights, the company blurb and similar
 * jobs. That all landed in the prompt. Now it starts from the narrowest
 * container that holds the posting and subtracts blocks known to be noise.
 * LinkedIn hashes its class names but keeps stable section ids
 * (JobDetails_AboutTheJob, JobDetails_AboutTheCompany, ...), so the rules
 * lean on ids and layout roles rather than classes where they can.
 */
export function extractPage(): Capture {
  const ld: unknown[] = [];
  for (const s of Array.from(document.querySelectorAll('script[type="application/ld+json"]'))) {
    try {
      ld.push(JSON.parse(s.textContent ?? ""));
    } catch {
      // ignore malformed blocks
    }
  }

  const host = location.hostname.replace(/^www\./, "");
  const site = (...hosts: string[]) => hosts.some((h) => host === h || host.endsWith(`.${h}`));

  // Sites whose posting is a few known blocks. Each group lists alternatives for one
  // block; when every group matches, the text is those blocks joined and nothing else.
  const parts: string[][] = [];
  if (site("linkedin.com")) {
    parts.push(
      [".job-details-jobs-unified-top-card__container--two-pane", ".jobs-unified-top-card", ".top-card-layout"],
      ["#job-details", ".jobs-description", "[id^='JobDetails_AboutTheJob']", ".description__text"],
    );
  }
  if (site("indeed.com")) parts.push([".jobsearch-JobInfoHeader"], ["#jobDescriptionText"]);

  // Otherwise, where the posting lives, most specific first. The first one with real text wins.
  const roots: string[] = [];
  if (site("linkedin.com")) roots.push(".scaffold-layout__detail", ".jobs-search__job-details", ".job-view-layout", ".jobs-details");
  if (site("indeed.com")) roots.push(".jobsearch-RightPane", "#jobsearch-ViewjobPaneWrapper", ".jobsearch-JobComponent");
  roots.push("main", "[role='main']", "article", "body");

  // Blocks that are never part of the posting. Their text is removed from the root's text.
  const noise: string[] = ["nav", "footer", "[role='navigation']", "[role='banner']", "[role='contentinfo']", "[role='complementary']"];
  if (site("linkedin.com")) {
    noise.push(
      ".scaffold-layout__list",
      ".jobs-search-results-list",
      "[id^='JobDetails_ManageJobBanner']",
      "[id^='JobDetailsPeopleWhoCanHelpSlot']",
      "[id^='JobDetails_JobAlertToggle']",
      "[id^='JobDetails_ResumeReview']",
      "[id^='JobDetails_PremiumApplicantInsights']",
      "[id^='JobDetails_PremiumCompanyInsights']",
      "[id^='JobDetails_AboutTheCompany']",
      "[id^='JobDetailsSimilarJobsSlot']",
      "#InitialStateHowYouFitSlot",
      ".job-details-how-you-match-card",
      ".jobs-premium-applicant-insights",
      ".jobs-premium-company-growth",
      ".jobs-company",
      ".jobs-similar-jobs",
      ".job-details-people-who-can-help",
      ".jobs-details__salary-main-rail-card",
    );
  }
  if (site("indeed.com")) noise.push("#mosaic-provider-jobcards", ".jobsearch-LeftPane", "#jobsearch-ViewJobButtons-container", ".jobsearch-CompanyInfoContainer");

  const tidy = (t: string) => t.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  // innerText of the root with the noise blocks hidden for the read. Subtracting their
  // text as strings does not work: innerText lays the same block out differently
  // depending on which ancestor is asked. The inline styles are restored right after.
  const clean = (root: Element): string => {
    const hidden: Array<[HTMLElement, string]> = [];
    for (const sel of noise) {
      for (const el of Array.from(root.querySelectorAll<HTMLElement>(sel))) {
        hidden.push([el, el.style.display]);
        el.style.display = "none";
      }
    }
    try {
      return tidy((root as HTMLElement).innerText ?? "");
    } finally {
      for (const [el, display] of hidden) el.style.display = display;
    }
  };

  const found: string[] = [];
  for (const group of parts) {
    const el = group.map((sel) => document.querySelector<HTMLElement>(sel)).find((e) => e && e.innerText.trim().length > 0);
    if (!el) break;
    found.push(tidy(el.innerText));
  }
  const composed = parts.length && found.length === parts.length ? found.join("\n\n") : "";

  let text = "";
  if (composed.length > 500) text = composed;
  for (const sel of text ? [] : roots) {
    const el = document.querySelector(sel);
    if (!el) continue;
    const t = clean(el);
    if (t.length > 500) {
      text = t;
      break;
    }
    if (!text) text = t;
  }

  return { url: location.href, pageTitle: document.title, jsonLd: ld.length ? ld : null, text: text.slice(0, 60_000) };
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
