import { Router } from 'express';
import { z } from 'zod';
import { RuleSet, STAGES } from '../models.js';

export const rules = Router();

rules.get('/', async (_req, res) => {
  res.json(await RuleSet.find().sort({ key: 1 }).lean());
});

const ruleSetBody = z.object({
  name: z.string().optional(),
  state: z.string().default('*'),
  stage: z.enum([...STAGES, '*']).default('*'),
  packageCode: z.string().default('*'),
  notes: z.string().optional(),
  active: z.boolean().default(true),
  items: z.array(
    z.object({
      id: z.string().min(1),
      title: z.string().min(1),
      description: z.string().optional(),
      required: z.boolean().default(true),
    }),
  ),
});

rules.put('/:key', async (req, res) => {
  const body = ruleSetBody.parse(req.body);
  res.json(await RuleSet.findOneAndUpdate({ key: req.params.key }, body, { upsert: true, new: true }));
});
