const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));

app.post('/analyse', async (req, res) => {
  const { imageBase64, imageMediaType } = req.body;

  if (!imageBase64 || !imageMediaType) {
    return res.status(400).json({ error: 'Image data is required.' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: imageMediaType,
                data: imageBase64
              }
            },
            {
              type: 'text',
              text: `You are GigReady, an expert live sound engineer and concert production specialist with 20+ years of experience.

Analyse this venue photo carefully. Look at:
- The SIZE of the space (small club, medium hall, large arena, outdoor, etc.)
- The TYPE of venue (indoor, outdoor, theatre, warehouse, church, stadium, etc.)
- The STAGE setup visible
- The AUDIENCE capacity you can estimate
- The CEILING HEIGHT and acoustics
- Any existing infrastructure visible

Based on your analysis, generate a COMPLETE concert equipment list in this EXACT JSON format:

{
  "venue_analysis": {
    "venue_type": "string describing the venue type",
    "estimated_capacity": "e.g. 200-500 people",
    "size_category": "Small / Medium / Large / Arena",
    "key_observations": "2-3 sentences about what you see and why it affects equipment needs"
  },
  "categories": [
    {
      "name": "PA System & Speakers",
      "icon": "🔊",
      "color": "#7c3aff",
      "items": [
        {
          "name": "Equipment name",
          "priority": "Critical",
          "description": "Why this is needed for this specific venue"
        }
      ]
    }
  ]
}

Include these categories:
1. PA System & Speakers
2. Mixing & Signal Processing
3. Microphones & DI Boxes
4. Instruments & Backline
5. Cables & Connectivity
6. Lighting & Visual
7. Power & Infrastructure
8. Stage & Support Gear

Priority levels: Critical, Recommended, Optional

Return ONLY the JSON. No markdown, no explanation, no backticks.`
            }
          ]
        }]
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(response.status).json({ error: err.error?.message || 'API error' });
    }

    const data = await response.json();
    res.json(data);

  } catch (err) {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

app.get('/', (req, res) => {
  res.json({ status: 'GigReady backend is running!' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`GigReady running on port ${PORT}`));
