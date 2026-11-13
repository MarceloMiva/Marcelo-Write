import { body, json, callModel, crossrefWork } from './_lib.js';
export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });
  try {
    const { text = '' } = await body(req); if (typeof text !== 'string' || text.trim().length < 40) return json(res, 400, { error: 'Paste at least a short paragraph so claims can be identified.' });
    if (text.length > 12000) return json(res, 413, { error: 'Please keep the text under 12,000 characters.' });
    const raw = await callModel([
      { role: 'system', content: 'Identify up to five factual or research claims in the supplied text that would benefit from external sources. Return ONLY valid JSON: {"claims":[{"claim":"short exact or faithful claim","query":"specific scholarly search query"}]}. Do not invent sources, authors, titles, DOIs or URLs. Prefer claims that can be supported by peer-reviewed literature. If none, return {"claims":[]}.' },
      { role: 'user', content: text }
    ], { temperature: 0.1, max_tokens: 900 });
    const parsed = JSON.parse(raw.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));
    const claims = Array.isArray(parsed.claims) ? parsed.claims.slice(0,5) : [];
    const results = [];
    for (const c of claims) {
      const query = String(c.query || c.claim || '').slice(0,300);
      if (!query) continue;
      const url = `https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(query)}&rows=3&select=DOI,title,author,published,created,container-title,volume,issue,page,type,publisher,URL`;
      const r = await fetch(url, { headers: { 'User-Agent': 'MarceloWrite/1.0 (reference suggestions)' } });
      if (!r.ok) { results.push({ claim: c.claim, query, matches: [] }); continue; }
      const items = (await r.json()).message?.items || [];
      results.push({ claim: String(c.claim || ''), query, matches: items.slice(0,3).map(crossrefWork).filter(w => w.title && w.doi) });
    }
    return json(res, 200, { results, note: 'Reference suggestions are starting points. Verify that each source directly supports the claim before using it.' });
  } catch (e) { return json(res, 500, { error: e.message || 'Reference search failed.' }); }
}
