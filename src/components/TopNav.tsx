import React from 'react';
import { Download, Sparkles, Terminal } from 'lucide-react';

interface TopNavProps {
  activeTab: 'workbench' | 'header' | 'hex' | 'terminal' | 'export';
  setActiveTab: (tab: 'workbench' | 'header' | 'hex' | 'terminal' | 'export') => void;
  onDownloadExe: () => void;
  onLoadPreset: (presetId: string) => void;
  audioName: string;
}

export const TopNav: React.FC<TopNavProps> = ({
  activeTab,
  setActiveTab,
  onDownloadExe,
  onLoadPreset,
  audioName,
}) => {
  return (
    <header className="sticky top-0 z-40 flex items-center justify-between px-6 py-3 bg-neutral-950/90 backdrop-blur-md border-b border-neutral-800">
      {/* Zone 1: Single text element brand wordmark in display style */}
      <div className="flex items-center gap-3">
        <span className="text-base font-semibold tracking-tight font-mono text-amber-400">
          DOS Audio MZ Studio
        </span>
        <span className="hidden sm:inline-block text-xs font-mono text-neutral-500">
          / 8-Bit Executable Synthesizer
        </span>
      </div>

      {/* Zone 2: 4-5 clean text navigation links with hover state */}
      <nav className="hidden md:flex items-center gap-6 text-xs font-mono">
        <button
          onClick={() => setActiveTab('workbench')}
          className={`transition-colors text-left hover:text-amber-300 ${
            activeTab === 'workbench' ? 'text-amber-400 font-semibold underline underline-offset-4' : 'text-neutral-400'
          }`}
        >
          Audio Converter
        </button>
        <button
          onClick={() => setActiveTab('header')}
          className={`transition-colors text-left hover:text-amber-300 ${
            activeTab === 'header' ? 'text-amber-400 font-semibold underline underline-offset-4' : 'text-neutral-400'
          }`}
        >
          MZ Header
        </button>
        <button
          onClick={() => setActiveTab('hex')}
          className={`transition-colors text-left hover:text-amber-300 ${
            activeTab === 'hex' ? 'text-amber-400 font-semibold underline underline-offset-4' : 'text-neutral-400'
          }`}
        >
          Hex Inspector
        </button>
        <button
          onClick={() => setActiveTab('terminal')}
          className={`transition-colors text-left hover:text-amber-300 ${
            activeTab === 'terminal' ? 'text-amber-400 font-semibold underline underline-offset-4' : 'text-neutral-400'
          }`}
        >
          CRT Terminal
        </button>
        <button
          onClick={() => setActiveTab('export')}
          className={`transition-colors text-left hover:text-amber-300 ${
            activeTab === 'export' ? 'text-amber-400 font-semibold underline underline-offset-4' : 'text-neutral-400'
          }`}
        >
          Export & Source
        </button>
      </nav>

      {/* Zone 3: 1-2 primary actions */}
      <div className="flex items-center gap-2">
        <div className="relative group">
          <button className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-mono text-neutral-300 bg-neutral-900 border border-neutral-700 hover:border-neutral-500 hover:text-white transition-colors">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Presets</span>
          </button>
          <div className="absolute right-0 top-full mt-1 w-56 p-1 bg-neutral-900 border border-neutral-700 shadow-xl hidden group-hover:block z-50">
            <div className="px-2 py-1 text-[11px] font-mono text-neutral-400 uppercase tracking-wider border-b border-neutral-800">
              Retro Presets
            </div>
            <button
              onClick={() => onLoadPreset('doom-riff')}
              className="w-full text-left px-2 py-1.5 text-xs font-mono text-neutral-200 hover:bg-neutral-800 hover:text-amber-300"
            >
              DOOM E1M1 Bass Riff
            </button>
            <button
              onClick={() => onLoadPreset('sound-blaster-voice')}
              className="w-full text-left px-2 py-1.5 text-xs font-mono text-neutral-200 hover:bg-neutral-800 hover:text-amber-300"
            >
              Sound Blaster Voice
            </button>
            <button
              onClick={() => onLoadPreset('pc-speaker-arp')}
              className="w-full text-left px-2 py-1.5 text-xs font-mono text-neutral-200 hover:bg-neutral-800 hover:text-amber-300"
            >
              8253 PIT Chiptune Arp
            </button>
            <button
              onClick={() => onLoadPreset('modem-handshake')}
              className="w-full text-left px-2 py-1.5 text-xs font-mono text-neutral-200 hover:bg-neutral-800 hover:text-amber-300"
            >
              2400 Baud Modem Tone
            </button>
            <button
              onClick={() => onLoadPreset('turbo-beep')}
              className="w-full text-left px-2 py-1.5 text-xs font-mono text-neutral-200 hover:bg-neutral-800 hover:text-amber-300"
            >
              8086 Turbo BIOS Jingle
            </button>
          </div>
        </div>

        <button
          onClick={onDownloadExe}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-medium text-neutral-950 bg-amber-400 hover:bg-amber-300 transition-colors whitespace-nowrap shadow-sm"
          title={`Download ${audioName}.EXE`}
        >
          <Download className="w-3.5 h-3.5" />
          <span>Download .EXE</span>
        </button>
      </div>
    </header>
  );
};
