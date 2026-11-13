# Marcelo Write

A mobile-first writing workspace with a static frontend and Node.js ESM serverless functions for Vercel.

## Included

- **Humanizer, Rewriter and Paraphraser:** edit a user's own draft for clarity, flow and tone while preserving meaning. No detector scoring, detector evasion, guaranteed Turnitin/GPTZero claims, or essay ghostwriting.
- **Citation Generator:** DOI metadata from Crossref, ISBN metadata from Open Library, and webpage metadata from public HTML meta tags. Supports APA 7, MLA 9, Chicago, Harvard, IEEE and AMA, with reference/in-text/both output.
- **Reference Generator:** asks the configured model to identify up to five claims, then searches Crossref and returns real indexed works only. Suggestions are explicitly labelled for verification.
- TXT, DOCX, PDF and image input. Browser-side extraction uses Mammoth, PDF.js and Tesseract.js. OCR text should be reviewed before use.
- Free rewrite allowance: one successful rewrite of up to 50 words, enforced by a signed HttpOnly cookie. The localStorage value is only a UI mirror; the server cookie is authoritative. Citation and reference lookups are not charged against the rewrite allowance.
- Responsive dark UI, MW favicon, one-session intro animation, full-screen accordion menu, pricing/blog/resources pages.

## 1. Run locally

Requirements: Node.js 20+ and a Vercel account/CLI.

```bash
npm install
npx vercel dev
```

Create a local `.env` file (do not commit it):

```env
API_URL=https://api.openai.com/v1
API_KEY=your_secret_api_key
MODEL=your-chat-completions-model
USAGE_COOKIE_SECRET=replace-with-a-long-random-secret
```

`API_URL` may be the base URL of any provider that supports the OpenAI-compatible `/chat/completions` interface, or the complete `/chat/completions` endpoint. `API_KEY` and `MODEL` are server-only environment variables. Never add them to `index.html`, `app.js`, or any `VITE_`/`NEXT_PUBLIC_` variable.

The citation generator works without an AI key. The three rewrite tools and Reference Generator require the AI environment variables.

## 2. Deploy to Vercel

1. Push this folder to a GitHub repository.
2. In Vercel, choose **Add New → Project** and import the repository.
3. Keep the framework preset as **Other**. No build command is required; the root `index.html` is the static entry point.
4. Add `API_URL`, `API_KEY`, `MODEL`, and `USAGE_COOKIE_SECRET` under **Settings → Environment Variables** for the environments you intend to deploy.
5. Deploy. Vercel serves `index.html`, `styles.css`, `app.js`, and `favicon.svg` as static assets and exposes the files in `/api` as serverless functions.
6. Test `/api/rewrite`, `/api/cite` and `/api/refs` from the live site. Keep API keys out of browser source and Git history.

## 3. API overview

### `POST /api/rewrite`

```json
{
  "text": "Your own draft, up to 50 words",
  "tool": "humanizer",
  "style": "Academic",
  "tone": "Academic",
  "intensity": "Medium",
  "mode": "Standard"
}
```

Returns `{ "output": "...", "words": 12, "remaining": 0 }`. The first successful rewrite sets the signed HttpOnly `mw_free` cookie. Further attempts return HTTP 402. Text above 50 words returns HTTP 413. A cookie-only anonymous limit is not an identity-grade paywall: users can clear cookies or use another browser. Before paid launch, replace it with account-based usage records and server-side plan entitlements.

### `POST /api/cite`

```json
{ "identifier": "10.xxxx/example" }
```

Returns normalized source metadata. Formatting is performed client-side.

### `POST /api/refs`

```json
{ "text": "A paragraph with factual claims..." }
```

Returns up to five claims and Crossref matches. The model proposes search terms only; it does not invent the returned reference records.

## 4. Important production notes

- The free cookie is a lightweight anonymous trial control, not a tamper-proof billing system. Clearing cookies resets the anonymous allowance. Account sign-in and database-backed entitlements are required for reliable paid usage.
- The URL citation fetcher rejects localhost/private IP ranges, validates DNS results, checks redirects and limits response size. For a high-assurance public deployment, route URL metadata fetching through a dedicated egress proxy with DNS/IP pinning and strict network-level deny rules.
- Add rate limiting (for example, Vercel Firewall or an edge rate limiter) to all public API routes before launch. Add request-size, timeout, spend and abuse controls appropriate to your provider.
- Crossref/Open Library and OCR libraries are third-party services/libraries. Their availability, terms and metadata quality can change.
- No citation service can guarantee that a source supports a particular sentence. Verify every reference against the publisher and your institution's citation guide.
- This starter does not implement sign-in, billing, Paystack checkout/webhooks, saved history or a database. Those are intentionally reserved for the next phase.

## 5. Project structure

```text
marcelo-write/
├── api/
│   ├── _lib.js
│   ├── rewrite.js
│   ├── cite.js
│   └── refs.js
├── app.js
├── index.html
├── styles.css
├── favicon.svg
├── package.json
├── vercel.json
└── README.md
```

## Responsible-use note

Rewrite your own work and follow your school's AI policy.
