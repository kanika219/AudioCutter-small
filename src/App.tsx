import React, { useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { createFFmpeg, fetchFile } from '@ffmpeg/ffmpeg';
import './App.css';

function App() {
  // State for uploaded audio
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [waveSurfer, setWaveSurfer] = useState<WaveSurfer | null>(null);
  const waveformRef = useRef<HTMLDivElement>(null);

  // State for time frames
  const [timeFrames, setTimeFrames] = useState<Array<{ start: number; end: number }>>([]);
  const [currentStart, setCurrentStart] = useState<number>(0);
  const [isRecording, setIsRecording] = useState<boolean>(false);

  // Controls
  const [gain, setGain] = useState<number>(0);
  const [fadeIn, setFadeIn] = useState<number>(0);
  const [fadeOut, setFadeOut] = useState<number>(0);
  const [zoom, setZoom] = useState<number>(0);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Handle file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAudioFile(file);
      // Clean up previous wavesurfer
      if (waveSurfer) waveSurfer.destroy();
      const ws = WaveSurfer.create({
        container: waveformRef.current!,
        waveColor: '#e0f2ff',
        progressColor: '#3b82f6',
        height: 120,
        barWidth: 2,
        cursorColor: '#374151',
      });
      ws.load(URL.createObjectURL(file));
      setWaveSurfer(ws);
    }
  };

  // Play audio
  const handlePlay = () => {
    waveSurfer?.playPause();
  };

  // Start/Stop recording time frame
  const handleStartRecording = () => {
    setIsRecording(true);
    setCurrentStart(waveSurfer?.getCurrentTime() || 0);
  };
  const handleStopRecording = () => {
    setIsRecording(false);
    setTimeFrames([...timeFrames, { start: currentStart, end: waveSurfer?.getCurrentTime() || 0 }]);
  };

  // Export selected segments as WAV
  const handleExport = async () => {
    setError(null);
    setLoading(true);
    try {
      if (!audioFile || timeFrames.length === 0) throw new Error('No audio or selection');
      const ffmpeg = createFFmpeg({ log: true });
      await ffmpeg.load();
      ffmpeg.FS('writeFile', 'input', await fetchFile(audioFile));
      // Build ffmpeg command for multiple segments
      let concatList = '';
      for (let i = 0; i < timeFrames.length; i++) {
        const { start, end } = timeFrames[i];
        const outName = `cut${i}.wav`;
        await ffmpeg.run(
          '-i', 'input',
          '-ss', start.toString(),
          '-to', end.toString(),
          '-af', `volume=${gain}dB,afade=t=in:st=0:d=${fadeIn/1000},afade=t=out:st=${(end-start)-(fadeOut/1000)}:d=${fadeOut/1000}`,
          outName
        );
        concatList += `file '${outName}'\n`;
      }
      ffmpeg.FS('writeFile', 'concat.txt', concatList);
      await ffmpeg.run('-f', 'concat', '-safe', '0', '-i', 'concat.txt', '-c', 'copy', 'output.wav');
      const data = ffmpeg.FS('readFile', 'output.wav');
      const url = URL.createObjectURL(new Blob([data.buffer], { type: 'audio/wav' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'cut_audio.wav';
      a.click();
    } catch (err: any) {
      setError(err.message || 'Export failed');
    } finally {
      setLoading(false);
    }
  };

  // UI
  return (
    <div className="app-container">
      <h1>MP3 Cutter App</h1>
      <input type="file" accept="audio/*" onChange={handleFileUpload} />
      <div ref={waveformRef} className="waveform-box" />
      <div className="controls">
        <button onClick={handlePlay}>Play</button>
        <button onClick={handleStartRecording} disabled={!audioFile || isRecording}>Start Recording</button>
        <button onClick={handleStopRecording} disabled={!audioFile || !isRecording}>Stop Recording</button>
        <label>Zoom: <input type="range" min={0} max={200} value={zoom} onChange={e => { setZoom(Number(e.target.value)); waveSurfer?.zoom(Number(e.target.value)); }} /></label>
      </div>
      <div className="advanced-controls">
        <label>Gain (dB): <input type="number" value={gain} onChange={e => setGain(Number(e.target.value))} /></label>
        <label>Fade In (ms): <input type="number" value={fadeIn} onChange={e => setFadeIn(Number(e.target.value))} /></label>
        <label>Fade Out (ms): <input type="number" value={fadeOut} onChange={e => setFadeOut(Number(e.target.value))} /></label>
      </div>
      <div className="time-frame-list">
        <label>Selection:</label>
        {timeFrames.map((tf, idx) => (
          <span key={idx}>{tf.start.toFixed(2)}s - {tf.end.toFixed(2)}s</span>
        ))}
      </div>
      <button onClick={handleExport} disabled={!audioFile || timeFrames.length === 0 || loading}>
        {loading ? 'Exporting...' : 'Export Selection (WAV)'}
      </button>
      {error && <div style={{ color: 'red', marginTop: '1em' }}>{error}</div>}
    </div>
  );
}

export default App;
