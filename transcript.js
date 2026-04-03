// api/transcript.js — YouTube transcript server-side fetch
// Server pe CORS nahi hota, direct YouTube fetch works!

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { v: videoId } = req.query;
  if (!videoId) return res.status(400).json({ error: 'Video ID required (?v=VIDEO_ID)' });

  try {
    // Step 1: Fetch YouTube page
    const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      }
    });

    if (!pageRes.ok) throw new Error(`YouTube page fetch failed: ${pageRes.status}`);
    const html = await pageRes.text();

    // Step 2: Extract video title
    const titleMatch = html.match(/<title>(.+?) - YouTube<\/title>/);
    const title = titleMatch ? titleMatch[1].replace(/&amp;/g,'&').replace(/&#39;/g,"'") : `Video ${videoId}`;

    // Step 3: Extract ytInitialPlayerResponse
    let playerResp = null;

    // Try multiple regex patterns (YouTube changes format sometimes)
    const patterns = [
      /ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;\s*(?:var|const|let)\s/s,
      /ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;/s,
      /"captions":\s*(\{.+?"captionTracks".+?\])/s,
    ];

    for (const pat of patterns) {
      const m = html.match(pat);
      if (m) {
        try {
          playerResp = JSON.parse(m[1]);
          if (playerResp?.captions) break;
        } catch {}
      }
    }

    if (!playerResp) {
      return res.status(404).json({
        error: 'YouTube page parse failed. Video might be private or region-locked.',
        title
      });
    }

    // Step 4: Get caption tracks
    const tracks = playerResp?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (!tracks || tracks.length === 0) {
      return res.status(404).json({
        error: 'No captions available for this video. Text tab mein manually paste karo.',
        title
      });
    }

    // Step 5: Pick best track (prefer English auto-generated or English)
    const enAuto = tracks.find(t => t.languageCode === 'en' && t.kind === 'asr');
    const en     = tracks.find(t => t.languageCode?.startsWith('en'));
    const track  = enAuto || en || tracks[0];

    // Step 6: Fetch captions JSON
    const capUrl  = track.baseUrl + '&fmt=json3';
    const capRes  = await fetch(capUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (!capRes.ok) throw new Error('Caption fetch failed');

    const capData = await capRes.json();
    const transcript = capData.events
      ?.filter(e => e.segs)
      .map(e => e.segs.map(s => s.utf8 || '').join(''))
      .join(' ')
      .replace(/\[Music\]|\[Applause\]|\[Laughter\]/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!transcript || transcript.length < 30) {
      return res.status(404).json({
        error: 'Transcript empty ya too short. Text tab mein manually paste karo.',
        title
      });
    }

    return res.status(200).json({
      transcript,
      title,
      lang: track.languageCode,
      chars: transcript.length
    });

  } catch (err) {
    console.error('Transcript error:', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
      }
