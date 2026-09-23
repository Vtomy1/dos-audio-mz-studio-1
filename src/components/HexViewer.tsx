import React, { useState, useMemo } from 'react';
import { CompiledDosBinary, ByteAnnotation } from '../types/dos';
import { annotateByte } from '../utils/dosExeBuilder';
import { Search, ChevronLeft, ChevronRight, Hash, Eye, Tag } from 'lucide-react';

interface HexViewerProps {
  binary: CompiledDosBinary;
}

const BYTES_PER_ROW = 16;
const ROWS_PER_PAGE = 32; // 512 bytes per page
const BYTES_PER_PAGE = BYTES_PER_ROW * ROWS_PER_PAGE;

export const HexViewer: React.FC<HexViewerProps> = ({ binary }) => {
  const [currentPage, setCurrentPage] = useState<number>(0);
  const [selectedOffset, setSelectedOffset] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchMatches, setSearchMatches] = useState<number[]>([]);
  const [currentMatchIdx, setCurrentMatchIdx] = useState<number>(-1);

  const rawBytes = binary.rawBytes;
  const totalBytes = rawBytes.length;
  const totalPages = Math.max(1, Math.ceil(totalBytes / BYTES_PER_PAGE));

  // Current page byte slice
  const pageStart = currentPage * BYTES_PER_PAGE;
  const pageEnd = Math.min(totalBytes, pageStart + BYTES_PER_PAGE);

  // Inspector annotation for selected byte
  const activeAnnotation: ByteAnnotation = useMemo(() => {
    return annotateByte(selectedOffset, binary);
  }, [selectedOffset, binary]);

  // Handle Search
  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      setSearchMatches([]);
      setCurrentMatchIdx(-1);
      return;
    }

    const clean = query.trim();
    const matches: number[] = [];

    // 1. Check if hex search (e.g. "4D 5A" or "CD21")
    const hexClean = clean.replace(/[\s,0x]/gi, '');
    const isHex = /^[0-9a-fA-F]+$/.test(hexClean) && hexClean.length % 2 === 0;

    if (isHex && hexClean.length >= 2) {
      const searchPattern: number[] = [];
      for (let i = 0; i < hexClean.length; i += 2) {
        searchPattern.push(parseInt(hexClean.slice(i, i + 2), 16));
      }

      for (let i = 0; i <= totalBytes - searchPattern.length; i++) {
        let match = true;
        for (let j = 0; j < searchPattern.length; j++) {
          if (rawBytes[i + j] !== searchPattern[j]) {
            match = false;
            break;
          }
        }
        if (match) {
          matches.push(i);
          if (matches.length >= 100) break;
        }
      }
    } else {
      // 2. Text/ASCII search
      const pattern = clean.toUpperCase();
      let windowStr = '';
      for (let i = 0; i < totalBytes; i++) {
        const char = String.fromCharCode(rawBytes[i]);
        windowStr += char;
        if (windowStr.length > pattern.length) {
          windowStr = windowStr.slice(1);
        }
        if (windowStr.toUpperCase() === pattern) {
          matches.push(i - pattern.length + 1);
          if (matches.length >= 100) break;
        }
      }
    }

    setSearchMatches(matches);
    if (matches.length > 0) {
      setCurrentMatchIdx(0);
      jumpToOffset(matches[0]);
    } else {
      setCurrentMatchIdx(-1);
    }
  };

  const jumpToOffset = (offset: number) => {
    const clamped = Math.max(0, Math.min(totalBytes - 1, offset));
    setSelectedOffset(clamped);
    const targetPage = Math.floor(clamped / BYTES_PER_PAGE);
    setCurrentPage(targetPage);
  };

  const nextMatch = () => {
    if (searchMatches.length === 0) return;
    const nextIdx = (currentMatchIdx + 1) % searchMatches.length;
    setCurrentMatchIdx(nextIdx);
    jumpToOffset(searchMatches[nextIdx]);
  };

  const prevMatch = () => {
    if (searchMatches.length === 0) return;
    const prevIdx = (currentMatchIdx - 1 + searchMatches.length) % searchMatches.length;
    setCurrentMatchIdx(prevIdx);
    jumpToOffset(searchMatches[prevIdx]);
  };

  // Helper to colorize byte based on segment
  const getByteColorClass = (offset: number, isSelected: boolean) => {
    if (isSelected) {
      return 'bg-amber-400 text-neutral-950 font-bold ring-2 ring-amber-300';
    }

    if (binary.headerSize > 0 && offset < 28) {
      return 'text-cyan-400 hover:bg-cyan-950/60';
    }
    if (binary.headerSize > 0 && offset < binary.headerSize) {
      return 'text-neutral-500 hover:bg-neutral-800/60';
    }
    if (offset < binary.audioOffset) {
      return 'text-amber-400 hover:bg-amber-950/60';
    }
    return 'text-emerald-400 hover:bg-emerald-950/60';
  };

  return (
    <div className="space-y-4 font-mono text-xs">
      {/* Top Controls: Jump points & Search */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-neutral-900/40 border border-neutral-800">
        <div className="flex items-center gap-2">
          <span className="text-neutral-400 text-[11px]">Jump to Section:</span>
          {binary.headerSize > 0 && (
            <button
              onClick={() => jumpToOffset(0)}
              className="px-2 py-1 text-[11px] bg-cyan-950/40 border border-cyan-800/60 text-cyan-300 hover:bg-cyan-900/50 transition-colors"
            >
              MZ Header (0x00)
            </button>
          )}
          <button
            onClick={() => jumpToOffset(binary.headerSize)}
            className="px-2 py-1 text-[11px] bg-amber-950/40 border border-amber-800/60 text-amber-300 hover:bg-amber-900/50 transition-colors"
          >
            x86 Code (0x{binary.headerSize.toString(16).toUpperCase()})
          </button>
          <button
            onClick={() => jumpToOffset(binary.audioOffset)}
            className="px-2 py-1 text-[11px] bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 hover:bg-emerald-900/50 transition-colors"
          >
            Audio Payload (0x{binary.audioOffset.toString(16).toUpperCase()})
          </button>
        </div>

        {/* Search Bar */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2 top-2 text-neutral-500" />
            <input
              type="text"
              placeholder="Search Hex (e.g. 5A4D) or ASCII..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-7 pr-3 py-1 bg-neutral-950 border border-neutral-700 text-neutral-200 placeholder-neutral-500 text-xs w-56 focus:outline-none focus:border-amber-400"
            />
          </div>
          {searchMatches.length > 0 && (
            <div className="flex items-center gap-1 text-[11px] text-neutral-400">
              <span className="tabular-nums">
                {currentMatchIdx + 1}/{searchMatches.length}
              </span>
              <button
                onClick={prevMatch}
                className="p-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300"
                title="Previous match"
              >
                <ChevronLeft className="w-3 h-3" />
              </button>
              <button
                onClick={nextMatch}
                className="p-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300"
                title="Next match"
              >
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Split: Hex Dump on Left, Detailed Byte Inspector on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Hex Grid (2 cols on large screens) */}
        <div className="lg:col-span-2 bg-[#0a0d0e] border border-neutral-800 p-3 overflow-x-auto">
          {/* Header Row */}
          <div className="flex items-center text-neutral-500 pb-2 border-b border-neutral-800/80 select-none text-[11px]">
            <span className="w-20 shrink-0">Offset</span>
            <div className="flex gap-1.5 shrink-0 px-2">
              {Array.from({ length: 16 }).map((_, i) => (
                <span key={i} className="w-5 text-center font-mono">
                  {i.toString(16).toUpperCase()}
                </span>
              ))}
            </div>
            <span className="w-36 text-center font-mono shrink-0 pl-2">ASCII Dump</span>
          </div>

          {/* Rows */}
          <div className="space-y-0.5 pt-2 select-text font-mono text-[11px]">
            {Array.from({ length: Math.ceil((pageEnd - pageStart) / BYTES_PER_ROW) }).map((_, rowIdx) => {
              const rowOffset = pageStart + rowIdx * BYTES_PER_ROW;
              if (rowOffset >= totalBytes) return null;

              const rowBytes: number[] = [];
              for (let col = 0; col < BYTES_PER_ROW && rowOffset + col < totalBytes; col++) {
                rowBytes.push(rawBytes[rowOffset + col]);
              }

              return (
                <div
                  key={rowOffset}
                  className="flex items-center hover:bg-neutral-900/40 rounded transition-colors"
                >
                  {/* Offset Column */}
                  <span className="w-20 text-neutral-500 tabular-nums shrink-0 select-none">
                    {rowOffset.toString(16).padStart(8, '0').toUpperCase()}
                  </span>

                  {/* Hex Bytes */}
                  <div className="flex gap-1.5 shrink-0 px-2">
                    {Array.from({ length: 16 }).map((_, col) => {
                      const byteOffset = rowOffset + col;
                      if (col >= rowBytes.length) {
                        return <span key={col} className="w-5 text-center text-transparent">··</span>;
                      }

                      const b = rowBytes[col];
                      const isSelected = selectedOffset === byteOffset;
                      const colorClass = getByteColorClass(byteOffset, isSelected);

                      return (
                        <button
                          key={col}
                          onClick={() => setSelectedOffset(byteOffset)}
                          className={`w-5 text-center cursor-pointer transition-colors ${colorClass}`}
                          title={`Offset: 0x${byteOffset.toString(16).toUpperCase()} (${byteOffset})`}
                        >
                          {b.toString(16).padStart(2, '0').toUpperCase()}
                        </button>
                      );
                    })}
                  </div>

                  {/* ASCII Characters */}
                  <div className="w-36 text-left tracking-widest pl-2 shrink-0 border-l border-neutral-800/80 text-neutral-400">
                    {rowBytes.map((b, col) => {
                      const byteOffset = rowOffset + col;
                      const isSelected = selectedOffset === byteOffset;
                      const char = (b >= 32 && b <= 126) ? String.fromCharCode(b) : '·';
                      return (
                        <span
                          key={col}
                          onClick={() => setSelectedOffset(byteOffset)}
                          className={`cursor-pointer inline-block ${
                            isSelected ? 'text-amber-300 font-bold bg-amber-400/20' : 'hover:text-neutral-200'
                          }`}
                        >
                          {char}
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination Controls */}
          <div className="flex items-center justify-between pt-3 mt-3 border-t border-neutral-800 text-[11px] text-neutral-400">
            <span className="tabular-nums">
              Page {currentPage + 1} of {totalPages} ({pageStart.toLocaleString()}–{pageEnd.toLocaleString()} of {totalBytes.toLocaleString()} bytes)
            </span>
            <div className="flex items-center gap-1">
              <button
                disabled={currentPage === 0}
                onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                className="px-2 py-1 bg-neutral-900 border border-neutral-700 disabled:opacity-30 hover:bg-neutral-800 transition-colors"
              >
                Previous Page
              </button>
              <button
                disabled={currentPage >= totalPages - 1}
                onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
                className="px-2 py-1 bg-neutral-900 border border-neutral-700 disabled:opacity-30 hover:bg-neutral-800 transition-colors"
              >
                Next Page
              </button>
            </div>
          </div>
        </div>

        {/* Byte Inspector Side Card */}
        <div className="p-4 bg-neutral-900/40 border border-neutral-800 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
            <div className="flex items-center gap-2 text-neutral-200 font-semibold">
              <Eye className="w-4 h-4 text-amber-400" />
              <span>Byte Inspector</span>
            </div>
            <span className="text-amber-400 font-bold tabular-nums">
              0x{activeAnnotation.offset.toString(16).padStart(6, '0').toUpperCase()}
            </span>
          </div>

          {/* Value Representations */}
          <div className="space-y-2 text-[11px]">
            <div className="flex justify-between p-2 bg-neutral-950 border border-neutral-800/80">
              <span className="text-neutral-400">Hexadecimal:</span>
              <span className="text-amber-300 font-bold tabular-nums">0x{activeAnnotation.hex}</span>
            </div>
            <div className="flex justify-between p-2 bg-neutral-950 border border-neutral-800/80">
              <span className="text-neutral-400">Binary:</span>
              <span className="text-neutral-200 tabular-nums">
                {activeAnnotation.decimal.toString(2).padStart(8, '0')}
              </span>
            </div>
            <div className="flex justify-between p-2 bg-neutral-950 border border-neutral-800/80">
              <span className="text-neutral-400">Unsigned Decimal:</span>
              <span className="text-neutral-200 tabular-nums">{activeAnnotation.decimal}</span>
            </div>
            <div className="flex justify-between p-2 bg-neutral-950 border border-neutral-800/80">
              <span className="text-neutral-400">Signed Decimal:</span>
              <span className="text-neutral-200 tabular-nums">{activeAnnotation.signedDec}</span>
            </div>
            <div className="flex justify-between p-2 bg-neutral-950 border border-neutral-800/80">
              <span className="text-neutral-400">ASCII Character:</span>
              <span className="text-emerald-400 font-bold">'{activeAnnotation.ascii}'</span>
            </div>
            <div className="flex justify-between p-2 bg-neutral-950 border border-neutral-800/80">
              <span className="text-neutral-400">Segment:Offset:</span>
              <span className="text-cyan-400 tabular-nums">{activeAnnotation.segment}</span>
            </div>
          </div>

          {/* Structural Role & Context */}
          <div className="space-y-2 pt-2 border-t border-neutral-800">
            <div className="text-neutral-300 font-semibold flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-amber-400" />
              <span>{activeAnnotation.fieldTitle}</span>
            </div>
            <p className="text-[11px] text-neutral-400 leading-relaxed bg-neutral-950/60 p-2.5 border border-neutral-800/60">
              {activeAnnotation.explanation}
            </p>
          </div>

          {/* Color Legend */}
          <div className="pt-3 border-t border-neutral-800 space-y-1.5 text-[10px]">
            <div className="text-neutral-400 font-semibold mb-1">Segment Color Legend:</div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 bg-cyan-400/80 inline-block" />
              <span className="text-cyan-300">MZ Header (0x00..0x1B)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 bg-amber-400/80 inline-block" />
              <span className="text-amber-300">x86 Machine Code & Strings</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 bg-emerald-400/80 inline-block" />
              <span className="text-emerald-300">8-bit Audio Payload</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
