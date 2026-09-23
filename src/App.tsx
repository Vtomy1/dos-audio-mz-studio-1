/**
 * DOS Audio MZ Studio - Audio to MS-DOS EXE 8-Bit Converter
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { TopNav } from './components/TopNav';
import { AudioWorkbench } from './components/AudioWorkbench';
import { MzHeaderInspector } from './components/MzHeaderInspector';
import { HexViewer } from './components/HexViewer';
import { CrtTerminal } from './components/CrtTerminal';
import { ExportPanel } from './components/ExportPanel';
import { AudioConversionConfig, ConvertedAudioData, MzHeader } from './types/dos';
import { convertAudioTo8Bit, createRetroPresetBuffer, decodeAudioFile } from './utils/audioProcessing';
import { buildDosExecutable } from './utils/dosExeBuilder';
import { Terminal, Disc, Cpu, Code2 } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'workbench' | 'header' | 'hex' | 'terminal' | 'export'>('workbench');
  
  // Default configuration
  const [config, setConfig] = useState<AudioConversionConfig>({
    sampleRate: 11025,           // Classic Sound Blaster 1.0 sample rate
    quantization: 'unsigned-8bit', // MS-DOS standard
    dither: 'none',
    normalize: true,
    gain: 1.0,
    cropStartPercent: 0,
    cropEndPercent: 100,
    dosPlayer: 'pc-speaker',
  });

  // Current raw audio buffer
  const [rawAudioBuffer, setRawAudioBuffer] = useState<AudioBuffer | null>(null);
  const [audioName, setAudioName] = useState<string>('DOOM_RIFF');
  const [headerOverrides, setHeaderOverrides] = useState<Partial<MzHeader>>({});

  // Initialize with DOOM E1M1 style preset on mount
  useEffect(() => {
    try {
      const presetBuffer = createRetroPresetBuffer('doom-riff');
      setRawAudioBuffer(presetBuffer);
      setAudioName('DOOM_RIFF');
    } catch {
      // AudioContext may require user interaction; keep graceful fallback
    }
  }, []);

  // Compute 8-bit quantized data whenever raw audio buffer or conversion config changes
  const convertedAudio: ConvertedAudioData = useMemo(() => {
    if (!rawAudioBuffer) {
      // Fallback empty data if context is suspended before click
      return {
        originalBuffer: null,
        raw8BitData: new Uint8Array(1024).fill(128),
        sampleRate: config.sampleRate,
        durationSeconds: 1024 / config.sampleRate,
        samplesCount: 1024,
        minByte: 128,
        maxByte: 128,
        rms: 0,
        audioName,
      };
    }
    return convertAudioTo8Bit(rawAudioBuffer, config, audioName);
  }, [rawAudioBuffer, config, audioName]);

  // Compile genuine MS-DOS MZ Executable (.EXE) binary
  const compiledBinary = useMemo(() => {
    return buildDosExecutable(convertedAudio, config.dosPlayer, headerOverrides);
  }, [convertedAudio, config.dosPlayer, headerOverrides]);

  // Config change handler
  const handleChangeConfig = useCallback((newConfig: Partial<AudioConversionConfig>) => {
    setConfig((prev) => ({ ...prev, ...newConfig }));
  }, []);

  // Preset load handler
  const handleLoadPreset = useCallback((presetId: string) => {
    const buffer = createRetroPresetBuffer(presetId);
    setRawAudioBuffer(buffer);
    const names: Record<string, string> = {
      'doom-riff': 'DOOM_RIFF',
      'sound-blaster-voice': 'SB16_VOX',
      'pc-speaker-arp': 'PIT_ARP',
      'modem-handshake': 'MODEM_2400',
      'turbo-beep': 'TURBO_8086',
    };
    setAudioName(names[presetId] || 'PRESET');
    setHeaderOverrides({});
  }, []);

  // File upload handler
  const handleFileUpload = useCallback(async (file: File) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const decodedBuffer = await decodeAudioFile(arrayBuffer);
      setRawAudioBuffer(decodedBuffer);
      const cleanName = file.name.replace(/\.[^/.]+$/, '').toUpperCase().replace(/[^A-Z0-9_-]/g, '_');
      setAudioName(cleanName || 'CUSTOM_AUDIO');
      setHeaderOverrides({});
    } catch {
      alert('Could not decode audio file. Please check that the file is a valid audio format (WAV, MP3, OGG, FLAC).');
    }
  }, []);

  // Quick Download .EXE
  const handleDownloadExe = useCallback(() => {
    const filename = `${audioName.toUpperCase().slice(0, 8)}.EXE`;
    // Cast buffer slice to ArrayBuffer to satisfy TS DOM type
    const arrayBuf = compiledBinary.rawBytes.buffer.slice(
      compiledBinary.rawBytes.byteOffset,
      compiledBinary.rawBytes.byteOffset + compiledBinary.rawBytes.byteLength
    ) as ArrayBuffer;
    const blob = new Blob([arrayBuf], {
      type: 'application/x-msdownload',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [audioName, compiledBinary]);

  // Header field override updater
  const handleUpdateHeaderOverride = useCallback((overrides: Partial<MzHeader>) => {
    setHeaderOverrides((prev) => ({ ...prev, ...overrides }));
  }, []);

  const handleResetHeaderOverrides = useCallback(() => {
    setHeaderOverrides({});
  }, []);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col selection:bg-amber-500/30 selection:text-amber-200">
      {/* Top Bar - Strict 3-Zone Contract */}
      <TopNav
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onDownloadExe={handleDownloadExe}
        onLoadPreset={handleLoadPreset}
        audioName={audioName}
      />

      {/* Main Workspace Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Navigation Tabs Bar for Mobile/Tablet */}
        <div className="flex md:hidden items-center gap-1 p-1 bg-neutral-900 border border-neutral-800 overflow-x-auto text-xs font-mono">
          {(
            [
              { id: 'workbench', label: 'Audio Converter' },
              { id: 'header', label: 'MZ Header' },
              { id: 'hex', label: 'Hex Inspector' },
              { id: 'terminal', label: 'CRT Terminal' },
              { id: 'export', label: 'Export' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? 'bg-neutral-800 text-amber-300 font-semibold'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Viewport Content Switching */}
        {activeTab === 'workbench' && (
          <AudioWorkbench
            convertedAudio={convertedAudio}
            config={config}
            onChangeConfig={handleChangeConfig}
            onFileUpload={handleFileUpload}
            onPresetSelect={handleLoadPreset}
          />
        )}

        {activeTab === 'header' && (
          <MzHeaderInspector
            binary={compiledBinary}
            onUpdateHeaderOverride={handleUpdateHeaderOverride}
            onResetHeaderOverrides={handleResetHeaderOverrides}
          />
        )}

        {activeTab === 'hex' && <HexViewer binary={compiledBinary} />}

        {activeTab === 'terminal' && (
          <CrtTerminal binary={compiledBinary} audio={convertedAudio} />
        )}

        {activeTab === 'export' && (
          <ExportPanel binary={compiledBinary} audio={convertedAudio} />
        )}

        {/* Bottom Technical Reference - Clean Unboxed Layout */}
        <footer className="pt-8 border-t border-neutral-900 text-[11px] font-mono text-neutral-500 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span>MS-DOS MZ (0x5A4D) Executable Specification</span>
            <span>·</span>
            <span>16-Bit Real Mode x86</span>
            <span>·</span>
            <span>Target: DOS 3.30+ / DOSBox / FreeDOS</span>
          </div>
          <div>
            <span>Offset: 0x{compiledBinary.audioOffset.toString(16).toUpperCase()}</span>
            <span className="mx-2">·</span>
            <span>Size: {compiledBinary.fileSizeBytes.toLocaleString()} bytes</span>
          </div>
        </footer>
      </main>
    </div>
  );
}
