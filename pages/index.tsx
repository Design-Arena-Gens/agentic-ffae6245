import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import { recognizeOcrForImages } from '@/src/lib/ocr';
import { AgentProgress } from '@/src/components/AgentProgress';
import { renderAnimeToVideo } from '@/src/lib/render';

type UploadedImage = { id: string; name: string; url: string; file: File };

type OcrResult = { imageId: string; text: string };

type SubtitleItem = { id: string; text: string; durationMs: number; pageIndex: number };

export default function Home() {
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [ocrResults, setOcrResults] = useState<OcrResult[]>([]);
  const [subtitles, setSubtitles] = useState<SubtitleItem[]>([]);
  const [agentStep, setAgentStep] = useState<number>(0);
  const [agentLabel, setAgentLabel] = useState<string>("Idle");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [bgmEnabled, setBgmEnabled] = useState<boolean>(true);
  const [fps, setFps] = useState<number>(30);
  const [resolution, setResolution] = useState<'720p'|'1080p'>('720p');

  const sortedImages = useMemo(() => images, [images]);

  const onFilesSelected = useCallback((files: FileList | null) => {
    if (!files) return;
    const items: UploadedImage[] = [];
    Array.from(files).forEach((file, idx) => {
      if (!file.type.startsWith('image/')) return;
      const url = URL.createObjectURL(file);
      items.push({ id: `${Date.now()}-${idx}`, name: file.name, url, file });
    });
    // Sort by filename naturally to help maintain chapter order
    items.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    setImages(items);
    setOcrResults([]);
    setSubtitles([]);
    setVideoUrl(null);
  }, []);

  const runAgent = useCallback(async () => {
    if (images.length === 0) return;
    setIsProcessing(true);
    setAgentStep(0);
    setAgentLabel('Analyzing pages with OCR');

    // Step 1: OCR
    const results = await recognizeOcrForImages(images.map(i => ({ id: i.id, url: i.url, name: i.name })) , (progress) => {
      setAgentStep(Math.round(progress * 25));
    });
    setOcrResults(results);

    // Step 2: Build editable subtitles from OCR
    setAgentLabel('Building screenplay');
    const subs: SubtitleItem[] = [];
    results.forEach((r, pageIndex) => {
      const chunks = r.text
        .replace(/\r/g, '')
        .split(/\n{2,}|(?<=[.!?])\s+/)
        .map(s => s.trim())
        .filter(Boolean);
      for (const chunk of chunks) {
        const len = chunk.length;
        const durationMs = Math.max(1500, Math.min(7000, Math.round(60 * len))); // ~60ms per char
        subs.push({ id: `${r.imageId}-${subs.length}`, text: chunk, durationMs, pageIndex });
      }
    });
    if (subs.length === 0) {
      // Fallback: one subtitle per page if OCR empty
      images.forEach((img, idx) => subs.push({ id: `${img.id}-fallback`, text: `Page ${idx + 1}`, durationMs: 2000, pageIndex: idx }));
    }
    setSubtitles(subs);
    setAgentStep(50);

    // Step 3: Simulate planning camera motions
    setAgentLabel('Planning camera motions');
    await new Promise(r => setTimeout(r, 600));
    setAgentStep(65);

    // Step 4: Ready to render
    setAgentLabel('Ready to render');
    setIsProcessing(false);
  }, [images]);

  const renderVideo = useCallback(async () => {
    if (images.length === 0 || subtitles.length === 0) return;
    setIsProcessing(true);
    setAgentLabel('Rendering animation to video');
    setAgentStep(70);
    const dim = resolution === '1080p' ? { width: 1920, height: 1080 } : { width: 1280, height: 720 };

    const url = await renderAnimeToVideo({
      pages: images.map(i => ({ id: i.id, url: i.url })),
      subtitles,
      width: dim.width,
      height: dim.height,
      fps,
      synthBgm: bgmEnabled,
      onProgress: (p) => setAgentStep(70 + Math.round(30 * p))
    });
    setVideoUrl(url);
    setIsProcessing(false);
    setAgentLabel('Completed');
    setAgentStep(100);
  }, [images, subtitles, fps, resolution, bgmEnabled]);

  const exportSrt = useCallback(() => {
    const lines: string[] = [];
    let t = 0;
    subtitles.forEach((s, idx) => {
      const start = t; const end = t + s.durationMs; t = end;
      const fmt = (ms: number) => {
        const h = Math.floor(ms / 3600000);
        const m = Math.floor((ms % 3600000) / 60000);
        const sec = Math.floor((ms % 60000) / 1000);
        const cs = Math.floor(ms % 1000);
        const pad = (n:number, w:number=2) => n.toString().padStart(w, '0');
        return `${pad(h)}:${pad(m)}:${pad(sec)},${cs.toString().padStart(3,'0')}`;
      };
      lines.push(`${idx + 1}`);
      lines.push(`${fmt(start)} --> ${fmt(end)}`);
      lines.push(s.text);
      lines.push('');
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'subtitles.srt'; a.click();
    URL.revokeObjectURL(url);
  }, [subtitles]);

  const updateSubtitleText = (id: string, text: string) => {
    setSubtitles(prev => prev.map(s => s.id === id ? { ...s, text } : s));
  };
  const updateSubtitleDuration = (id: string, durationMs: number) => {
    setSubtitles(prev => prev.map(s => s.id === id ? { ...s, durationMs } : s));
  };

  return (
    <div className="container vstack">
      <Head>
        <title>Manga ? Anime Agent</title>
      </Head>

      <div className="vstack" style={{ gap: 20 }}>
        <h1 style={{ margin: 0 }}>Manga ? Anime Agent</h1>
        <p className="small">Upload manga pages, auto-extract text with OCR, and generate a motion-anime video with subtitles and camera moves. All in your browser.</p>

        <div className="card vstack">
          <label>Upload manga page images</label>
          <input type="file" accept="image/*" multiple onChange={e => onFilesSelected(e.target.files)} />
          {sortedImages.length > 0 && (
            <div className="grid">
              {sortedImages.map((img, idx) => (
                <div key={img.id} className="vstack">
                  <img className="thumb" src={img.url} alt={img.name} />
                  <div className="hstack" style={{ justifyContent: 'space-between' }}>
                    <span className="small">{idx + 1}. {img.name}</span>
                    <span className="badge">{Math.round((img.file.size/1024))} KB</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="hstack">
            <button className="button" onClick={runAgent} disabled={isProcessing || images.length === 0}>Run Agent</button>
            <button className="button secondary" onClick={() => { setImages([]); setOcrResults([]); setSubtitles([]); setVideoUrl(null); }} disabled={isProcessing}>Reset</button>
          </div>
        </div>

        <AgentProgress label={agentLabel} percent={agentStep} />

        {subtitles.length > 0 && (
          <div className="card vstack">
            <div className="hstack" style={{justifyContent:'space-between'}}>
              <h3 style={{margin:0}}>Screenplay & Timing</h3>
              <div className="hstack">
                <label>FPS</label>
                <select value={fps} onChange={e => setFps(parseInt(e.target.value))}>
                  <option value={24}>24</option>
                  <option value={30}>30</option>
                  <option value={60}>60</option>
                </select>
                <label>Resolution</label>
                <select value={resolution} onChange={e => setResolution(e.target.value as any)}>
                  <option value="720p">1280?720</option>
                  <option value="1080p">1920?1080</option>
                </select>
                <label className="hstack" style={{gap:6}}>
                  <input type="checkbox" checked={bgmEnabled} onChange={e => setBgmEnabled(e.target.checked)} />
                  Synth BGM
                </label>
                <button className="button" onClick={exportSrt}>Export SRT</button>
              </div>
            </div>
            <div className="vstack" style={{ maxHeight: 360, overflow: 'auto' }}>
              {subtitles.map((s, i) => (
                <div key={s.id} className="hstack" style={{alignItems:'flex-start'}}>
                  <span className="badge">{i+1}</span>
                  <textarea value={s.text} rows={2} onChange={e => updateSubtitleText(s.id, e.target.value)} />
                  <input type="text" style={{width:120}} value={s.durationMs} onChange={e => updateSubtitleDuration(s.id, Math.max(500, parseInt(e.target.value)||0))} />
                  <span className="small">ms (Page {s.pageIndex + 1})</span>
                </div>
              ))}
            </div>
            <div className="hstack">
              <button className="button" onClick={renderVideo} disabled={isProcessing}>Render Video</button>
            </div>
          </div>
        )}

        {videoUrl && (
          <div className="card vstack">
            <h3 style={{margin:0}}>Result</h3>
            <video src={videoUrl} controls style={{ width: '100%', borderRadius: 12, border: '1px solid #e2e8f0' }} />
            <div className="hstack">
              <a className="button" href={videoUrl} download={`manga-anime.webm`}>Download Video</a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
