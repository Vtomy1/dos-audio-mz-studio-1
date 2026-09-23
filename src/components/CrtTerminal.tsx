import React, { useState, useEffect, useRef } from 'react';
import { CompiledDosBinary, ConvertedAudioData } from '../types/dos';
import { reconstruct8BitAudioBuffer, getAudioContext } from '../utils/audioProcessing';
import { Play, Square, Monitor, Sparkles } from 'lucide-react';

interface CrtTerminalProps {
  binary: CompiledDosBinary;
  audio: ConvertedAudioData;
}

export const CrtTerminal: React.FC<CrtTerminalProps> = ({ binary, audio }) => {
  const [crtTheme, setCrtTheme] = useState<'green' | 'amber' | 'vga'>('green');
  const [scanlines, setScanlines] = useState<boolean>(true);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [terminalLines, setTerminalLines] = useState<string[]>([]);
  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  // Initialize terminal text
  useEffect(() => {
    resetTerminal();
  }, [binary, audio]);

  const resetTerminal = () => {
    const filename = `${audio.audioName.toUpperCase().slice(0, 8)}.EXE`;
    setTerminalLines([
      'Starting MS-DOS 6.22...',
      'HIMEM: DOS XMS Driver, Version 3.10 - Installed.',
      'C:\\> DIR /W',
      `[.]          [..]         ${filename.padEnd(12, ' ')}`,
      '       1 file(s)     ' + binary.fileSizeBytes.toLocaleString() + ' bytes',
      'C:\\> ' + filename,
      ' ',
    ]);
  };

  const runDosBinary = () => {
    if (isRunning) return;
    const ctx = getAudioContext();

    // Setup audio graph with Analyser for CRT oscilloscope
    const buffer = reconstruct8BitAudioBuffer(
      audio.raw8BitData,
      audio.sampleRate,
      'unsigned-8bit'
    );

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyserRef.current = analyser;

    const gainNode = ctx.createGain();
    gainNode.gain.value = 0.85;

    source.connect(analyser);
    analyser.connect(gainNode);
    gainNode.connect(ctx.destination);

    activeSourceRef.current = source;
    setIsRunning(true);

    const bannerText = getBannerText();
    setTerminalLines((prev) => [
      ...prev,
      ...bannerText,
      '>>> Playing 8-bit stream in DOS Real-Mode...',
      '>>> [Press "Halt Program" or ESC to interrupt INT 16h]',
    ]);

    source.onended = () => {
      stopDosBinary(false);
    };

    source.start(0);
    startOscilloscopeAnimation();
  };

  const stopDosBinary = (manualAbort: boolean = true) => {
    if (activeSourceRef.current) {
      try {
        activeSourceRef.current.stop();
        activeSourceRef.current.disconnect();
      } catch {
        // ignore
      }
      activeSourceRef.current = null;
    }
    setIsRunning(false);
    if (animRef.current) {
      cancelAnimationFrame(animRef.current);
      animRef.current = null;
    }

    setTerminalLines((prev) => [
      ...prev,
      manualAbort ? '>>> Keystroke detected via INT 16h! Interrupting...' : '>>> Audio stream complete.',
      '>>> INT 21h AH=4Ch: Terminate process with return code 00h',
      'C:\\> _',
    ]);
  };

  const getBannerText = (): string[] => {
    switch (binary.dosMode) {
      case 'pc-speaker':
        return [
          '====================================================',
          '  [MS-DOS AUDIO] PC SPEAKER 8253 PIT PWM PLAYER     ',
          `  Sample Rate: ${audio.sampleRate} Hz | Bytes: ${audio.samplesCount}   `,
          '  PIT Channel 2 reprogrammed to 1-bit audio PWM.   ',
          '====================================================',
        ];
      case 'covox-lpt1':
        return [
          '====================================================',
          '  [MS-DOS AUDIO] COVOX SPEECH THING (LPT1 0x378)    ',
          `  Streaming 8-bit PCM to Parallel Port DAC          `,
          `  Rate: ${audio.sampleRate} Hz | Buffer: ${audio.samplesCount} bytes    `,
          '====================================================',
        ];
      case 'sound-blaster':
        return [
          '====================================================',
          '  [MS-DOS AUDIO] SOUND BLASTER DSP DIRECT 8-BIT     ',
          '  DSP 2.0+ Reset OK on Base Port 220h               ',
          `  Output Rate: ${audio.sampleRate} Hz               `,
          '====================================================',
        ];
      case 'data-stub':
      default:
        return [
          '====================================================',
          '  [MS-DOS AUDIO] 8-BIT AUDIO DATA CONTAINER v1.0   ',
          `  Payload offset: 0x${binary.audioOffset.toString(16).toUpperCase()} | ${audio.samplesCount} bytes `,
          '  Payload aligned for demoscene intro linkage.      ',
          '====================================================',
        ];
    }
  };

  const startOscilloscopeAnimation = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      const analyser = analyserRef.current;
      const width = canvas.width;
      const height = canvas.height;

      ctx.fillStyle = crtTheme === 'green' ? '#041208' : crtTheme === 'amber' ? '#140c03' : '#08080a';
      ctx.fillRect(0, 0, width, height);

      if (analyser && isRunning) {
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteTimeDomainData(dataArray);

        ctx.lineWidth = 2;
        ctx.strokeStyle =
          crtTheme === 'green' ? '#22c55e' : crtTheme === 'amber' ? '#f59e0b' : '#38bdf8';
        ctx.shadowBlur = 8;
        ctx.shadowColor = ctx.strokeStyle;

        ctx.beginPath();
        const sliceWidth = width / bufferLength;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          const v = dataArray[i] / 128.0;
          const y = (v * height) / 2;

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
          x += sliceWidth;
        }

        ctx.stroke();
        ctx.shadowBlur = 0;
      } else {
        // Flat center trace
        ctx.strokeStyle =
          crtTheme === 'green' ? '#15803d' : crtTheme === 'amber' ? '#b45309' : '#0284c7';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();
      }

      animRef.current = requestAnimationFrame(render);
    };

    animRef.current = requestAnimationFrame(render);
  };

  const themeClasses = {
    green: 'bg-[#031107] text-[#34d399] border-[#134e2b]',
    amber: 'bg-[#120a03] text-[#fbbf24] border-[#78350f]',
    vga: 'bg-[#090b0e] text-[#e2e8f0] border-[#334155]',
  };

  return (
    <div className="space-y-4 font-mono text-xs">
      {/* CRT Display Header Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-neutral-900/40 border border-neutral-800">
        <div className="flex items-center gap-2">
          <Monitor className="w-4 h-4 text-amber-400" />
          <span className="font-semibold text-neutral-200">MS-DOS Real-Mode CRT Terminal</span>
        </div>

        <div className="flex items-center gap-3">
          {/* Theme Switcher */}
          <div className="flex items-center gap-1">
            <span className="text-neutral-400 text-[11px]">Phosphor:</span>
            {(['green', 'amber', 'vga'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setCrtTheme(t)}
                className={`px-2 py-0.5 text-[11px] border capitalize transition-colors ${
                  crtTheme === t
                    ? 'border-neutral-400 bg-neutral-800 text-white font-semibold'
                    : 'border-neutral-800 text-neutral-400 hover:text-neutral-200'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <button
            onClick={() => setScanlines(!scanlines)}
            className={`px-2 py-0.5 text-[11px] border transition-colors ${
              scanlines
                ? 'border-amber-400/80 bg-amber-400/20 text-amber-300'
                : 'border-neutral-800 text-neutral-500'
            }`}
          >
            Scanlines: {scanlines ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>

      {/* The CRT Curved Glass Box */}
      <div
        className={`relative p-6 border-2 rounded-lg shadow-2xl overflow-hidden min-h-[380px] font-mono transition-colors ${themeClasses[crtTheme]}`}
      >
        {/* CRT Scanline Overlay */}
        {scanlines && (
          <div
            className="absolute inset-0 pointer-events-none z-10 opacity-30"
            style={{
              backgroundImage:
                'linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.6) 50%)',
              backgroundSize: '100% 4px',
            }}
          />
        )}

        {/* Oscilloscope Mini-Screen in corner */}
        <div className="absolute top-4 right-4 z-20 w-48 h-20 border border-current bg-black/40 overflow-hidden">
          <div className="text-[9px] px-1 py-0.5 bg-black/60 tracking-wider">
            DAC TRACE (REAL-TIME)
          </div>
          <canvas ref={canvasRef} width={192} height={60} className="w-full h-full block" />
        </div>

        {/* Terminal Text Feed */}
        <div className="space-y-1 z-0 leading-relaxed text-xs">
          {terminalLines.map((line, idx) => (
            <div key={idx} className="whitespace-pre-wrap">
              {line}
            </div>
          ))}
        </div>

        {/* Interactive Prompt & Run Actions */}
        <div className="mt-8 pt-4 border-t border-current/30 flex flex-wrap items-center justify-between gap-3 z-20 relative">
          <div className="flex items-center gap-2">
            {!isRunning ? (
              <button
                onClick={runDosBinary}
                className="flex items-center gap-1.5 px-4 py-2 bg-current text-black font-bold hover:opacity-90 transition-opacity cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>EXECUTE {audio.audioName.toUpperCase().slice(0, 8)}.EXE</span>
              </button>
            ) : (
              <button
                onClick={() => stopDosBinary(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white font-bold hover:bg-red-500 transition-colors cursor-pointer animate-pulse"
              >
                <Square className="w-4 h-4 fill-current" />
                <span>HALT PROGRAM (INT 16h KEYSTROKE)</span>
              </button>
            )}

            <button
              onClick={resetTerminal}
              className="px-3 py-2 border border-current text-current hover:bg-current/10 transition-colors"
            >
              CLS (Clear Screen)
            </button>
          </div>

          <div className="text-[11px] opacity-75">
            DOS EXEC INT 21h AH=4Bh · Conventional RAM: 640 KB Free
          </div>
        </div>
      </div>
    </div>
  );
};
