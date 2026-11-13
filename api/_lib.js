import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import net from 'node:net';

export const json = (res, status, data, extra = {}) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  for (const [k, v] of Object.entries(extra)) res.setHeader(k, v);
  res.end(JSON.stringify(data));
};
export async function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (raw.length > 1_000_000) throw new Error('Request too large.'); }
  return raw ? JSON.parse(raw) : {};
}
export const wordCount = (s = '') => (String(s).trim().match(/\S+/g) || []).length;
export function countWords(s) { return wordCount(s); }
export function getCookie(req, name) {
  const part = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(name + '='));
  return part ? decodeURIComponent(part.slice(name.length + 1)) : '';
}
const secret = () => process.env.USAGE_COOKIE_SECRET || process.env.API_KEY || 'marcelo-write-local-dev-secret-change-me';
function sign(value) { return crypto.createHmac('sha256', secret()).update(value).digest('hex'); }
export function usageCookie(req) {
  const token = getCookie(req, 'mw_free');
  if (!token) return false;
  const [id, mac] = token.split('.');
  const expected = sign(id || '');
  return !!id && !!mac && mac.length === expected.length && crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected)) && id === 'used';
}
export function setUsageCookie(res) {
  const id = 'used';
  res.setHeader('Set-Cookie', `mw_free=${id}.${sign(id)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000`);
}
export async function callModel(messages, opts = {}) {
  const { API_URL, API_KEY, MODEL } = process.env;
  if (!API_URL || !API_KEY || !MODEL) throw new Error('AI service is not configured. Add API_URL, API_KEY and MODEL in Vercel environment variables.');
  const endpoint = API_URL.replace(/\/$/, '').endsWith('/chat/completions') ? API_URL : API_URL.replace(/\/$/, '') + '/chat/completions';
  const r = await fetch(endpoint, {
    method: 'POST', headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, messages, temperature: opts.temperature ?? 0.55, max_tokens: opts.max_tokens ?? 1800 })
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error?.message || `AI provider returned ${r.status}.`);
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('The AI provider returned an empty response.');
  return text;
}
export function crossrefWork(item) {
  const a = item.author || [];
  return {
    title: (item.title || [''])[0], authors: a.map(x => [x.family, x.given].filter(Boolean).join(', ')),
    year: item.published?.['date-parts']?.[0]?.[0] || item.created?.['date-parts']?.[0]?.[0] || '',
    journal: (item['container-title'] || [''])[0], volume: item.volume || '', issue: item.issue || '',
    page: item.page || '', doi: item.DOI ? `https://doi.org/${item.DOI}` : '', type: item.type || '', publisher: item.publisher || '',
    url: item.URL || '',
  };
}
const privateV4 = ip => {
  const p = ip.split('.').map(Number); if (p.length !== 4 || p.some(x => !Number.isInteger(x) || x < 0 || x > 255)) return true;
  return p[0] === 10 || p[0] === 127 || p[0] === 0 || (p[0] === 169 && p[1] === 254) || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168) || p[0] >= 224;
};
const privateV6 = ip => ip === '::1' || ip === '::' || ip.toLowerCase().startsWith('fc') || ip.toLowerCase().startsWith('fd') || ip.toLowerCase().startsWith('fe80:') || ip.toLowerCase().startsWith('::ffff:127.');
export async function safePublicUrl(input) {
  let u; try { u = new URL(input); } catch { throw new Error('Enter a valid URL.'); }
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) throw new Error('Only public HTTP or HTTPS URLs are accepted.');
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) throw new Error('Private and local addresses are not allowed.');
  if (net.isIP(host)) {
    if ((net.isIP(host) === 4 && privateV4(host)) || (net.isIP(host) === 6 && privateV6(host))) throw new Error('Private and local addresses are not allowed.');
  } else {
    const records = await dns.lookup(host, { all: true, verbatim: true });
    if (!records.length || records.some(r => net.isIP(r.address) === 4 ? privateV4(r.address) : privateV6(r.address))) throw new Error('This host does not resolve to a public address.');
  }
  return u;
}
export async function safeFetchPage(input) {
  let url = input;
  for (let i = 0; i < 4; i++) {
    const u = await safePublicUrl(url);
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 9000);
    let r;
    try { r = await fetch(u, { redirect: 'manual', signal: controller.signal, headers: { 'User-Agent': 'MarceloWriteCitationBot/1.0', 'Accept': 'text/html,application/xhtml+xml' } }); }
    finally { clearTimeout(timer); }
    if ([301,302,303,307,308].includes(r.status)) { const loc = r.headers.get('location'); if (!loc) throw new Error('The page redirected without a destination.'); url = new URL(loc, u).toString(); continue; }
    if (!r.ok) throw new Error(`Could not retrieve page metadata (${r.status}).`);
    const type = r.headers.get('content-type') || ''; if (!type.includes('text/html') && !type.includes('application/xhtml')) throw new Error('The URL does not point to an HTML page.');
    const reader = r.body.getReader(); let total = 0; const chunks = [];
    while (true) { const { done, value } = await reader.read(); if (done) break; total += value.length; if (total > 1_000_000) { await reader.cancel(); throw new Error('The page is too large to inspect.'); } chunks.push(value); }
    return { html: new TextDecoder().decode(Buffer.concat(chunks)), url: u.toString() };
  }
  throw new Error('Too many redirects.');
}
