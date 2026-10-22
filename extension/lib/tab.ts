import { browser } from 'wxt/browser';
import type { CapturedPage, ContentRequest, ContentResponse } from './messages';

export async function activeTmsTab() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url?.startsWith('https://payer.nha.gov.in/')) {
    throw new Error('Switch to a payer.nha.gov.in tab first');
  }
  return tab as typeof tab & { id: number; windowId: number };
}

export async function sendToTab<T>(tabId: number, message: ContentRequest): Promise<T> {
  let res: ContentResponse<T> | undefined;
  try {
    res = await browser.tabs.sendMessage(tabId, message);
  } catch {
    throw new Error('MedSense is not loaded in this tab. Reload the TMS page and try again.');
  }
  if (!res) throw new Error('No response from the TMS page');
  if (!res.ok) throw new Error(res.error);
  return res.data;
}

// Fallback when the page image can't be fetched directly: screenshot the tab and crop to the viewer.
export async function screenshotElement(windowId: number, page: CapturedPage): Promise<{ mimeType: string; dataBase64: string }> {
  const dataUrl = await browser.tabs.captureVisibleTab(windowId, { format: 'png' });
  const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
  const { x, y, width, height } = page.rect;
  const sx = Math.max(0, x * page.dpr);
  const sy = Math.max(0, y * page.dpr);
  const sw = Math.min(bitmap.width - sx, width * page.dpr);
  const sh = Math.min(bitmap.height - sy, height * page.dpr);
  const canvas = new OffscreenCanvas(sw, sh);
  canvas.getContext('2d')!.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { mimeType: 'image/jpeg', dataBase64: btoa(binary) };
}
