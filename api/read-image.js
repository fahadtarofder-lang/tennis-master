// api/read-image.js
// Vercel serverless function. Runs server-side — a normal outbound HTTPS
// call, no browser sandbox restrictions.
//
// POST body: { imageBase64: string, mediaType: string }
// Returns:   { player1, player2, tournament, round, live, sets, currentPoint,
//              server, scoreSummary, marketPricePlayer1, marketPricePlayer2 }

const SYSTEM_PROMPT = `You read screenshots of tennis match/betting apps. Extract what's visible.

Identify:
- Both players' full names
- Tournament/level (e.g. "Roland Garros", "M15 Brisbane")
- Round if shown (e.g. "QF", "1st Round"), otherwise empty string
- Whether the match is currently live (boolean)
- Each set's game score as an array of {"p1": number, "p2": number} objects, oldest set first, including the in-progress set if there is one
- The current point score if a game is in progress, formatted as "PLAYER1POINTS-PLAYER2POINTS" using standard tennis notation (0, 15, 30, 40, AD) — e.g. "30-15". Empty string if no game is in progress or not shown.
- Who is currently serving: "player1", "player2", or "unknown"
- A short one-line score summary in plain English
- A market price percentage for each player if shown (0-100, or null if not visible)

Respond with ONLY a single JSON object, no other text, no markdown fences, exactly this shape:
{"player1":"","player2":"","tournament":"","round":"","live":boolean,"sets":[{"p1":0,"p2":0}],"currentPoint":"","server":"player1|player2|unknown","scoreSummary":"","marketPricePlayer1": number or null,"marketPricePlayer2": number or null}`;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not set on the server. See .env.example / README.' });

  const { imageBase64, mediaType } = req.body || {};
  if (!imageBase64) return res.status(400).json({ error
