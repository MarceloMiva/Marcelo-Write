import { body, json, wordCount, usageCookie, setUsageCookie, callModel } from './_lib.js';
export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' }, { Allow: 'POST' });
  try {
    const { text = '', tool = 'humanizer', style = 'Academic', tone = 'Academic', intensity = 'Medium', mode = 'Standard' } = await body(req);
    if (typeof text !== 'string' || !text.trim()) return json(res, 400, { error: 'Paste your own text first.' });
    const words = wordCount(text);
    if (words > 50) return json(res, 413, { error: 'The free plan allows up to 50 words per rewrite.' });
    if (usageCookie(req)) return json(res, 402, { error: 'Your free rewrite has been used. Visit Pricing to see upcoming plans.', upgrade: true });
    const toolRules = {
      humanizer: `Improve the user's own draft so it reads naturally and clearly. Style: ${style}.`,
      rewriter: `Rewrite the user's own draft using tone ${tone} and intensity ${intensity}.`,
      paraphraser: `Paraphrase the user's own draft using mode ${mode}.`,
    };
    if (!toolRules[tool]) return json(res, 400, { error: 'Unknown writing tool.' });
    const output = await callModel([
      { role: 'system', content: `You are Marcelo Write, a careful writing editor. ${toolRules[tool]} Preserve the original meaning, facts, names, numbers, qualifications and point of view. Do not add claims, evidence, examples, quotations or citations. Do not claim to evade AI detectors or academic integrity systems. If the source is unclear, preserve its uncertainty. Return only the revised text, with no preface.` },
      { role: 'user', content: text }
    ], { temperature: intensity === 'Heavy' ? 0.7 : 0.45, max_tokens: 1000 });
    setUsageCookie(res);
    return json(res, 200, { output: output.trim(), words, remaining: 0 });
  } catch (e) { return json(res, 500, { error: e.message || 'Rewrite failed.' }); }
}
