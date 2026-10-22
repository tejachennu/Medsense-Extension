// Everything the content script knows about the TMS page lives here. When NHA changes the
// portal, fix it in this file or override it at runtime from Settings → Selector overrides.

export type CaseField = 'patientName' | 'pmjayId' | 'state' | 'hospital' | 'caseType' | 'amountRequested' | 'status';

export interface TmsSelectors {
  /** Regex source for the case number shown on the case page. */
  caseIdPattern: string;
  /** Regex source for HBP package codes (e.g. MG029A). */
  packageCodePattern: string;
  /** Visible label texts that precede each field's value. */
  fieldLabels: Record<CaseField, string[]>;
  /** The document verification viewer. */
  viewer: {
    image: string;
    title: string;
    counter: string;
    next: string;
  };
}

export const defaultSelectors: TmsSelectors = {
  caseIdPattern: '\\b20\\d{14}\\b',
  packageCodePattern: '\\b[A-Z]{2}\\d{3}[A-Z]?\\b',
  fieldLabels: {
    patientName: ['Patient Name', 'Beneficiary Name', 'Name'],
    pmjayId: ['PMJAY ID', 'PM-JAY ID', 'Beneficiary ID'],
    state: ['State', 'Scheme State'],
    hospital: ['Hospital Name', 'Hospital'],
    caseType: ['Case Type'],
    amountRequested: ['Preauth Amount', 'Amount Requested', 'Claim Amount'],
    status: ['Case Status', 'Status'],
  },
  viewer: {
    image: '.document-viewer img, .doc-viewer img, img.document-image, canvas.document-canvas, embed[type="application/pdf"], iframe.document-frame',
    title: '.document-viewer .document-title, .doc-viewer h4, .document-title',
    counter: '.document-viewer .page-count, .doc-viewer .counter, .page-count',
    next: '.document-viewer .next, .doc-viewer button.next, button[aria-label="Next"]',
  },
};

export function mergeSelectors(overridesJson: string): TmsSelectors {
  if (!overridesJson.trim()) return defaultSelectors;
  const o = JSON.parse(overridesJson) as Partial<TmsSelectors>;
  return {
    ...defaultSelectors,
    ...o,
    fieldLabels: { ...defaultSelectors.fieldLabels, ...o.fieldLabels },
    viewer: { ...defaultSelectors.viewer, ...o.viewer },
  };
}
