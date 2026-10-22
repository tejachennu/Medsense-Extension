import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var ${name} (see .env.example)`);
  return value;
}

// API_KEYS is "name:key,name:key" so every action can be attributed to an auditor.
function parseKeys(raw: string): Map<string, string> {
  const keys = new Map<string, string>();
  for (const entry of raw.split(',').map((s) => s.trim()).filter(Boolean)) {
    const [name, key] = entry.includes(':') ? entry.split(/:(.*)/s) : ['auditor', entry];
    keys.set(key, name);
  }
  return keys;
}

export const config = {
  port: Number(process.env.PORT ?? 8787),
  mongoUri: required('MONGODB_URI'),
  apiKeys: parseKeys(required('API_KEYS')),
  geminiModel: process.env.GEMINI_MODEL || 'gemini-flash-latest',
  geminiChatModel: process.env.GEMINI_CHAT_MODEL || process.env.GEMINI_MODEL || 'gemini-pro-latest',
  // Gemini rejects inline requests much above 20 MB; stay under it.
  maxInlineBytes: 18 * 1024 * 1024,
};
