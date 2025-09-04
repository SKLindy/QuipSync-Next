'use client';

import { useState } from 'react';

export default function HomePage() {
  const [storyInput, setStoryInput] = useState('');
  const [songTitle, setSongTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [loading, setLoading] = useState(false);
  const [storyDetails, setStoryDetails] = useState<string | null>(null);
  const [songAnalysis, setSongAnalysis] = useState<string | null>(null);
  const [whyThisWorks, setWhyThisWorks] = useState<string | null>(null);
  const [scripts, setScripts] = useState<Array<{script: string; deliveryNotes: string}>>([]);
  const [error, setError] = useState<string | null>(null);
const [selectedStyle, setSelectedStyle] = useState<(typeof STYLES)[number]['id']>('conversational');

const STYLES = [
  { id: 'conversational', name: 'Conversational' },
  { id: 'humorous',       name: 'Humorous' },
  { id: 'touching',       name: 'Touching' },
  { id: 'inspiring',      name: 'Inspiring' },
  { id: 'dramatic',       name: 'Dramatic' },
  { id: 'reflective',     name: 'Reflective' }
] as const;


  async function onGenerate() {
    setError(null);
    setLoading(true);
    setStoryDetails(null);
    setSongAnalysis(null);
    setWhyThisWorks(null);
    setScripts([]);

    try {
      let story = storyInput.trim();

      // If it's a URL, fetch & extract text first
      if (/^https?:\/\/\S+$/i.test(story)) {
        const r = await fetch('/api/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: story }),
        });
        if (!r.ok) {
          const t = await r.text();
          throw new Error(`Extract failed ${r.status}: ${t.slice(0, 200)}`);
        }
        const data = await r.json();
        story = (data.text || '').slice(0, 4000); // cap text length
      }

      if (!story) throw new Error('Please enter a story (text or URL).');
      if (!songTitle.trim() || !artist.trim()) throw new Error('Please enter a song title and artist.');

      // Build the same kind of prompt your API expects
      const prompt = `You are helping a radio DJ create compelling transition scripts.

STORY INPUT: """${story}"""
SONG: "${songTitle}" by ${artist}

Please return ONLY valid JSON with the keys: storyDetails, songAnalysis, whyThisWorks, scripts (array of 3 objects with {script, deliveryNotes}), where:
- Script 1 is approx 20–25 seconds when spoken
- Script 2 is approx 10–15 seconds
- Script 3 is approx 5–10 seconds
`;

      const resp = await fetch('/api/complete-json', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ mode: 'script', style: selectedStyle, prompt }),
});

      if (!resp.ok) {
        const t = await resp.text();
        throw new Error(`API ${resp.status}: ${t.slice(0, 200)}`);
      }
      const json = await resp.json();
      const d = json?.data;
      if (!d || !Array.isArray(d.scripts)) throw new Error('Unexpected API response.');

      setStoryDetails(d.storyDetails);
      setSongAnalysis(d.songAnalysis);
      setWhyThisWorks(d.whyThisWorks);
      setScripts(d.scripts);
    } catch (e: unknown) {
      setError((e as Error).message || String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto p-6">
        <h1 className="text-3xl font-bold mb-2">QuipSync (Beta)</h1>
        <p className="text-gray-600 mb-6">Enter a story (URL or text), plus the next song. We’ll generate three on-air transitions.</p>

        <div className="space-y-4 bg-white p-4 rounded-xl shadow">
          <div>
            <label className="block text-sm font-medium mb-1">Story (URL or text)</label>
            <textarea
              className="w-full p-3 border rounded-lg"
              rows={4}
              placeholder="Paste a URL (we'll fetch & clean it) or type/paste the story text"
              value={storyInput}
              onChange={(e) => setStoryInput(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Song Title</label>
              <input
                className="w-full p-3 border rounded-lg"
                placeholder='e.g. "The Good Ones"'
                value={songTitle}
                onChange={(e) => setSongTitle(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Artist</label>
              <input
                className="w-full p-3 border rounded-lg"
                placeholder="e.g. Gabby Barrett"
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
              />
            </div>
          </div>

{/* Style picker */}
<div className="border-t pt-4">
  <label className="block text-sm font-medium mb-2">Script Style</label>
  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
    {STYLES.map((s) => (
      <button
        key={s.id}
        type="button"
        onClick={() => setSelectedStyle(s.id)}
        className={`px-3 py-2 rounded-lg border text-sm ${
          selectedStyle === s.id
            ? 'bg-indigo-600 text-white border-indigo-600'
            : 'bg-white text-gray-800 border-gray-300 hover:bg-gray-50'
        }`}
      >
        {s.name}
      </button>
    ))}
  </div>
  <p className="mt-2 text-xs text-gray-500">
    Pick a tone—this will shape phrasing, pacing, and the emotional bridge.
  </p>
</div>

{/* Generate button */}
<button
  onClick={onGenerate}
  disabled={loading}
  className="inline-flex items-center px-5 py-3 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-50"
>
  {loading ? 'Generating…' : 'Generate Scripts'}
</button>

          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700">
              {error}
            </div>
          )}
        </div>

        {(storyDetails || songAnalysis || scripts.length > 0) && (
          <div className="mt-8 space-y-6">
            {storyDetails && (
              <div className="bg-white p-4 rounded-xl shadow border">
                <h2 className="font-semibold mb-2">Story Summary</h2>
                <p className="text-gray-800 whitespace-pre-wrap">{storyDetails}</p>
              </div>
            )}

            {songAnalysis && (
              <div className="bg-white p-4 rounded-xl shadow border">
                <h2 className="font-semibold mb-2">Song Analysis</h2>
                <p className="text-gray-800 whitespace-pre-wrap">{songAnalysis}</p>
              </div>
            )}

            {whyThisWorks && (
              <div className="bg-white p-4 rounded-xl shadow border">
                <h2 className="font-semibold mb-2">Why This Works</h2>
                <p className="text-gray-800 whitespace-pre-wrap">{whyThisWorks}</p>
              </div>
            )}

            {scripts.length > 0 && (
              <div className="bg-white p-4 rounded-xl shadow border">
                <h2 className="font-semibold mb-4">Generated Scripts</h2>
                <div className="space-y-4">
                  {scripts.map((s, i) => (
                    <div key={i} className="border rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium">Option {i + 1}</span>
                        <span className="text-xs text-gray-500">
                          {i === 0 ? '≈20–25s' : i === 1 ? '≈10–15s' : '≈5–10s'}
                        </span>
                      </div>
                      <pre className="whitespace-pre-wrap text-sm text-gray-900">{s.script}</pre>
                      <div className="mt-2 text-xs text-gray-600"><strong>Delivery Notes:</strong> {s.deliveryNotes}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
