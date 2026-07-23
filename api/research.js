// api/research.js
// Vercel serverless function. Note this never receives a market/Polymarket
// price in its request body — only player names and match context — so the
// prediction is structurally independent of the market, not just instructed
// to be. The edge/stake math happens client-side in the browser afterward.
//
// POST body: { player1, player2, tournament, scoreSummary }
// Returns:   { player1Notes, player2Notes, player1Rank, player2Rank, modelProbPlayer1, confidenceScore, reasoning }

const SYSTEM_PROMPT = `You are a tennis match analyst. You'll be given two player names and the match context. Use web_search to research each player: current ranking, recent form (last ~10 results), head-to-head history if any, current injury or withdrawal news, surface record if findable. Then estimate an independent win probability for player 1 (0-100).

Respond with ONLY a single JSON object, no other text, no markdown fences, exactly this shape:
{"player1Notes":"one short sentence: rank, form, notable facts","player2Notes":"one short sentence","player1Rank":"short label like 'World #3' or 'ATP 657', empty string if unknown","player2Rank":"same for player 2","modelProbPlayer1": number 0-100,"confidenceScore": integer 1-10,"reasoning":"one short sentence"}

Keep every string brief — this is parsed by code, not read as prose. If you can't find reliable data for a player, say so briefly instead of guessing specifics, but still give your best-estimate probability from what you do find.`;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not set on the server. See .env.example / README.' });

  const { player1, player2, tournament, scoreSummary } = req.body || {};
  if (!player1 || !player2) return res.status(400).json({ error: 'player1 and player2 are required' });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: `Player 1: ${player1}\nPlayer 2: ${player2}\nTournament: ${tournament || 'unknown'}\nCurrent score: ${scoreSummary || 'not available'}\n\nResearch both and predict.`,
        }],
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      }),
    });

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data?.error?.message || `Anthropic API error (${response.status})` });

    const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
    let parsed;
    try {
      const cleaned = text.replace(/```json|```/g, '').trim();
      parsed = JSON.parse(cleaned.match(/\{[\s\S]*\}/)[0]);
    } catch (e) {
      return res.status(502).json({ error: 'Could not parse a JSON result from the model', raw: text });
    }
    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Unexpected server error' });
  }
};
