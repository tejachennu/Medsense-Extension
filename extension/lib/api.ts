import type { ScrapedCase } from './messages';
import { settingsItem } from './settings';

export type Stage = 'preauth' | 'claim';
export type Status = 'present' | 'partial' | 'absent' | 'unclear';

export interface Finding {
  id: string;
  title: string;
  status: Status;
  evidence: string;
  missing: string;
  pages: number[];
}

export interface AuditResult {
  _id: string;
  stage: Stage;
  model: string;
  summary: string;
  findings: Finding[];
  counts: Record<Status, number>;
  createdAt: string;
}

export interface ChatEntry {
  role: 'user' | 'model';
  text: string;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { apiUrl, apiKey } = await settingsItem.getValue();
  const res = await fetch(`${apiUrl.replace(/\/$/, '')}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey, ...init.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body as T;
}

const post = <T>(path: string, body: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body) });
const enc = encodeURIComponent;

export const api = {
  me: () => request<{ auditor: string; model: string }>('/api/me'),
  saveCase: (c: ScrapedCase) => post('/api/cases', c),
  getCase: (caseId: string) => request<{ audit: AuditResult | null }>(`/api/cases/${enc(caseId)}`),
  clearDocuments: (caseId: string, stage: Stage) =>
    request(`/api/cases/${enc(caseId)}/documents?stage=${stage}`, { method: 'DELETE' }),
  uploadDocument: (caseId: string, doc: { stage: Stage; label: string; page: number; mimeType: string; dataBase64: string }) =>
    post<{ duplicate: boolean }>(`/api/cases/${enc(caseId)}/documents`, doc),
  audit: (caseId: string, stage: Stage) => post<AuditResult>(`/api/cases/${enc(caseId)}/audit`, { stage }),
  chatHistory: (caseId: string) => request<ChatEntry[]>(`/api/cases/${enc(caseId)}/chat`),
  ask: (caseId: string, question: string) => post<{ answer: string }>(`/api/cases/${enc(caseId)}/chat`, { question }),
};
