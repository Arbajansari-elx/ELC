// api/generate.js — Vercel Serverless Function
// Reads GROQ_API_KEY from Vercel Environment Variables
// Set it in: Vercel Dashboard → Project → Settings → Environment Variables

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const GROQ_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_KEY) {
    return res.status(500).json({
      error: 'GROQ_API_KEY not set. Go to Vercel Dashboard → Project → Settings → Environment Variables'
    });
  }

  const { prompt } = req.body || {};
  if (!prompt) return res.status(400).json({ error: 'prompt is required' });

  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + GROQ_KEY
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 3000,
        temperature: 0.72
      })
    });

    if (!groqRes.ok) {
      const errData = await groqRes.json().catch(() => ({}));
      return res.status(groqRes.status).json({
        error: errData.error?.message || `Groq API error ${groqRes.status}`
      });
    }

    const data = await groqRes.json();
    const result = data.choices?.[0]?.message?.content || '';

    return res.status(200).json({ result });

  } catch (err) {
    console.error('ElxSummarizer API error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
      }
