import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import type { CapturedPage, ContentRequest, ContentResponse, ScrapedCase } from '@/lib/messages';
import { mergeSelectors, type CaseField, type TmsSelectors } from '@/lib/selectors';
import { settingsItem } from '@/lib/settings';

// Read-only by design: this script reads the page and clicks the viewer's "next" arrow.
// It never touches CORRECT / INCORRECT, adjudication or submit controls.
export default defineContentScript({
  matches: ['https://payer.nha.gov.in/*'],
  main() {
    browser.runtime.onMessage.addListener((message: ContentRequest, _sender, sendResponse) => {
      handle(message).then(
        (data) => sendResponse({ ok: true, data } satisfies ContentResponse<unknown>),
        (err: unknown) => sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) }),
      );
      return true;
    });
  },
});

async function selectors(): Promise<TmsSelectors> {
  return mergeSelectors((await settingsItem.getValue()).selectorOverrides);
}

async function handle(message: ContentRequest): Promise<unknown> {
  const s = await selectors();
  switch (message.type) {
    case 'readCase':
      return readCase(s);
    case 'captureCurrent':
      return captureCurrent(s);
    case 'nextDocument':
      return nextDocument(s);
  }
}

const textOf = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

// Finds a leaf element whose text is one of the labels and returns the text that follows it.
function fieldByLabel(labels: string[]): string | undefined {
  const wanted = labels.map((l) => l.toLowerCase());
  for (const el of document.body.querySelectorAll('*')) {
    if (el.children.length) continue;
    const text = textOf(el).toLowerCase().replace(/[:*\s]+$/, '');
    if (!wanted.includes(text)) continue;
    const value = textOf(el.nextElementSibling) || textOf(el.parentElement?.nextElementSibling);
    if (value) return value;
  }
}

function readCase(s: TmsSelectors): ScrapedCase {
  const pageText = document.body.innerText;
  const caseId = pageText.match(new RegExp(s.caseIdPattern))?.[0];
  if (!caseId) throw new Error('No case number found. Open a case in TMS first.');

  const fields = Object.fromEntries(
    (Object.keys(s.fieldLabels) as CaseField[]).map((f) => [f, fieldByLabel(s.fieldLabels[f])]),
  ) as Record<CaseField, string | undefined>;
  const amount = fields.amountRequested?.replace(/[^\d.]/g, '');
  const packageCodes = [...new Set(pageText.match(new RegExp(s.packageCodePattern, 'g')) ?? [])];

  return {
    caseId,
    patientName: fields.patientName,
    pmjayId: fields.pmjayId,
    state: fields.state,
    hospital: fields.hospital,
    caseType: fields.caseType,
    amountRequested: amount ? Number(amount) : undefined,
    status: fields.status,
    packageCodes,
    packageNames: [],
    raw: { url: location.href, title: document.title, fields },
  };
}

function viewerElement(s: TmsSelectors): HTMLElement {
  const el = document.querySelector<HTMLElement>(s.viewer.image);
  if (!el) throw new Error('Document viewer not found. Open the case documents in TMS first.');
  return el;
}

function readCounter(s: TmsSelectors): CapturedPage['counter'] {
  const m = textOf(document.querySelector(s.viewer.counter)).match(/(\d+)\s*\/\s*(\d+)/);
  return m ? { index: Number(m[1]), total: Number(m[2]) } : null;
}

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];

async function blobToBase64(blob: Blob): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  return dataUrl.slice(dataUrl.indexOf(',') + 1);
}

// Tries to get the original file; returns null so the panel falls back to a screenshot.
async function readImage(el: HTMLElement): Promise<CapturedPage['image']> {
  try {
    if (el instanceof HTMLCanvasElement) {
      const blob = await new Promise<Blob | null>((r) => el.toBlob(r, 'image/jpeg', 0.9));
      return blob ? { mimeType: 'image/jpeg', dataBase64: await blobToBase64(blob) } : null;
    }
    const src = (el as HTMLImageElement).currentSrc || (el as HTMLImageElement).src || (el as HTMLObjectElement).data;
    if (!src) return null;
    const res = await fetch(src, { credentials: 'include' });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!ALLOWED_TYPES.includes(blob.type)) return null;
    return { mimeType: blob.type, dataBase64: await blobToBase64(blob) };
  } catch {
    return null;
  }
}

async function captureCurrent(s: TmsSelectors): Promise<CapturedPage> {
  const el = viewerElement(s);
  el.scrollIntoView({ block: 'center' });
  const r = el.getBoundingClientRect();
  return {
    label: textOf(document.querySelector(s.viewer.title)) || 'Document',
    counter: readCounter(s),
    image: await readImage(el),
    rect: { x: r.x, y: r.y, width: r.width, height: r.height },
    dpr: window.devicePixelRatio,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function viewerSignature(s: TmsSelectors): string {
  const el = document.querySelector<HTMLImageElement>(s.viewer.image);
  return [el?.currentSrc ?? el?.src ?? '', textOf(document.querySelector(s.viewer.title)), textOf(document.querySelector(s.viewer.counter))].join('|');
}

// Clicks "next" and waits until the viewer shows a different, fully loaded document.
async function nextDocument(s: TmsSelectors): Promise<void> {
  const next = document.querySelector<HTMLElement>(s.viewer.next);
  if (!next) throw new Error('Viewer "next" button not found');
  const before = viewerSignature(s);
  next.click();
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    await sleep(250);
    if (viewerSignature(s) === before) continue;
    const img = document.querySelector(s.viewer.image);
    if (!(img instanceof HTMLImageElement) || img.complete) return;
  }
  throw new Error('Timed out waiting for the next document to render');
}
