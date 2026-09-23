import React, { useState } from 'react';
import { CompiledDosBinary, ConvertedAudioData } from '../types/dos';
import { exportToWav8Bit } from '../utils/audioProcessing';
import {
  generateCHeader,
  generateAsmSource,
  generateQBasicSource,
  generateDosBoxGuide,
} from '../utils/codeGenerators';
import { Download, Copy, Check, FileCode, Terminal, FileText, Sparkles } from 'lucide-react';

interface ExportPanelProps {
  binary: CompiledDosBinary;
  audio: ConvertedAudioData;
}

export const ExportPanel: React.FC<ExportPanelProps> = ({ binary, audio }) => {
  const [activeCodeTab, setActiveCodeTab] = useState<'c' | 'asm' | 'qbasic' | 'dosbox'>('c');
  const [copied, setCopied] = useState<boolean>(false);

  const filenameBase = audio.audioName.toUpperCase().replace(/[^A-Z0-9_-]/g, '_');

  // Trigger file download helper
  const triggerDownload = (data: Uint8Array | string, filename: string, mimeType: string) => {
    let blob: Blob;
    if (typeof data === 'string') {
      blob = new Blob([data], { type: mimeType });
    } else {
      // Uint8Array: cast buffer to ArrayBuffer to satisfy TS DOM type
      const arrayBuf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
      blob = new Blob([arrayBuf], { type: mimeType });
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadExe = () => {
    triggerDownload(
      binary.rawBytes,
      `${filenameBase}.EXE`,
      'application/x-msdownload'
    );
  };

  const handleDownloadCom = () => {
    triggerDownload(
      binary.rawBytes,
      `${filenameBase}.COM`,
      'application/octet-stream'
    );
  };

  const handleDownloadWav = () => {
    const wavBytes = exportToWav8Bit(audio.raw8BitData, audio.sampleRate);
    triggerDownload(wavBytes, `${filenameBase}_8BIT.WAV`, 'audio/wav');
  };

  const handleDownloadRaw = () => {
    triggerDownload(audio.raw8BitData, `${filenameBase}.RAW`, 'application/octet-stream');
  };

  // Source text based on active tab
  let codeContent = '';
  let codeFilename = '';
  switch (activeCodeTab) {
    case 'c':
      codeContent = generateCHeader(audio, binary);
      codeFilename = `${filenameBase.toLowerCase()}_audio.h`;
      break;
    case 'asm':
      codeContent = generateAsmSource(audio, binary);
      codeFilename = `${filenameBase.toLowerCase()}_play.asm`;
      break;
    case 'qbasic':
      codeContent = generateQBasicSource(audio);
      codeFilename = `${filenameBase.toLowerCase()}_play.bas`;
      break;
    case 'dosbox':
      codeContent = generateDosBoxGuide(`${filenameBase}.EXE`);
      codeFilename = `RUN_${filenameBase}.BAT`;
      break;
  }

  const handleCopyCode = () => {
    navigator.clipboard.writeText(codeContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadCode = () => {
    triggerDownload(codeContent, codeFilename, 'text/plain');
  };

  return (
    <div className="space-y-6 font-mono text-xs">
      {/* Download Cards Grid */}
      <div>
        <h3 className="text-sm font-semibold text-neutral-200 mb-3 flex items-center gap-2">
          <Download className="w-4 h-4 text-amber-400" />
          <span>Compiled MS-DOS Binaries & Converted Audio Formats</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Card 1: .EXE */}
          <div className="p-4 bg-neutral-900/40 border border-neutral-800 hover:border-amber-400/60 transition-colors flex flex-col justify-between space-y-3">
            <div>
              <div className="text-xs font-bold text-amber-400">{filenameBase}.EXE</div>
              <div className="text-[11px] text-neutral-400 mt-1">MS-DOS MZ Executable</div>
              <div className="text-[10px] text-neutral-500 mt-0.5">
                {binary.fileSizeBytes.toLocaleString()} bytes · Includes {binary.dosMode} player
              </div>
            </div>
            <button
              onClick={handleDownloadExe}
              className="w-full py-2 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold transition-colors flex items-center justify-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download .EXE</span>
            </button>
          </div>

          {/* Card 2: .COM */}
          <div className="p-4 bg-neutral-900/40 border border-neutral-800 hover:border-amber-400/60 transition-colors flex flex-col justify-between space-y-3">
            <div>
              <div className="text-xs font-bold text-sky-400">{filenameBase}.COM</div>
              <div className="text-[11px] text-neutral-400 mt-1">Flat Real-Mode Binary</div>
              <div className="text-[10px] text-neutral-500 mt-0.5">
                {binary.rawBytes.length.toLocaleString()} bytes · Starts at ORG 100h
              </div>
            </div>
            <button
              onClick={handleDownloadCom}
              className="w-full py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-semibold transition-colors flex items-center justify-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download .COM</span>
            </button>
          </div>

          {/* Card 3: 8-bit .WAV */}
          <div className="p-4 bg-neutral-900/40 border border-neutral-800 hover:border-amber-400/60 transition-colors flex flex-col justify-between space-y-3">
            <div>
              <div className="text-xs font-bold text-emerald-400">{filenameBase}_8BIT.WAV</div>
              <div className="text-[11px] text-neutral-400 mt-1">Standard RIFF 8-bit Mono</div>
              <div className="text-[10px] text-neutral-500 mt-0.5">
                {(audio.raw8BitData.length + 44).toLocaleString()} bytes · {audio.sampleRate} Hz
              </div>
            </div>
            <button
              onClick={handleDownloadWav}
              className="w-full py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-semibold transition-colors flex items-center justify-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download .WAV</span>
            </button>
          </div>

          {/* Card 4: .RAW */}
          <div className="p-4 bg-neutral-900/40 border border-neutral-800 hover:border-amber-400/60 transition-colors flex flex-col justify-between space-y-3">
            <div>
              <div className="text-xs font-bold text-purple-400">{filenameBase}.RAW</div>
              <div className="text-[11px] text-neutral-400 mt-1">Pure 8-Bit PCM Bytes</div>
              <div className="text-[10px] text-neutral-500 mt-0.5">
                {audio.raw8BitData.length.toLocaleString()} bytes · Headerless
              </div>
            </div>
            <button
              onClick={handleDownloadRaw}
              className="w-full py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-semibold transition-colors flex items-center justify-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download .RAW</span>
            </button>
          </div>
        </div>
      </div>

      {/* Code Generation Viewer */}
      <div className="bg-neutral-900/40 border border-neutral-800">
        {/* Tab Headers */}
        <div className="flex flex-wrap items-center justify-between border-b border-neutral-800 px-4 py-2 bg-neutral-950/60 gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveCodeTab('c')}
              className={`px-3 py-1 text-xs transition-colors ${
                activeCodeTab === 'c'
                  ? 'bg-neutral-800 text-amber-400 font-bold border border-neutral-700'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              C / C++ Header (.h)
            </button>
            <button
              onClick={() => setActiveCodeTab('asm')}
              className={`px-3 py-1 text-xs transition-colors ${
                activeCodeTab === 'asm'
                  ? 'bg-neutral-800 text-amber-400 font-bold border border-neutral-700'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              x86 Assembly (.asm)
            </button>
            <button
              onClick={() => setActiveCodeTab('qbasic')}
              className={`px-3 py-1 text-xs transition-colors ${
                activeCodeTab === 'qbasic'
                  ? 'bg-neutral-800 text-amber-400 font-bold border border-neutral-700'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              QuickBASIC 4.5 (.bas)
            </button>
            <button
              onClick={() => setActiveCodeTab('dosbox')}
              className={`px-3 py-1 text-xs transition-colors ${
                activeCodeTab === 'dosbox'
                  ? 'bg-neutral-800 text-amber-400 font-bold border border-neutral-700'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              DOSBox Guide (.bat)
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyCode}
              className="flex items-center gap-1.5 px-3 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy Code'}</span>
            </button>
            <button
              onClick={handleDownloadCode}
              className="flex items-center gap-1.5 px-3 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Save File</span>
            </button>
          </div>
        </div>

        {/* Code Block */}
        <div className="p-4 bg-[#0a0d0e] overflow-x-auto max-h-[420px]">
          <pre className="text-[11px] leading-relaxed text-neutral-300 whitespace-pre font-mono">
            {codeContent}
          </pre>
        </div>
      </div>
    </div>
  );
};
