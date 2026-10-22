import { RuleSet, type CaseDoc } from '../models.js';
import seed from '../rules/seed.json' with { type: 'json' };

// Generic rule sets first, then state- and package-specific ones, so specific items read last.
export async function rulesFor(c: CaseDoc, stage: string) {
  const sets = await RuleSet.find({
    active: true,
    stage: { $in: ['*', stage] },
    state: { $in: ['*', c.state ?? ''] },
    packageCode: { $in: ['*', ...c.packageCodes] },
  }).lean();
  const specificity = (r: { state?: string | null; packageCode?: string | null }) =>
    (r.state === '*' ? 0 : 1) + (r.packageCode === '*' ? 0 : 2);
  return sets.sort((a, b) => specificity(a) - specificity(b));
}

// Inserts the bundled example rule sets only when the collection is empty.
export async function seedRules(): Promise<void> {
  if (await RuleSet.estimatedDocumentCount()) return;
  await RuleSet.insertMany(seed);
  console.log(`Seeded ${seed.length} rule sets`);
}
