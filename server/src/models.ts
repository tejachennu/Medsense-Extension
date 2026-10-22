import mongoose, { Schema, type InferSchemaType } from 'mongoose';

export const STAGES = ['preauth', 'claim'] as const;
export type Stage = (typeof STAGES)[number];
export const STATUSES = ['present', 'partial', 'absent', 'unclear'] as const;

const caseSchema = new Schema(
  {
    caseId: { type: String, required: true, unique: true },
    patientName: String,
    pmjayId: String,
    state: String,
    hospital: String,
    packageCodes: { type: [String], default: [] },
    packageNames: { type: [String], default: [] },
    caseType: String,
    amountRequested: Number,
    status: String,
    // Everything else the scraper saw, kept verbatim for debugging selector drift.
    raw: { type: Schema.Types.Mixed, default: {} },
    updatedBy: String,
  },
  { timestamps: true },
);

const documentSchema = new Schema(
  {
    caseId: { type: String, required: true, index: true },
    stage: { type: String, enum: STAGES, required: true },
    label: { type: String, required: true },
    page: { type: Number, default: 1 },
    mimeType: { type: String, required: true },
    sha256: { type: String, required: true },
    bytes: Number,
    fileId: { type: Schema.Types.ObjectId, required: true },
    capturedBy: String,
  },
  { timestamps: true },
);
documentSchema.index({ caseId: 1, stage: 1, sha256: 1 }, { unique: true });

const checklistItemSchema = new Schema(
  {
    id: { type: String, required: true },
    title: { type: String, required: true },
    description: String,
    required: { type: Boolean, default: true },
  },
  { _id: false },
);

// A rule set applies when its state/stage/packageCode match the case; "*" matches anything.
const ruleSetSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    name: String,
    state: { type: String, default: '*' },
    stage: { type: String, enum: [...STAGES, '*'], default: '*' },
    packageCode: { type: String, default: '*' },
    items: { type: [checklistItemSchema], default: [] },
    notes: String,
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

const findingSchema = new Schema(
  {
    id: String,
    title: String,
    status: { type: String, enum: STATUSES },
    evidence: String,
    missing: String,
    pages: { type: [Number], default: [] },
  },
  { _id: false },
);

const auditSchema = new Schema(
  {
    caseId: { type: String, required: true, index: true },
    stage: { type: String, enum: STAGES, required: true },
    model: String,
    ruleKeys: [String],
    documentIds: [Schema.Types.ObjectId],
    summary: String,
    findings: { type: [findingSchema], default: [] },
    counts: { present: Number, partial: Number, absent: Number, unclear: Number },
    runBy: String,
    durationMs: Number,
  },
  { timestamps: true },
);

const chatSchema = new Schema(
  {
    caseId: { type: String, required: true, index: true },
    role: { type: String, enum: ['user', 'model'], required: true },
    text: { type: String, required: true },
    by: String,
  },
  { timestamps: true },
);

export const Case = mongoose.model('Case', caseSchema);
export const CaseDocument = mongoose.model('Document', documentSchema);
export const RuleSet = mongoose.model('RuleSet', ruleSetSchema);
export const Audit = mongoose.model('Audit', auditSchema);
export const ChatMessage = mongoose.model('ChatMessage', chatSchema);

export type CaseDoc = InferSchemaType<typeof caseSchema>;
export type RuleSetDoc = InferSchemaType<typeof ruleSetSchema>;
export type AuditDoc = InferSchemaType<typeof auditSchema>;
