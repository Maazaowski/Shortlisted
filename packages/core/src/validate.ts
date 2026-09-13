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
            if (srcTerms.has(t) || srcLower.includes(t)) continue;
            flags.push({ kind: "new_term", bulletId: sb.id, detail: `"${t}" does not appear in the original bullet.` });
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
