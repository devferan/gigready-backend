const express = require('express');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ limit: '20mb' }));

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'GigReady backend is running!' });
});

// Main analyse endpoint
app.post('/analyse', async (req, res) => {
  try {
    const { imageBase64, imageMediaType } = req.body;

    // Validate input
    if (!imageBase64) {
      return res.status(400).json({ error: 'Image data (imageBase64) is required.' });
    }
    if (!imageMediaType) {
      return res.status(400).json({ error: 'Image media type is required.' });
    }

    // Check API key exists
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('ANTHROPIC_API_KEY not set in environment');
      return res.status(500).json({ error: 'Server configuration error: API key missing.' });
    }

    const prompt = `You are GigReady, an expert live sound engineer and concert production specialist with 20+ years of experience.

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

Include these categories (only include items relevant to the venue):
1. PA System & Speakers (mains, subs, fills, monitors)
2. Mixing & Signal Processing (mixers, EQ, compressors, effects)
3. Microphones & DI Boxes
4. Instruments & Backline (drums, keyboards, guitars, bass)
5. Cables & Connectivity (XLR, speaker cables, power, multicore/snake)
6. Lighting & Visual (stage lights, follow spots, LED bars, haze machine)
7. Power & Infrastructure (power distro, UPS, generators if outdoor)
8. Stage & Support Gear (stands, risers, monitors, IEM systems)

Priority levels:
- "Critical" = must have or the concert cannot happen
- "Recommended" = strongly advised for professional quality
- "Optional" = nice to have, enhances the experience

Be SPECIFIC and PRACTICAL. Name real equipment types (e.g. "QSC K12.2 Active Speakers" not just "speakers"). Give 4-8 items per category. Tailor everything to what you actually see in the image.

Return ONLY the JSON. No markdown, no explanation, no backticks.`;

    // Call Anthropic API
    const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
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
              text: prompt
            }
          ]
        }]
      })
    });

    // Handle API errors
    if (!anthropicResponse.ok) {
      const errData = await anthropicResponse.json().catch(() => ({}));
      const errorMsg = errData.error?.message || errData.message || `Anthropic API error ${anthropicResponse.status}`;
      console.error('Anthropic API error:', errorMsg);
      
      if (anthropicResponse.status === 401) {
        return res.status(401).json({ error: 'API key is invalid or expired.' });
      }
      if (anthropicResponse.status === 429) {
        return res.status(429).json({ error: 'Too many requests. Please wait a moment and try again.' });
      }
      
      return res.status(anthropicResponse.status).json({ error: errorMsg });
    }

    const data = await anthropicResponse.json();

    // Extract text from response
    if (!data.content || data.content.length === 0) {
      return res.status(500).json({ error: 'Empty response from AI. Please try again.' });
    }

    const rawText = data.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');

    if (!rawText) {
      return res.status(500).json({ error: 'No text content in AI response.' });
    }

    // Clean and parse JSON
    const cleaned = rawText
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      // Try to extract JSON object from text
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          parsed = JSON.parse(match[0]);
        } catch (innerErr) {
          console.error('JSON parse error:', innerErr.message);
          return res.status(500).json({ error: 'Could not parse AI response. Please try again.' });
        }
      } else {
        console.error('No JSON found in response:', cleaned.substring(0, 200));
        return res.status(500).json({ error: 'Invalid response format. Please try again.' });
      }
    }

    // Validate structure
    if (!parsed.venue_analysis || !parsed.categories) {
      console.error('Missing expected fields in parsed response');
      return res.status(500).json({ error: 'Unexpected response structure. Please try again.' });
    }

    // Return the full Anthropic response (for frontend compatibility)
    res.json({
      content: [{ type: 'text', text: JSON.stringify(parsed) }]
    });

  } catch (err) {
    console.error('Server error:', err);
    res.status(500).json({ error: err.message || 'Server error. Please try again.' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🎛 GigReady backend running on port ${PORT}`);
  console.log(`API Key configured: ${process.env.ANTHROPIC_API_KEY ? 'YES ✓' : 'NO ✗'}`);
});
