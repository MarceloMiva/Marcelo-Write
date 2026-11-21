import {
  body, json, wordCount, usageCookie, setUsageCookie, callModel
} from './_lib.js';

async function callUndetectedGPT(text, style) {
  const API_KEY = process.env.UNDETECTEDGPT_API_KEY;

  if (!API_KEY) {
    throw new Error(
      'Humanizer is not configured. Add UNDETECTEDGPT_API_KEY in Vercel.'
    );
  }

  const styles = {
    academic: 'academic',
    formal: 'formal',
    professional: 'formal',
    conversational: 'conversational',
    casual: 'conversational',
    balanced: 'balanced'
  };

  const tone = styles[String(style).toLowerCase()] || 'academic';

  const response = await fetch(
    'https://www.undetectedgpt.ai/api/v1/humanize',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text,
        model: 'ghost-3',
        tone,
        markdown: false
      })
    }
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data.error || `Humanizer provider returned ${response.status}.`
    );
  }

  if (!data.output) {
    throw new Error('Humanizer returned an empty response.');
  }

  return data.output.trim();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed.' }, { Allow: 'POST' });
  }

  try {
    const {
      text = '',
      tool = 'humanizer',
      style = 'Academic',
      tone = 'Academic',
      intensity = 'Medium',
      mode = 'Standard'
    } = await body(req);

    if (typeof text !== 'string' || !text.trim()) {
      return json(res, 400, { error: 'Paste your own text first.' });
    }

    const words = wordCount(text);

    if (words > 50) {
      return json(res, 413, {
        error: 'The free plan allows up to 50 words per rewrite.'
      });
    }

    if (usageCookie(req)) {
      return json(res, 402, {
        error: 'Your free rewrite has been used. Visit Pricing to see upcoming plans.',
        upgrade: true
      });
    }

    let output;

    if (tool === 'humanizer') {
      output = await callUndetectedGPT(text, style || tone);
    } else {
      const toolRules = {
        rewriter: `Rewrite the user's own draft using tone ${tone} and intensity ${intensity}.`,
        paraphraser: `Paraphrase the user's own draft using mode ${mode}.`
      };

      if (!toolRules[tool]) {
        return json(res, 400, { error: 'Unknown writing tool.' });
      }

      output = await callModel([
        {
          role: 'system',
          content: `You are AskSimi, a careful writing editor. ${toolRules[tool]} Preserve the original meaning, facts, names, numbers, qualifications and point of view. Do not add claims, evidence, examples, quotations or citations. Do not claim to evade AI detectors or academic integrity systems. If the source is unclear, preserve its uncertainty. Return only the revised text, with no preface.`
        },
        { role: 'user', content: text }
      ], {
        temperature: intensity === 'Heavy' ? 0.7 : 0.45,
        max_tokens: 1000
      });
    }

    setUsageCookie(res);

    return json(res, 200, {
      output: output.trim(),
      words,
      remaining: 0
    });

  } catch (e) {
    return json(res, 500, {
      error: e.message || 'Rewrite failed.'
    });
  }
}
