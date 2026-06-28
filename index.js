const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '25mb' }));

app.get('/', (req, res) => {
  res.json({ 
    status: 'GigReady backend is running!', 
    apiKey: process.env.GEMINI_API_KEY ? 'SET ✓' : 'MISSING ✗' 
  });
});

app.post('/analyse', async (req, res) => {
  try {
    const { imageBase64, imageMediaType } = req.body;

    if (!imageBase64 || !imageMediaType) {
      return res.status(400).json({ error: 'Missing imageBase64 or imageMediaType.' });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: 'API key not configured on server.' });
    }

    const prompt = `You are GigReady, an expert live sound engineer with 20+ years of experience.

Analyse this venue photo and generate a COMPLETE concert equipment list.

Respond ONLY with this exact JSON structure, no markdown, no backticks, no extra text:

{
  "venue_analysis": {
    "venue_type": "describe the venue",
    "estimated_capacity": "e.g. 200-500 people",
    "size_category": "Small or Medium or Large or Arena",
    "key_observations": "2-3 sentences about the venue and equipment needs"
  },
  "categories": [
    {
      "name": "PA System & Speakers",
      "icon": "🔊",
      "color": "#7c3aff",
      "items": [
        {
          "name": "specific equipment name",
          "priority": "Critical",
          "description": "why this is needed for this venue"
        }
      ]
    }
  ]
}

Use these 8 categories:
1. PA System & Speakers - icon 🔊 color #7c3aff
2. Mixing & Signal Processing - icon 🎛 color #0ea5e9
3. Microphones & DI Boxes - icon 🎤 color #f59e0b
4. Instruments & Backline - icon 🎸 color #10b981
5. Cables & Connectivity - icon 🔌 color #ef4444
6. Lighting & Visual - icon 💡 color #f97316
7. Power & Infrastructure - icon ⚡ color #8b5cf6
8. Stage & Support Gear - icon 🎚 color #ec4899

Priority must be exactly: Critical, Recommended, or Optional
Give 4-6 items per category. Be specific with real product names.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                inline_data: {
                  mime_type: imageMediaType,
                  data: imageBase64
                }
              },
              { text: prompt }
            ]
          }],
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 4000
          }
        })
      }
    );

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const msg = err.error?.message || `Gemini API error ${response.status}`;
      console.error('Gemini error:', msg);
      return res.status(response.status).json({ error: msg });
    }

    const data = await response.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (!rawText) return res.status(500).json({ error: 'Empty response from AI.' });

    let cleaned = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(500).json({ error: 'Could not find JSON in AI response.' });

    let parsed;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (e) {
      return res.status(500).json({ error: 'Failed to parse AI response as JSON.' });
    }

    if (!parsed.venue_analysis || !parsed.categories) {
      return res.status(500).json({ error: 'AI response missing required fields.' });
    }

    res.json(parsed);

  } catch (err) {
    console.error('Server error:', err.message);
    res.status(500).json({ error: err.message || 'Unexpected server error.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`GigReady running on port ${PORT}`);
  console.log(`Gemini API Key: ${process.env.GEMINI_API_KEY ? 'SET ✓' : 'MISSING ✗'}`);
});
      
