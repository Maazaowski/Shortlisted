import type { Bank, ResumeDiff, Selection } from "./schemas.js";
import { bulletIndex } from "./validate.js";

/**
 * What changed versus the base resume (every bullet with inBase = true, in
 * bank order). This is what the user reads instead of the whole document.
 */
export function diffAgainstBase(bank: Bank, selection: Selection): ResumeDiff {
  const idx = bulletIndex(bank);
  const baseIds: string[] = [];
  for (const e of bank.entries) for (const b of e.bullets) if (b.inBase) baseIds.push(b.id);
  const baseSet = new Set(baseIds);

  const selectedIds: string[] = [];
  const reworded: ResumeDiff["reworded"] = [];
  for (const e of selection.entries) {
    for (const b of e.bullets) {
      selectedIds.push(b.id);
      if (b.rewording) {
        const src = idx.get(b.id)?.bullet.text ?? "";
        reworded.push({ id: b.id, from: src, to: b.rewording });
      }
    }
  }
  const selectedSet = new Set(selectedIds);

  const addedBullets = selectedIds.filter((id) => !baseSet.has(id)).map((id) => ({ id, text: idx.get(id)?.bullet.text ?? "" }));
  const removedBullets = baseIds.filter((id) => !selectedSet.has(id)).map((id) => ({ id, text: idx.get(id)?.bullet.text ?? "" }));

  const common = baseIds.filter((id) => selectedSet.has(id));
  const commonSelectedOrder = selectedIds.filter((id) => baseSet.has(id));
  let reorderedCount = 0;
  for (let i = 0; i < common.length; i++) if (common[i] !== commonSelectedOrder[i]) reorderedCount++;

  return {
    headline: { from: bank.headline, to: selection.headline },
    summary: { from: bank.summary, to: selection.summary },
    addedBullets,
    removedBullets,
    reworded,
    reorderedCount,
  };
}
