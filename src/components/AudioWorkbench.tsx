import React, { useEffect, useRef, useState } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  Mic,
  Square,
  Upload,
  Sliders,
  Radio,
  FileCode2,
  VolumeX,
  Gauge
} from 'lucide-react';
import { AudioConversionConfig, ConvertedAudioData, DosPlayerMode, QuantizationMode, TargetSampleRate } from '../types/dos';
import { reconstruct8BitAudioBuffer, getAudioContext } from '../utils/audioProcessing';

interface AudioWorkbenchProps {
  convertedAudio: ConvertedAudioData;
  config: AudioConversionConfig;
  onChangeConfig: (newConfig: Partial<AudioConversionConfig>) => void;
  onFileUpload: (file: File) => void;
  onPresetSelect: (presetId: string) => void;
}

export const AudioWorkbench: React.FC<AudioWorkbenchProps> = ({
  convertedAudio,
  config,
  onChangeConfig,
  onFileUpload,
  onPresetSelect,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playMode, setPlayMode] = useState<'8bit' | 'original'>('8bit');
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordSeconds, setRecordSeconds] = useState<number>(0);

  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const playbackStartTimeRef = useRef<number>(0);
  const pausedAtRef = useRef<number>(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<number | null>(null);

  // Stop playback on unmount or audio change
  useEffect(() => {
    stopPlayback();
  }, [convertedAudio.raw8BitData]);

  const stopPlayback = () => {
    if (activeSourceRef.current) {
      try {
        activeSourceRef.current.stop();
        activeSourceRef.current.disconnect();
      } catch {
        // ignore already stopped
      }
      activeSourceRef.current = null;
    }
    setIsPlaying(false);
    pausedAtRef.current = 0;
    setCurrentTime(0);
  };

  const startPlayback = () => {
    const ctx = getAudioContext();
    stopPlayback();

    let bufferToPlay: AudioBuffer;
    if (playMode === 'original' && convertedAudio.originalBuffer) {
      bufferToPlay = convertedAudio.originalBuffer;
    } else {
      bufferToPlay = reconstruct8BitAudioBuffer(
        convertedAudio.raw8BitData,
        convertedAudio.sampleRate,
        config.quantization
      );
    }

    const source = ctx.createBufferSource();
    source.buffer = bufferToPlay;

    const gainNode = ctx.createGain();
    gainNode.gain.value = 0.85;

    source.connect(gainNode);
    gainNode.connect(ctx.destination);

    source.onended = () => {
      setIsPlaying(false);
      pausedAtRef.current = 0;
      setCurrentTime(0);
    };

    const startTime = ctx.currentTime;
    playbackStartTimeRef.current = startTime;
    source.start(0);
    activeSourceRef.current = source;
    setIsPlaying(true);
  };

  // Animation loop for timeline & canvas waveform
  useEffect(() => {
    let animId: number;
    const updateProgress = () => {
      if (isPlaying && activeSourceRef.current) {
        const ctx = getAudioContext();
        const elapsed = ctx.currentTime - playbackStartTimeRef.current;
        if (elapsed <= convertedAudio.durationSeconds) {
          setCurrentTime(elapsed);
        }
      }
      animId = requestAnimationFrame(updateProgress);
    };
    animId = requestAnimationFrame(updateProgress);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, convertedAudio.durationSeconds]);

  // Draw retro waveform on Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const centerY = height / 2;

    // Background slate
    ctx.fillStyle = '#0a0d0e';
    ctx.fillRect(0, 0, width, height);

    // Grid lines
    ctx.strokeStyle = '#1a2428';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.stroke();

    for (let x = 0; x < width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    // Draw 8-bit stepped waveform
    const data = convertedAudio.raw8BitData;
    const length = data.length;
    if (length > 0) {
      const step = Math.max(1, Math.floor(length / width));
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#34d399'; // Phosphor emerald
      ctx.beginPath();

      for (let x = 0; x < width; x++) {
        const dataIdx = Math.min(length - 1, Math.floor(x * step));
        const byteVal = data[dataIdx]; // 0..255
        // Center is 128
        const normalized = (byteVal - 128) / 128;
        const y = centerY - normalized * (centerY * 0.85);

        if (x === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();

      // Draw quantized dots on high zoom
      if (width / length > 2) {
        ctx.fillStyle = '#10b981';
        for (let i = 0; i < length; i++) {
          const x = (i / length) * width;
          const byteVal = data[i];
          const y = centerY - ((byteVal - 128) / 128) * (centerY * 0.85);
          ctx.fillRect(x - 1, y - 1, 3, 3);
        }
      }
    }

    // Playback cursor
    if (convertedAudio.durationSeconds > 0) {
      const cursorX = (currentTime / convertedAudio.durationSeconds) * width;
      ctx.strokeStyle = '#f59e0b'; // Amber cursor
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cursorX, 0);
      ctx.lineTo(cursorX, height);
      ctx.stroke();
    }
  }, [convertedAudio, currentTime]);

  // File drop / upload handling
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onFileUpload(e.dataTransfer.files[0]);
    }
  };

  // Mic Recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const file = new File([audioBlob], 'mic_record.webm', { type: 'audio/webm' });
        onFileUpload(file);
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordSeconds(0);

      recordTimerRef.current = window.setInterval(() => {
        setRecordSeconds((s) => s + 1);
      }, 1000);
    } catch {
      alert('Microphone access was denied or is unavailable.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordTimerRef.current) {
        clearInterval(recordTimerRef.current);
        recordTimerRef.current = null;
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Bar Status Summary - Zero-Pill compliant metadata */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-neutral-900/50 border border-neutral-800">
        <div>
          <h2 className="text-sm font-semibold font-mono text-neutral-200">
            {convertedAudio.audioName}.EXE
          </h2>
          <div className="flex items-center gap-2 mt-1 text-xs font-mono text-neutral-400">
            <span>{convertedAudio.samplesCount.toLocaleString()} bytes</span>
            <span aria-hidden="true">·</span>
            <span>{convertedAudio.sampleRate.toLocaleString()} Hz</span>
            <span aria-hidden="true">·</span>
            <span>{convertedAudio.durationSeconds.toFixed(2)}s duration</span>
            <span aria-hidden="true">·</span>
            <span>Quantization: {config.quantization}</span>
          </div>
        </div>

        {/* Quick actions: File upload & Mic */}
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono text-neutral-300 bg-neutral-800 border border-neutral-700 hover:border-neutral-500 hover:text-white cursor-pointer transition-colors">
            <Upload className="w-3.5 h-3.5 text-neutral-400" />
            <span>Upload Audio</span>
            <input
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  onFileUpload(e.target.files[0]);
                }
              }}
            />
          </label>

          {isRecording ? (
            <button
              onClick={stopRecording}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono text-red-100 bg-red-900 border border-red-700 hover:bg-red-800 transition-colors animate-pulse"
            >
              <Square className="w-3.5 h-3.5 text-red-300" />
              <span>Stop ({recordSeconds}s)</span>
            </button>
          ) : (
            <button
              onClick={startRecording}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono text-neutral-300 bg-neutral-800 border border-neutral-700 hover:border-neutral-500 hover:text-white transition-colors"
            >
              <Mic className="w-3.5 h-3.5 text-amber-400" />
              <span>Record Mic</span>
            </button>
          )}
        </div>
      </div>

      {/* Retro Waveform Display & Scrubbing Bar */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        className="relative bg-[#0a0d0e] border border-neutral-800 overflow-hidden"
      >
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-neutral-800 text-[11px] font-mono text-neutral-400">
          <div className="flex items-center gap-2">
            <span className="text-emerald-400">OSCILLOSCOPE 8-BIT WAVEFORM</span>
            <span>·</span>
            <span>RANGE [00h..FFh]</span>
          </div>
          <div className="tabular-nums text-amber-400">
            {currentTime.toFixed(2)}s / {convertedAudio.durationSeconds.toFixed(2)}s
          </div>
        </div>

        <canvas
          ref={canvasRef}
          width={900}
          height={160}
          className="w-full h-40 cursor-pointer block"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const frac = clickX / rect.width;
            setCurrentTime(frac * convertedAudio.durationSeconds);
          }}
        />

        {/* Transport Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-neutral-900/80 border-t border-neutral-800 font-mono text-xs">
          <div className="flex items-center gap-2">
            {isPlaying ? (
              <button
                onClick={stopPlayback}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-medium transition-colors"
              >
                <Pause className="w-3.5 h-3.5" />
                <span>Pause</span>
              </button>
            ) : (
              <button
                onClick={startPlayback}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-medium transition-colors"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Play 8-Bit Audio</span>
              </button>
            )}

            <button
              onClick={stopPlayback}
              className="p-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors"
              title="Stop & Reset"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Switch audio preview between 8-bit quantized vs original audio */}
          <div className="flex items-center gap-1 p-0.5 bg-neutral-800/80 border border-neutral-700">
            <button
              onClick={() => {
                setPlayMode('8bit');
                if (isPlaying) startPlayback();
              }}
              className={`px-2.5 py-1 transition-colors ${
                playMode === '8bit'
                  ? 'bg-neutral-700 text-amber-300 font-semibold'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              8-Bit Quantized
            </button>
            <button
              onClick={() => {
                setPlayMode('original');
                if (isPlaying) startPlayback();
              }}
              className={`px-2.5 py-1 transition-colors ${
                playMode === 'original'
                  ? 'bg-neutral-700 text-neutral-200 font-semibold'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              Original Source
            </button>
          </div>

          {/* Min / Max byte values */}
          <div className="hidden sm:flex items-center gap-3 text-neutral-400 tabular-nums">
            <span>Min: 0x{convertedAudio.minByte.toString(16).padStart(2, '0').toUpperCase()}</span>
            <span>·</span>
            <span>Max: 0x{convertedAudio.maxByte.toString(16).padStart(2, '0').toUpperCase()}</span>
            <span>·</span>
            <span>RMS: {(convertedAudio.rms * 100).toFixed(1)}%</span>
          </div>
        </div>
      </div>

      {/* Conversion Controls Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 font-mono text-xs">
        {/* Card 1: Sample Rate & Resampling */}
        <div className="p-4 bg-neutral-900/40 border border-neutral-800 space-y-4">
          <div className="flex items-center gap-2 text-neutral-300 font-semibold">
            <Gauge className="w-4 h-4 text-amber-400" />
            <span>Target Sample Rate</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {([4000, 8000, 11025, 16000, 22050, 44100] as TargetSampleRate[]).map((rate) => (
              <button
                key={rate}
                onClick={() => onChangeConfig({ sampleRate: rate })}
                className={`px-2.5 py-2 text-left border transition-colors ${
                  config.sampleRate === rate
                    ? 'border-amber-400/80 bg-amber-400/10 text-amber-300 font-medium'
                    : 'border-neutral-800 bg-neutral-950/40 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200'
                }`}
              >
                <div className="text-xs font-semibold tabular-nums">{rate.toLocaleString()} Hz</div>
                <div className="text-[10px] text-neutral-500 mt-0.5">
                  {rate === 11025
                    ? 'Sound Blaster 1.0'
                    : rate === 22050
                    ? 'Sound Blaster Pro'
                    : rate === 8000
                    ? 'Covox / Speech'
                    : rate === 4000
                    ? 'Ultra Compact'
                    : `${(rate / 1000).toFixed(1)} kHz`}
                </div>
              </button>
            ))}
          </div>

          <p className="text-[11px] text-neutral-500 leading-relaxed">
            Standard MS-DOS demoscene audio commonly uses 11,025 Hz or 8,000 Hz for optimal timing
            loops on 8086–486 CPUs.
          </p>
        </div>

        {/* Card 2: Quantization & Dithering */}
        <div className="p-4 bg-neutral-900/40 border border-neutral-800 space-y-4">
          <div className="flex items-center gap-2 text-neutral-300 font-semibold">
            <Radio className="w-4 h-4 text-amber-400" />
            <span>8-Bit Quantization Mode</span>
          </div>

          <div className="space-y-1.5">
            {[
              { id: 'unsigned-8bit', label: 'Unsigned 8-bit PCM (0..255)', desc: 'MS-DOS & Sound Blaster standard (128 = silence)' },
              { id: 'signed-8bit', label: 'Signed 8-bit PCM (-128..127)', desc: 'Amiga MOD / Gravis UltraSound format' },
              { id: 'ulaw-8bit', label: 'μ-Law 8-bit Logarithmic', desc: 'CCITT G.711 non-linear dynamic range' },
              { id: 'pc-speaker-pwm', label: '1-bit PC Speaker PWM', desc: 'IBM PC 8253 PIT Timer Channel 2 modulation' },
              { id: 'covox-lpt', label: 'Covox Speech Thing DAC', desc: 'Parallel Printer Port LPT1 (0x378) ladder' },
            ].map((mode) => (
              <button
                key={mode.id}
                onClick={() => onChangeConfig({ quantization: mode.id as QuantizationMode })}
                className={`w-full px-2.5 py-1.5 text-left border transition-colors ${
                  config.quantization === mode.id
                    ? 'border-amber-400/80 bg-amber-400/10 text-amber-300 font-medium'
                    : 'border-neutral-800 bg-neutral-950/40 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200'
                }`}
              >
                <div className="text-xs">{mode.label}</div>
                <div className="text-[10px] text-neutral-500 mt-0.5">{mode.desc}</div>
              </button>
            ))}
          </div>

          <div className="pt-2 border-t border-neutral-800 flex items-center justify-between">
            <span className="text-neutral-400">Dithering:</span>
            <div className="flex gap-1">
              {(['none', 'triangular', 'floyd-steinberg'] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => onChangeConfig({ dither: d })}
                  className={`px-2 py-0.5 text-[10px] border transition-colors ${
                    config.dither === d
                      ? 'border-amber-400 bg-amber-400/20 text-amber-300'
                      : 'border-neutral-800 text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  {d === 'none' ? 'Off' : d === 'triangular' ? 'TPDF' : 'Error Diff.'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Card 3: MS-DOS Hardware Player Routine */}
        <div className="p-4 bg-neutral-900/40 border border-neutral-800 space-y-4">
          <div className="flex items-center gap-2 text-neutral-300 font-semibold">
            <FileCode2 className="w-4 h-4 text-amber-400" />
            <span>Target DOS Player Engine</span>
          </div>

          <div className="space-y-1.5">
            {[
              {
                id: 'pc-speaker',
                label: 'PC Speaker PWM Player',
                desc: 'Reprograms 8253 PIT ports 42h/43h/61h. Works on every IBM PC!',
              },
              {
                id: 'covox-lpt1',
                label: 'Covox Speech Thing DAC',
                desc: 'Writes directly to Parallel Port LPT1 (0x378) resistor DAC.',
              },
              {
                id: 'sound-blaster',
                label: 'Sound Blaster DSP Direct',
                desc: 'Direct mode DSP command 10h at base port 220h.',
              },
              {
                id: 'data-stub',
                label: 'MZ Container Stub',
                desc: 'Prints DOS banner and exits. Keeps payload aligned for code.',
              },
              {
                id: 'com-flat',
                label: 'Flat .COM Binary',
                desc: '16-bit small model ORG 100h raw binary executable.',
              },
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => onChangeConfig({ dosPlayer: p.id as DosPlayerMode })}
                className={`w-full px-2.5 py-1.5 text-left border transition-colors ${
                  config.dosPlayer === p.id
                    ? 'border-amber-400/80 bg-amber-400/10 text-amber-300 font-medium'
                    : 'border-neutral-800 bg-neutral-950/40 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200'
                }`}
              >
                <div className="text-xs">{p.label}</div>
                <div className="text-[10px] text-neutral-500 mt-0.5">{p.desc}</div>
              </button>
            ))}
          </div>

          {/* Gain & Normalization */}
          <div className="pt-2 border-t border-neutral-800 space-y-2">
            <div className="flex items-center justify-between text-neutral-400">
              <span>Gain / Volume:</span>
              <span className="tabular-nums text-neutral-200 font-medium">{config.gain.toFixed(1)}x</span>
            </div>
            <input
              type="range"
              min="0.2"
              max="2.5"
              step="0.1"
              value={config.gain}
              onChange={(e) => onChangeConfig({ gain: parseFloat(e.target.value) })}
              className="w-full accent-amber-400"
            />
            <div className="flex items-center justify-between pt-1">
              <span className="text-neutral-400">Normalize Peak:</span>
              <button
                onClick={() => onChangeConfig({ normalize: !config.normalize })}
                className={`px-2 py-0.5 text-[11px] border transition-colors ${
                  config.normalize
                    ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300'
                    : 'border-neutral-800 text-neutral-400 hover:text-neutral-200'
                }`}
              >
                {config.normalize ? 'Enabled' : 'Disabled'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
