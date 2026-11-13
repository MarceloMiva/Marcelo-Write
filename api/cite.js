import { body, json, crossrefWork, safeFetchPage } from './_lib.js';
function clean(v='') { return String(v).replace(/[<>]/g, '').trim(); }
async function getMeta(url) {
  const { html, url: finalUrl } = await safeFetchPage(url);
  const meta = (key) => { const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); const patterns = [new RegExp(`<meta[^>]+(?:name|property)=["']${escaped}["'][^>]+content=["']([^"']*)["']`, 'i'), new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["']${escaped}["']`, 'i')]; for (const p of patterns) { const m = html.match(p); if (m) return m[1]; } return ''; };
  const title = clean(meta('citation_title') || meta('og:title') || (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/<[^>]+>/g,''));
  const author = clean(meta('citation_author') || meta('author')); const date = clean(meta('article:published_time') || meta('citation_publication_date') || meta('date')); const site = clean(meta('og:site_name')) || new URL(finalUrl).hostname;
  return { title, authors: author ? [author] : [], year: (date.match(/\d{4}/) || [''])[0], journal: site, url: finalUrl, type: 'webpage' };
}
export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });
  try {
    const { identifier = '' } = await body(req); const value = String(identifier).trim(); if (!value) return json(res, 400, { error: 'Enter a URL, DOI or ISBN.' });
    let work;
    if (/^10\.\d{4,9}\//i.test(value) || /doi\.org\//i.test(value)) {
      const doi = value.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '');
      const r = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, { headers: { 'User-Agent': 'MarceloWrite/1.0 (citation metadata)' } });
      if (!r.ok) return json(res, 404, { error: 'No Crossref record was found for that DOI.' });
      work = crossrefWork((await r.json()).message);
    } else if (/^(97[89])?\d{9}[\dX]$/i.test(value.replace(/[- ]/g,''))) {
      const isbn = value.replace(/[- ]/g,''); const r = await fetch(`https://openlibrary.org/isbn/${encodeURIComponent(isbn)}.json`);
      if (!r.ok) return json(res, 404, { error: 'No Open Library record was found for that ISBN.' });
      const b = await r.json(); const authorNames = [];
      for (const a of (b.authors || []).slice(0, 8)) { const ar = await fetch(`https://openlibrary.org${a.key}.json`); if (ar.ok) authorNames.push((await ar.json()).name); }
      work = { title: b.title || '', authors: authorNames, year: String(b.publish_date || '').match(/\d{4}/)?.[0] || '', publisher: (b.publishers || [''])[0], type: 'book', url: `https://openlibrary.org${b.key}` };
    } else {
      work = await getMeta(value.includes('://') ? value : `https://${value}`);
      if (!work.title) return json(res, 422, { error: 'The page did not expose enough citation metadata. Try its DOI or ISBN.' });
    }
    return json(res, 200, { work });
  } catch (e) { return json(res, 400, { error: e.message || 'Citation lookup failed.' }); }
}
