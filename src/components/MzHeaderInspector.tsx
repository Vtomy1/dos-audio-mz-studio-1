import React from 'react';
import { CompiledDosBinary, MzHeader } from '../types/dos';
import { Binary, Cpu, Layers, RefreshCw, Info } from 'lucide-react';

interface MzHeaderInspectorProps {
  binary: CompiledDosBinary;
  onUpdateHeaderOverride: (overrides: Partial<MzHeader>) => void;
  onResetHeaderOverrides: () => void;
}

export const MzHeaderInspector: React.FC<MzHeaderInspectorProps> = ({
  binary,
  onUpdateHeaderOverride,
  onResetHeaderOverrides,
}) => {
  const h = binary.header;
  const isCom = binary.dosMode === 'com-flat';

  // Calculate file size from header fields
  const calculatedFileSize = h.e_cp > 0 ? (h.e_cp - 1) * 512 + h.e_cblp : 0;
  const headerSizeBytes = h.e_cparhdr * 16;
  const codeEntryOffset = headerSizeBytes + h.e_ip;

  const headerFields = [
    {
      offset: '0x00',
      name: 'e_magic',
      label: 'MZ Magic Signature',
      value: `0x${h.e_magic.toString(16).padStart(4, '0').toUpperCase()} ("${String.fromCharCode(
        h.e_magic & 0xff
      )}${String.fromCharCode((h.e_magic >> 8) & 0xff)}")`,
      description: 'DOS signature 0x5A4D ("MZ") identifying Mark Zbikowski executable format.',
      editable: false,
    },
    {
      offset: '0x02',
      name: 'e_cblp',
      label: 'Bytes on Last Page',
      value: `${h.e_cblp} (0x${h.e_cblp.toString(16).toUpperCase()})`,
      description: 'Number of valid bytes on the final 512-byte page of the executable.',
      editable: false,
    },
    {
      offset: '0x04',
      name: 'e_cp',
      label: 'Total Pages in File',
      value: `${h.e_cp} (0x${h.e_cp.toString(16).toUpperCase()})`,
      description: 'Count of 512-byte pages in the file (including any partial last page).',
      editable: false,
    },
    {
      offset: '0x06',
      name: 'e_crlc',
      label: 'Relocation Items',
      value: `${h.e_crlc}`,
      description: 'Number of segment pointers in relocation table (0 for flat real-mode).',
      editable: false,
    },
    {
      offset: '0x08',
      name: 'e_cparhdr',
      label: 'Header Size in Paragraphs',
      value: `${h.e_cparhdr} paragraphs (${h.e_cparhdr * 16} bytes)`,
      description: 'Size of the executable header in 16-byte units before executable image begins.',
      editable: false,
    },
    {
      offset: '0x0A',
      name: 'e_minalloc',
      label: 'Min Extra Paragraphs',
      value: `0x${h.e_minalloc.toString(16).padStart(4, '0').toUpperCase()} (${h.e_minalloc * 16} bytes)`,
      description: 'Minimum number of 16-byte memory paragraphs required beyond executable size.',
      editable: true,
      key: 'e_minalloc' as const,
      inputVal: h.e_minalloc,
    },
    {
      offset: '0x0C',
      name: 'e_maxalloc',
      label: 'Max Extra Paragraphs',
      value: `0x${h.e_maxalloc.toString(16).padStart(4, '0').toUpperCase()} (64 KB / All RAM)`,
      description: 'Maximum extra paragraphs requested (0xFFFF instructs DOS to allocate all available conventional RAM).',
      editable: true,
      key: 'e_maxalloc' as const,
      inputVal: h.e_maxalloc,
    },
    {
      offset: '0x0E',
      name: 'e_ss',
      label: 'Initial Stack Segment (SS)',
      value: `0x${h.e_ss.toString(16).padStart(4, '0').toUpperCase()}`,
      description: 'Initial SS relative to program load segment (typically CS or payload segment).',
      editable: true,
      key: 'e_ss' as const,
      inputVal: h.e_ss,
    },
    {
      offset: '0x10',
      name: 'e_sp',
      label: 'Initial Stack Pointer (SP)',
      value: `0x${h.e_sp.toString(16).padStart(4, '0').toUpperCase()} (${h.e_sp} bytes)`,
      description: 'Initial stack pointer offset inside stack segment.',
      editable: true,
      key: 'e_sp' as const,
      inputVal: h.e_sp,
    },
    {
      offset: '0x12',
      name: 'e_csum',
      label: 'Checksum',
      value: `0x${h.e_csum.toString(16).padStart(4, '0').toUpperCase()}`,
      description: 'Checksum of the file (almost always unused and 0x0000 under MS-DOS).',
      editable: false,
    },
    {
      offset: '0x14',
      name: 'e_ip',
      label: 'Initial Instruction Pointer (IP)',
      value: `0x${h.e_ip.toString(16).padStart(4, '0').toUpperCase()}`,
      description: 'Entry point instruction offset relative to Code Segment (CS).',
      editable: true,
      key: 'e_ip' as const,
      inputVal: h.e_ip,
    },
    {
      offset: '0x16',
      name: 'e_cs',
      label: 'Initial Code Segment (CS)',
      value: `0x${h.e_cs.toString(16).padStart(4, '0').toUpperCase()}`,
      description: 'Initial CS register relative to program load segment.',
      editable: true,
      key: 'e_cs' as const,
      inputVal: h.e_cs,
    },
    {
      offset: '0x18',
      name: 'e_lfarlc',
      label: 'Relocation Table File Offset',
      value: `0x${h.e_lfarlc.toString(16).padStart(4, '0').toUpperCase()} (byte ${h.e_lfarlc})`,
      description: 'Byte offset from start of file to the relocation pointer table.',
      editable: false,
    },
    {
      offset: '0x1A',
      name: 'e_ovno',
      label: 'Overlay Number',
      value: `0x${h.e_ovno.toString(16).padStart(4, '0').toUpperCase()}`,
      description: 'Overlay index: 0 indicates the root/main executable image.',
      editable: false,
    },
  ];

  if (isCom) {
    return (
      <div className="p-8 bg-neutral-900/40 border border-neutral-800 font-mono text-center space-y-4">
        <Binary className="w-8 h-8 text-amber-400 mx-auto" />
        <h3 className="text-base font-semibold text-neutral-200">
          Flat .COM Binary Mode Selected
        </h3>
        <p className="text-xs text-neutral-400 max-w-lg mx-auto leading-relaxed">
          Standard MS-DOS .COM files do not contain an MZ executable header. Instead, they are
          flat binary images loaded by DOS directly into a single 64KB memory segment at offset
          <span className="text-amber-300 font-bold"> CS:0100h</span> immediately following the
          256-byte Program Segment Prefix (PSP).
        </p>
        <p className="text-xs text-neutral-500">
          Switch to <span className="text-neutral-300">PC Speaker, Covox, Sound Blaster, or MZ Container</span> in the
          Audio Converter tab to inspect the 28-byte MZ header.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-mono text-xs">
      {/* Top Section: Overview and Memory Layout Diagram */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Memory Math Card */}
        <div className="p-4 bg-neutral-900/40 border border-neutral-800 space-y-3">
          <div className="flex items-center gap-2 text-neutral-200 font-semibold">
            <Cpu className="w-4 h-4 text-amber-400" />
            <span>x86 Real-Mode Math</span>
          </div>
          <div className="space-y-2 text-neutral-400 text-[11px]">
            <div className="flex justify-between border-b border-neutral-800/80 pb-1">
              <span>Header Size (e_cparhdr × 16):</span>
              <span className="text-neutral-200 tabular-nums">{headerSizeBytes} bytes</span>
            </div>
            <div className="flex justify-between border-b border-neutral-800/80 pb-1">
              <span>File Size from Header:</span>
              <span className="text-neutral-200 tabular-nums">{calculatedFileSize.toLocaleString()} bytes</span>
            </div>
            <div className="flex justify-between border-b border-neutral-800/80 pb-1">
              <span>Actual File Size:</span>
              <span className="text-neutral-200 tabular-nums">{binary.fileSizeBytes.toLocaleString()} bytes</span>
            </div>
            <div className="flex justify-between border-b border-neutral-800/80 pb-1">
              <span>Entry Point (CS:IP):</span>
              <span className="text-amber-300 tabular-nums">0000:0000 (File 0x{headerSizeBytes.toString(16).toUpperCase()})</span>
            </div>
            <div className="flex justify-between">
              <span>Audio Payload Offset:</span>
              <span className="text-emerald-400 tabular-nums">0x{binary.audioOffset.toString(16).toUpperCase()} ({binary.audioOffset} bytes)</span>
            </div>
          </div>
        </div>

        {/* Real-Mode Memory Segment Map */}
        <div className="lg:col-span-2 p-4 bg-neutral-900/40 border border-neutral-800 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-neutral-200 font-semibold">
              <Layers className="w-4 h-4 text-amber-400" />
              <span>MS-DOS Execution Memory Map</span>
            </div>
            <button
              onClick={onResetHeaderOverrides}
              className="flex items-center gap-1 text-[11px] text-neutral-400 hover:text-amber-300 transition-colors"
              title="Reset all header fields to auto-calculated defaults"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Recalculate Headers</span>
            </button>
          </div>

          <div className="grid grid-cols-4 gap-1 text-center text-[10px] font-mono">
            <div className="p-2 bg-purple-950/40 border border-purple-800/60">
              <div className="font-bold text-purple-300">PSP</div>
              <div className="text-purple-400/80 mt-0.5">256 bytes</div>
              <div className="text-neutral-500 mt-1">CS - 0x10</div>
            </div>
            <div className="p-2 bg-cyan-950/40 border border-cyan-800/60">
              <div className="font-bold text-cyan-300">MZ Header</div>
              <div className="text-cyan-400/80 mt-0.5">{headerSizeBytes} bytes</div>
              <div className="text-neutral-500 mt-1">File 0x00</div>
            </div>
            <div className="p-2 bg-amber-950/40 border border-amber-800/60">
              <div className="font-bold text-amber-300">x86 Code</div>
              <div className="text-amber-400/80 mt-0.5">{binary.codeSize} bytes</div>
              <div className="text-neutral-500 mt-1">CS:0000</div>
            </div>
            <div className="p-2 bg-emerald-950/40 border border-emerald-800/60">
              <div className="font-bold text-emerald-300">Audio Payload</div>
              <div className="text-emerald-400/80 mt-0.5">{binary.audioLength.toLocaleString()} B</div>
              <div className="text-neutral-500 mt-1">0x{binary.audioOffset.toString(16).toUpperCase()}</div>
            </div>
          </div>

          <p className="text-[11px] text-neutral-400 leading-relaxed">
            When MS-DOS launches this executable, the DOS EXEC service (INT 21h AH=4Bh) allocates conventional RAM,
            builds the 256-byte PSP, strips the {headerSizeBytes}-byte MZ header, reads the x86 code and embedded 8-bit
            audio payload directly into memory, initializes SS:SP and CS:IP, and transfers CPU execution to your code!
          </p>
        </div>
      </div>

      {/* Detailed MZ Header Words Table */}
      <div className="bg-neutral-900/30 border border-neutral-800 overflow-x-auto">
        <div className="px-4 py-2.5 bg-neutral-900/80 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2 text-neutral-300 font-semibold">
            <span>Standard 28-Byte MS-DOS MZ Executable Header Words</span>
            <span className="text-neutral-500">·</span>
            <span className="text-neutral-400 font-normal">14 words (28 bytes) + paragraph alignment</span>
          </div>
        </div>

        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-neutral-800 bg-neutral-950/60 text-[11px] text-neutral-400">
              <th className="py-2 px-3">Offset</th>
              <th className="py-2 px-3">Field Name</th>
              <th className="py-2 px-3">Identifier</th>
              <th className="py-2 px-4">Value (Hex / Dec)</th>
              <th className="py-2 px-4">Role & Architectural Meaning</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800/60 text-[11px]">
            {headerFields.map((field) => (
              <tr key={field.offset} className="hover:bg-neutral-800/30 transition-colors">
                <td className="py-2 px-3 text-cyan-400 tabular-nums">{field.offset}</td>
                <td className="py-2 px-3 font-semibold text-neutral-200">{field.label}</td>
                <td className="py-2 px-3 text-neutral-400">{field.name}</td>
                <td className="py-2 px-4 text-amber-300 font-mono tabular-nums">
                  {field.editable && field.key ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        className="w-24 px-1.5 py-0.5 bg-neutral-950 border border-neutral-700 text-amber-300 focus:border-amber-400 focus:outline-none"
                        value={field.inputVal}
                        onChange={(e) => {
                          const val = parseInt(e.target.value) || 0;
                          onUpdateHeaderOverride({ [field.key!]: val });
                        }}
                      />
                      <span className="text-neutral-500 text-[10px]">
                        (0x{field.inputVal?.toString(16).toUpperCase()})
                      </span>
                    </div>
                  ) : (
                    field.value
                  )}
                </td>
                <td className="py-2 px-4 text-neutral-400 max-w-md">{field.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
