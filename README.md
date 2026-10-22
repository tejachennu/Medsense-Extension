# MedSense

A Chrome side-panel extension that sits next to the PMJAY **TMS payer portal** (`payer.nha.gov.in`), captures a case's documents and has **Gemini** check them against a document checklist. Results, documents and chat history are stored in **MongoDB**.

MedSense only gives advice. It reads the page and clicks the document viewer's "next" arrow. It never clicks CORRECT/INCORRECT, never adjudicates and never submits anything. The reviewer makes every decision in TMS.

```
TMS tab (payer.nha.gov.in)
  └─ content script ── reads case fields, steps through the document viewer, grabs each page
        ▲ messages
Side panel (React) ── Audit / Chat / Settings
        │ HTTPS + X-API-Key
        ▼
server/ (Express) ── MongoDB: cases, documents (GridFS), rule sets, audits, chat
        └─ Gemini: page images + checklist → present / partial / absent / unclear per item
```

## Repository layout

| Path | What |
|---|---|
| `extension/` | WXT + React + TypeScript, Manifest V3 |
| `extension/entrypoints/content.ts` | Runs on TMS; `readCase`, `captureCurrent`, `nextDocument` |
| `extension/entrypoints/sidepanel/` | Side panel UI |
| `extension/lib/selectors.ts` | **All TMS selectors.** Fix these when the portal changes, or override them from Settings |
| `server/` | Express API, Mongoose models, Gemini calls |
| `server/src/rules/seed.json` | Example checklist rule sets loaded on first start |

## Run it

### 1. Server

You need Node 20+ and MongoDB (local `mongod`, Docker `mongo:8`, or MongoDB Atlas).

```bash
cd server
cp .env.example .env      # set MONGODB_URI, API_KEYS, GEMINI_API_KEY
npm install
npm run dev               # http://localhost:8787
```

- `API_KEYS` is `name:key,name:key`. Each auditor gets one key, so every capture, audit and chat message is recorded with who did it.
- `GEMINI_MODEL` (default `gemini-flash-latest`) runs the document checks. `GEMINI_CHAT_MODEL` (default `gemini-pro-latest`) runs chat.
- To keep data in India, use Vertex AI instead of an AI Studio key: set `GOOGLE_GENAI_USE_VERTEXAI=true`, `GOOGLE_CLOUD_PROJECT`, and `GOOGLE_CLOUD_LOCATION=asia-south1`, and authenticate with `gcloud auth application-default login` or a service account.

### 2. Extension

```bash
cd extension
npm install
npm run dev        # opens Chrome with the extension loaded and hot reload
npm run build      # production build in .output/chrome-mv3
npm run zip        # zip for the Chrome Web Store or internal distribution
```

To load a build by hand: go to `chrome://extensions`, turn on Developer mode, click **Load unpacked** and choose `extension/.output/chrome-mv3`.

### 3. Use it

1. Click the MedSense toolbar icon to open the side panel. In **Settings**, enter the server URL and your API key, then click **Save & test connection**.
2. Open a case in TMS and click **Read case from page**. Check **State** and **Packages**, because they decide which rules apply.
3. Open the case's document viewer on the first document, choose Pre-auth or Claim, and click **Smart run**. Or use **Pull documents** and **Audit saved docs** separately. Pause and Stop work while documents are being pulled.
4. Read the findings, then use **Chat** to ask follow-up questions.

## Before using it on real cases

- **Selectors:** `extension/lib/selectors.ts` contains guesses. Open a real case, press F12, and put the real selectors for the viewer image, title, page counter and next button in that file or in Settings → Selector overrides. Case fields are found by their visible labels, such as "Case Type", so adjust `fieldLabels` too.
- **Rules:** `server/src/rules/seed.json` holds **examples**. Replace them with the current NHA HBP mandatory-document lists for each package and stage, and with each state's SHA rules. Use `PUT /api/rules/:key`. A rule set applies when its `state`, `stage` and `packageCode` match the case; `*` matches anything.
- **Authorization and data protection:** these pages contain patient health data. Get written approval from NHA/SHA, or under your TPA/ISA contract, before automating the portal or sending documents to Gemini. Follow the DPDP Act 2023: keep data in India (Vertex AI `asia-south1`, MongoDB Atlas in an Indian region), encrypt it, and set a retention period.
- Gemini inline requests are limited to about 20 MB, so an audit refuses a stage whose saved pages are larger than 18 MB.

## API

All `/api` routes need the `X-API-Key` header.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/me` | Check the key; shows the auditor name and model |
| POST | `/api/cases` | Create or update a case from the scraped fields |
| GET | `/api/cases/:caseId` | Get the case, its document metadata and the latest audit |
| POST | `/api/cases/:caseId/documents` | Upload one page (`stage`, `label`, `page`, `mimeType`, `dataBase64`). Identical pages are skipped |
| DELETE | `/api/cases/:caseId/documents?stage=` | Delete a stage's pages so it can be pulled again |
| POST | `/api/cases/:caseId/audit` | Run the Gemini check for a stage |
| GET/POST | `/api/cases/:caseId/chat` | Get chat history, or ask a question |
| GET | `/api/rules` | List rule sets |
| PUT | `/api/rules/:key` | Create or update a rule set |
