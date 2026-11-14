import type { Bank, BankBullet, Selection, ValidationFlag } from "./schemas.js";

/**
 * The rule that makes the product trustworthy: the model may select, reorder
 * and lightly reword, but every claim must trace back to the bank. This pass
 * is code, not a model, and it never fixes anything silently. It drops what it
 * cannot trace and flags what changed.
 */
export type ValidatedSelection = {
  selection: Selection;
  flags: ValidationFlag[];
};

// Longer units first so "months" is not cut to "m".
const NUMBER_RE =
  /\d[\d,.]*\s?(percent|months?|minutes?|hours?|hrs?|days?|weeks?|years?|yrs?|users?|customers?|ms|%|x|k|m|s)?(?![a-z])/gi;
const STOP = new Set(
  "the a an and or but for with from into over under to of in on at by as is are was were be been being this that these those it its we our i my you your they their led built built designed shipped owned drove improved reduced increased cut migrated delivered".split(
    " ",
  ),
);

export function extractNumbers(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(NUMBER_RE)) out.push(m[0].replace(/\s+/g, "").toLowerCase());
  return out;
}

/** Capitalised or symbol-bearing tokens, which is where tool names live. */
export function extractTerms(text: string): string[] {
  const out = new Set<string>();
  for (const raw of text.split(/[\s,;()]+/)) {
    const t = raw.replace(/^[^A-Za-z0-9.#+]+|[^A-Za-z0-9.#+]+$/g, "");
    if (!t) continue;
    // Bare numbers are the number check's job; flagging them here too would duplicate the flag.
    if (/^\d+([.,]\d+)?[%x]?$/.test(t)) continue;
    const looksLikeTerm = /^[A-Z]/.test(t) || /[.#+]/.test(t) || /\d/.test(t);
    if (!looksLikeTerm) continue;
    if (STOP.has(t.toLowerCase())) continue;
    out.add(t.toLowerCase());
  }
  return [...out];
}

export function bulletIndex(bank: Bank): Map<string, { bullet: BankBullet; entryId: string }> {
  const idx = new Map<string, { bullet: BankBullet; entryId: string }>();
  for (const e of bank.entries) for (const b of e.bullets) idx.set(b.id, { bullet: b, entryId: e.id });
  return idx;
}

/** Everything the bank says, as one string, for checks that ask "is this anywhere in the bank". */
function bankCorpus(bank: Bank): string {
  return [
    bank.fullName,
    bank.headline,
    bank.summary,
    bank.location ?? "",
    ...bank.skillGroups.flatMap((g) => [g.name, ...g.skills]),
    ...bank.education.flatMap((e) => [e.institution, e.degree, e.field ?? "", e.start ?? "", e.end ?? "", e.gpa ?? "", e.honors ?? ""]),
    ...bank.certifications.flatMap((c) => [c.name, c.issuer ?? "", c.date ?? ""]),
    ...bank.entries.flatMap((e) => [e.organization, e.title, e.location ?? "", e.startDate ?? "", e.endDate ?? "", ...e.bullets.flatMap((b) => [b.text, b.metric ?? "", ...b.skills])]),
  ].join("\n");
}

/** Capitalised words every letter has, which are not claims. */
const LETTER_WORDS = new Set("dear hiring manager team sincerely regards best kind thank thanks hello hi re january february march april may june july august september october november december".split(" "));

/**
 * The cover letter gets the same two checks as a rewording, against the whole
 * bank: a number the bank does not contain, and a capitalised or symbol-bearing
 * term (where tool and employer names live) the bank does not contain. `allow`
 * is text the letter may quote freely, such as the job title, the company and
 * the contact's name. Nothing is changed; the flags are for the user to read.
 */
const DENIAL = /^(not|no|never|without|cannot|n't|lack|lacks|lacking|none|neither|nor)$/;
const CONTRAST = /^(but|however|though|although|while|whereas|yet|instead)$/;

/**
 * Words that appear in the letter only after a denial in the same clause:
 * "I do not hold NMC registration", "in C# and Python rather than Rust". The
 * denial stops at "but", "however" and the like, so in "I have not used Go but
 * I led Kubernetes migrations" Kubernetes is still a claim. A word that is
 * also used outside a denial anywhere in the letter is not returned.
 */
function deniedTerms(text: string): Set<string> {
  const deniedOnly = new Set<string>();
  const claimed = new Set<string>();
  for (const sentence of text.split(/(?<=[.!?;])\s+|\n+/)) {
    let negated = false;
    const tokens = sentence.toLowerCase().replace(/rather than/g, "not").replace(/n't\b/g, " not").match(/[a-z0-9#+.'-]+/g) ?? [];
    for (const raw of tokens) {
      const word = raw.replace(/[.']+$/, "");
      if (!word) continue;
      if (DENIAL.test(word)) negated = true;
      else if (CONTRAST.test(word)) negated = false;
      else (negated ? deniedOnly : claimed).add(word);
    }
  }
  for (const word of claimed) deniedOnly.delete(word);
  return deniedOnly;
}

export function validateCoverLetter(bank: Bank, text: string, allow: string[] = []): ValidationFlag[] {
  const flags: ValidationFlag[] = [];
  const corpus = bankCorpus(bank);
  // "2022." at the end of a sentence is the number 2022.
  const numbers = (s: string) => extractNumbers(s).map((n) => n.replace(/[.,]+$/, ""));
  const bankNumbers = new Set(numbers(corpus));
  const seen = new Set<string>();
  for (const n of numbers(text)) {
    if (bankNumbers.has(n) || seen.has(n)) continue;
    seen.add(n);
    flags.push({ kind: "cover_number", bulletId: null, detail: `The cover letter mentions "${n}", which is not in the bank.` });
  }

  const known = `${corpus}\n${allow.join("\n")}`.toLowerCase();
  // A sentence starts with a capital whatever the word is, so the first letter of each is lowered before looking for terms.
  // Then full stops go, so "reading." is the word and not a term with a dot in it.
  const body = text.replace(/(^|[.!?:]\s+|\n\s*)([A-Z])(?=[a-z])/g, (_m, lead: string, letter: string) => lead + letter.toLowerCase()).replace(/[.](?=\s|$)/g, " ");
  const denied = deniedTerms(text);
  for (const t of extractTerms(body)) {
    const bare = t.replace(/[.']+$/, "").replace(/'s$/, "");
    if (!bare || LETTER_WORDS.has(bare) || known.includes(bare)) continue;
    // Named only to say the candidate does not have it. That is the honest sentence, not a claim.
    if (denied.has(bare.toLowerCase())) continue;
    flags.push({ kind: "cover_term", bulletId: null, detail: `The cover letter names "${bare}", which is not in the bank or the posting's title.` });
  }
  return flags;
}

export function validateSelection(bank: Bank, selection: Selection): ValidatedSelection {
  const flags: ValidationFlag[] = [];
  const idx = bulletIndex(bank);
  const entryIds = new Set(bank.entries.map((e) => e.id));
  const bankText = bank.entries
    .flatMap((e) => e.bullets.map((b) => b.text))
    .concat(bank.summary)
    .join("\n");
  const bankNumbers = new Set(extractNumbers(bankText));

  const entries = selection.entries
    .filter((se) => {
      if (entryIds.has(se.entryId)) return true;
      flags.push({ kind: "missing_entry", bulletId: null, detail: `Entry ${se.entryId} is not in the bank; dropped.` });
      return false;
    })
    .map((se) => {
      const seen = new Set<string>();
      const bullets = se.bullets
        .filter((sb) => {
          if (seen.has(sb.id)) return false;
          seen.add(sb.id);
          const hit = idx.get(sb.id);
          if (!hit) {
            flags.push({ kind: "missing_bullet", bulletId: sb.id, detail: `Bullet ${sb.id} is not in the bank; dropped.` });
            return false;
          }
          if (hit.entryId !== se.entryId) {
            flags.push({
              kind: "missing_bullet",
              bulletId: sb.id,
              detail: `Bullet ${sb.id} belongs to a different entry; dropped.`,
            });
            return false;
          }
          return true;
        })
        .map((sb) => {
          if (!sb.rewording || sb.rewording.trim() === "") return { id: sb.id, rewording: null };
          const source = idx.get(sb.id)!.bullet.text;
          const reworded = sb.rewording.trim();
          if (reworded === source) return { id: sb.id, rewording: null };

          const srcNums = new Set(extractNumbers(source));
          for (const n of extractNumbers(reworded)) {
            if (!srcNums.has(n)) {
              flags.push({ kind: "added_number", bulletId: sb.id, detail: `"${n}" is not in the original bullet.` });
            }
          }
          const srcTerms = new Set(extractTerms(source));
          const srcLower = source.toLowerCase();
          for (const t of extractTerms(reworded)) {
            // Moving a clause puts a different word at the end of the sentence. "review." is the word review, not a new term.
            const bare = t.replace(/[.,;:!?'"]+$/, "");
            if (!bare || srcTerms.has(t) || srcLower.includes(bare)) continue;
            flags.push({ kind: "new_term", bulletId: sb.id, detail: `"${bare}" does not appear in the original bullet.` });
          }
          return { id: sb.id, rewording: reworded };
        });
      return { entryId: se.entryId, bullets };
    })
    .filter((se) => se.bullets.length > 0);

  const certIds = new Set(bank.certifications.map((c) => c.id));
  const seenCerts = new Set<string>();
  const certifications = selection.certifications.filter((id) => {
    if (seenCerts.has(id)) return false;
    seenCerts.add(id);
    if (certIds.has(id)) return true;
    flags.push({ kind: "missing_certification", bulletId: null, detail: `Certification ${id} is not in the bank; dropped.` });
    return false;
  });

  for (const n of extractNumbers(selection.summary)) {
    if (!bankNumbers.has(n)) {
      flags.push({ kind: "summary_number", bulletId: null, detail: `Summary mentions "${n}", which is not in the bank.` });
    }
  }

  if (entries.length === 0) {
    flags.push({ kind: "empty", bulletId: null, detail: "No bullets survived validation." });
  }

  return {
    selection: { ...selection, entries, certifications },
    flags,
  };
}
