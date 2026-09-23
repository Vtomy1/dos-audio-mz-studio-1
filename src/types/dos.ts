/**
 * MS-DOS MZ Executable and 8-bit Audio Types
 */

export interface MzHeader {
  e_magic: number;      // 0x5A4D ('MZ') or 0x454E ('ZM')
  e_cblp: number;       // Bytes on last page of file (0..511)
  e_cp: number;         // Total pages in file (512 bytes each)
  e_crlc: number;       // Number of relocation items
  e_cparhdr: number;    // Size of header in 16-byte paragraphs
  e_minalloc: number;   // Minimum extra paragraphs needed
  e_maxalloc: number;   // Maximum extra paragraphs needed (0xFFFF)
  e_ss: number;         // Initial (relative) SS value
  e_sp: number;         // Initial SP value (stack pointer)
  e_csum: number;       // Checksum (usually 0x0000)
  e_ip: number;         // Initial IP value (entry point offset)
  e_cs: number;         // Initial (relative) CS value
  e_lfarlc: number;     // File address of relocation table
  e_ovno: number;       // Overlay number (0 for main program)
  reserved: number[];   // Reserved words
}

export type QuantizationMode = 
  | 'unsigned-8bit'    // Standard MS-DOS / Sound Blaster: 0 to 255 (center 128)
  | 'signed-8bit'      // Amiga / Tracker: -128 to 127 (center 0)
  | 'ulaw-8bit'        // CCITT G.711 μ-law logarithmic
  | 'pc-speaker-pwm'   // 1-bit / PWM audio for IBM PC Speaker PIT 8253
  | 'covox-lpt';       // 8-bit DAC via Parallel Printer Port (0x378)

export type DitherType = 'none' | 'triangular' | 'floyd-steinberg';

export type TargetSampleRate = 4000 | 8000 | 11025 | 16000 | 22050 | 44100;

export type DosPlayerMode = 
  | 'pc-speaker'       // Modulates PIT Timer 2 (ports 42h/43h/61h) for audio output
  | 'covox-lpt1'       // Dumps 8-bit PCM directly to LPT1 port 0x378
  | 'sound-blaster'    // Sound Blaster DSP Direct Mode (port 0x22C command 0x10)
  | 'data-stub'        // Minimal MS-DOS banner + INT 21h AH=4Ch exit with raw audio payload
  | 'com-flat';        // Flat 16-bit .COM file (starts at 0x100)

export interface AudioConversionConfig {
  sampleRate: TargetSampleRate;
  quantization: QuantizationMode;
  dither: DitherType;
  normalize: boolean;
  gain: number;         // 0.1 to 3.0 (default 1.0)
  cropStartPercent: number;
  cropEndPercent: number;
  dosPlayer: DosPlayerMode;
}

export interface ConvertedAudioData {
  originalBuffer: AudioBuffer | null;
  raw8BitData: Uint8Array;
  sampleRate: number;
  durationSeconds: number;
  samplesCount: number;
  minByte: number;
  maxByte: number;
  rms: number;
  audioName: string;
}

export interface CompiledDosBinary {
  rawBytes: Uint8Array;
  header: MzHeader;
  headerSize: number;
  codeSize: number;
  audioOffset: number;
  audioLength: number;
  fileSizeBytes: number;
  dosMode: DosPlayerMode;
  segments: {
    name: string;
    start: number;
    end: number;
    color: string;
    description: string;
  }[];
}

export interface ByteAnnotation {
  offset: number;
  hex: string;
  ascii: string;
  decimal: number;
  signedDec: number;
  segment: string;
  fieldTitle: string;
  explanation: string;
}
