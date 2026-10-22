import { createHash } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { pages } from '../db.js';
import { Audit, Case, CaseDocument, ChatMessage, STAGES, STATUSES } from '../models.js';
import { auditDocuments, discussCase, type PageImage } from '../services/gemini.js';
import { rulesFor } from '../services/rules.js';

export const cases = Router();

const caseBody = z.object({
  caseId: z.string().min(1),
  patientName: z.string().optional(),
  pmjayId: z.string().optional(),
  state: z.string().optional(),
  hospital: z.string().optional(),
  packageCodes: z.array(z.string()).default([]),
  packageNames: z.array(z.string()).default([]),
  caseType: z.string().optional(),
  amountRequested: z.number().optional(),
  status: z.string().optional(),
  raw: z.record(z.string(), z.unknown()).default({}),
});

cases.post('/', async (req, res) => {
  const body = caseBody.parse(req.body);
  const doc = await Case.findOneAndUpdate(
    { caseId: body.caseId },
    { ...body, updatedBy: req.auditor },
    { upsert: true, new: true },
  );
  res.json(doc);
});

cases.get('/:caseId', async (req, res) => {
  const { caseId } = req.params;
  const [c, documents, audit] = await Promise.all([
    Case.findOne({ caseId }).lean(),
    CaseDocument.find({ caseId }).sort({ stage: 1, createdAt: 1 }).lean(),
    Audit.findOne({ caseId }).sort({ createdAt: -1 }).lean(),
  ]);
  if (!c) return res.status(404).json({ error: 'Case not found' });
  res.json({ case: c, documents, audit });
});

const documentBody = z.object({
  stage: z.enum(STAGES),
  label: z.string().min(1),
  page: z.number().int().positive().default(1),
  mimeType: z.string().regex(/^(image\/(png|jpeg|webp)|application\/pdf)$/),
  dataBase64: z.string().min(1),
});

cases.post('/:caseId/documents', async (req, res) => {
  const { caseId } = req.params;
  const body = documentBody.parse(req.body);
  if (!(await Case.exists({ caseId }))) return res.status(404).json({ error: 'Save the case first' });

  const data = Buffer.from(body.dataBase64, 'base64');
  const sha256 = createHash('sha256').update(data).digest('hex');
  const existing = await CaseDocument.findOne({ caseId, stage: body.stage, sha256 }).lean();
  if (existing) return res.json({ document: existing, duplicate: true });

  const upload = pages().openUploadStream(`${caseId}/${body.stage}/${sha256}`, {
    metadata: { caseId, contentType: body.mimeType },
  });
  upload.end(data);
  await new Promise((resolve, reject) => upload.on('finish', resolve).on('error', reject));

  const document = await CaseDocument.create({
    caseId,
    stage: body.stage,
    label: body.label,
    page: body.page,
    mimeType: body.mimeType,
    sha256,
    bytes: data.length,
    fileId: upload.id,
    capturedBy: req.auditor,
  });
  res.status(201).json({ document, duplicate: false });
});

// Lets the reviewer re-pull a stage from scratch.
cases.delete('/:caseId/documents', async (req, res) => {
  const { caseId } = req.params;
  const stage = z.enum(STAGES).parse(req.query.stage);
  const docs = await CaseDocument.find({ caseId, stage }).lean();
  await Promise.all(docs.map((d) => pages().delete(d.fileId)));
  await CaseDocument.deleteMany({ caseId, stage });
  res.json({ deleted: docs.length });
});

async function readPage(fileId: unknown): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of pages().openDownloadStream(fileId as never)) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

cases.post('/:caseId/audit', async (req, res) => {
  const { caseId } = req.params;
  const { stage } = z.object({ stage: z.enum(STAGES) }).parse(req.body);
  const c = await Case.findOne({ caseId }).lean();
  if (!c) return res.status(404).json({ error: 'Case not found' });

  const docs = await CaseDocument.find({ caseId, stage }).sort({ createdAt: 1 }).lean();
  if (!docs.length) return res.status(400).json({ error: `No ${stage} documents captured yet` });
  const totalBytes = docs.reduce((sum, d) => sum + (d.bytes ?? 0), 0);
  if (totalBytes > config.maxInlineBytes) {
    return res.status(413).json({ error: `Documents total ${(totalBytes / 1e6).toFixed(1)} MB; capture fewer or smaller pages` });
  }

  const ruleSets = await rulesFor(c, stage);
  if (!ruleSets.length) return res.status(400).json({ error: 'No rule sets match this case' });

  const images: PageImage[] = await Promise.all(
    docs.map(async (d) => ({ label: d.label, page: d.page ?? 1, mimeType: d.mimeType, data: await readPage(d.fileId) })),
  );

  const started = Date.now();
  const result = await auditDocuments(c, stage, ruleSets, images);
  const counts = Object.fromEntries(STATUSES.map((s) => [s, result.findings.filter((f) => f.status === s).length]));

  const audit = await Audit.create({
    caseId,
    stage,
    model: config.geminiModel,
    ruleKeys: ruleSets.map((r) => r.key),
    documentIds: docs.map((d) => d._id),
    summary: result.summary,
    findings: result.findings,
    counts,
    runBy: req.auditor,
    durationMs: Date.now() - started,
  });
  res.json(audit);
});

cases.get('/:caseId/chat', async (req, res) => {
  res.json(await ChatMessage.find({ caseId: req.params.caseId }).sort({ createdAt: 1 }).lean());
});

cases.post('/:caseId/chat', async (req, res) => {
  const { caseId } = req.params;
  const { question } = z.object({ question: z.string().min(1).max(2000) }).parse(req.body);
  const c = await Case.findOne({ caseId }).lean();
  if (!c) return res.status(404).json({ error: 'Case not found' });

  const [audit, history] = await Promise.all([
    Audit.findOne({ caseId }).sort({ createdAt: -1 }).lean(),
    ChatMessage.find({ caseId }).sort({ createdAt: -1 }).limit(20).lean(),
  ]);
  const answer = await discussCase(
    c,
    audit,
    history.reverse().map((m) => ({ role: m.role as 'user' | 'model', text: m.text })),
    question,
  );
  await ChatMessage.insertMany([
    { caseId, role: 'user', text: question, by: req.auditor },
    { caseId, role: 'model', text: answer },
  ]);
  res.json({ answer });
});
