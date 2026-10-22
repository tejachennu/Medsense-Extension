import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';

export default defineBackground(() => {
  // Clicking the toolbar icon opens the side panel next to the TMS page.
  browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
});
