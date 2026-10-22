// Messages the side panel sends to the content script on the TMS tab.

export interface ScrapedCase {
  caseId: string;
  patientName?: string;
  pmjayId?: string;
  state?: string;
  hospital?: string;
  caseType?: string;
  amountRequested?: number;
  status?: string;
  packageCodes: string[];
  packageNames: string[];
  raw: Record<string, unknown>;
}

export interface CapturedPage {
  label: string;
  /** From the viewer's "5/6" counter; null when the page has no counter. */
  counter: { index: number; total: number } | null;
  /** Null when the image could not be read directly; the panel then screenshots `rect`. */
  image: { mimeType: string; dataBase64: string } | null;
  rect: { x: number; y: number; width: number; height: number };
  dpr: number;
}

export type ContentRequest = { type: 'readCase' } | { type: 'captureCurrent' } | { type: 'nextDocument' };

export type ContentResponse<T> = { ok: true; data: T } | { ok: false; error: string };
