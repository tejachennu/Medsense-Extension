import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'MedSense',
    description: 'AI document audit side panel for the PMJAY TMS payer portal. Advisory only: it never submits or adjudicates.',
    permissions: ['sidePanel', 'storage', 'activeTab', 'tabs'],
    host_permissions: ['https://payer.nha.gov.in/*'],
    action: { default_title: 'Open MedSense' },
  },
});
