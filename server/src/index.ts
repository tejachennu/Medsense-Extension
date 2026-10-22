import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { ZodError } from 'zod';
import { requireApiKey } from './auth.js';
import { config } from './config.js';
import { connectDb } from './db.js';
import { cases } from './routes/cases.js';
import { rules } from './routes/rules.js';
import { seedRules } from './services/rules.js';

const app = express();

// Only the extension calls this API; its origin is chrome-extension://<id>.
app.use(cors({ origin: [/^chrome-extension:\/\//] }));
app.use(express.json({ limit: '25mb' }));

app.get('/health', (_req, res) => res.json({ ok: true }));
app.use('/api', requireApiKey);
app.get('/api/me', (req, res) => res.json({ auditor: req.auditor, model: config.geminiModel }));
app.use('/api/cases', cases);
app.use('/api/rules', rules);

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ZodError) return res.status(400).json({ error: 'Invalid request', issues: err.issues });
  console.error(err);
  res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' });
});

await connectDb();
await seedRules();
app.listen(config.port, () => console.log(`MedSense API on http://localhost:${config.port}`));
