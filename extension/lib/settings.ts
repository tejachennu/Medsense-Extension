import { storage } from 'wxt/utils/storage';

export interface Settings {
  apiUrl: string;
  apiKey: string;
  /** JSON merged over defaultSelectors; empty means use the defaults. */
  selectorOverrides: string;
}

export const settingsItem = storage.defineItem<Settings>('local:settings', {
  fallback: { apiUrl: 'http://localhost:8787', apiKey: '', selectorOverrides: '' },
});
