/**
 * MS-DOS MZ Executable Builder & 16-Bit Real Mode Machine Code Synthesizer
 */

import { CompiledDosBinary, ConvertedAudioData, DosPlayerMode, MzHeader, ByteAnnotation } from '../types/dos';

/**
 * Builds an authentic, working MS-DOS MZ Executable (.EXE) embedding 8-bit audio
 */
export function buildDosExecutable(
  audio: ConvertedAudioData,
  mode: DosPlayerMode = 'pc-speaker',
  customHeaderOverrides?: Partial<MzHeader>
): CompiledDosBinary {
  const sampleRate = audio.sampleRate;
  const audioData = audio.raw8BitData;
  const audioLength = audioData.length;

  if (mode === 'com-flat') {
    return buildFlatComBinary(audio, audioLength);
  }

  // 1. Generate x86 16-bit machine code player routine
  const { codeBytes, audioOffsetInCode, stringOffset, delayCount } = generateX86PlayerCode(
    mode,
    sampleRate,
    audioLength
  );

  // 2. Calculate header and alignment
  // MZ headers are aligned to 16-byte paragraphs.
  // Standard minimum header is 2 paragraphs (32 bytes) or 4 paragraphs (64 bytes).
  // Using 4 paragraphs (64 bytes) gives standard DOS 3.0+ headroom.
  const headerParagraphs = 4;
  const headerSizeBytes = headerParagraphs * 16; // 64 bytes

  // Relocation table can follow header (e.g. at offset 0x1C or 0x40). Since we use flat tiny/small real-mode,
  // relocation count = 0, so relocation table is 0 bytes.
  const codeSizeBytes = codeBytes.length;
  
  // Total raw code + data
  const totalImageSize = codeSizeBytes + audioLength;
  const totalFileSizeBytes = headerSizeBytes + totalImageSize;

  // MZ Header calculations:
  // e_cblp: bytes on last 512-byte page
  const e_cblp = totalFileSizeBytes % 512;
  // e_cp: total 512-byte pages (rounded up)
  const e_cp = Math.ceil(totalFileSizeBytes / 512);

  const defaultHeader: MzHeader = {
    e_magic: 0x5A4D,          // 'MZ' in little-endian (0x4D, 0x5A)
    e_cblp: e_cblp === 0 && totalFileSizeBytes > 0 ? 512 : e_cblp,
    e_cp: e_cp,
    e_crlc: 0x0000,           // 0 relocations
    e_cparhdr: headerParagraphs, // 4 paragraphs = 64 bytes
    e_minalloc: 0x0010,       // 16 paragraphs = 256 bytes min stack/heap
    e_maxalloc: 0xFFFF,       // Request all available conventional memory
    e_ss: 0x0000,             // SS = CS
    e_sp: 0x0400,             // Stack pointer at 1024 bytes
    e_csum: 0x0000,           // Checksum
    e_ip: 0x0000,             // Entry point at offset 0 of code segment
    e_cs: 0x0000,             // CS = load segment
    e_lfarlc: 0x0040,         // Relocation table offset (byte 64)
    e_ovno: 0x0000,           // Main executable (not an overlay)
    reserved: [0, 0, 0, 0],
  };

  const header: MzHeader = {
    ...defaultHeader,
    ...(customHeaderOverrides || {}),
  };

  // Construct complete binary buffer
  const binary = new Uint8Array(totalFileSizeBytes);
  const view = new DataView(binary.buffer);

  // Write MZ Header (28 bytes of standard fields)
  view.setUint16(0x00, header.e_magic, true);
  view.setUint16(0x02, header.e_cblp, true);
  view.setUint16(0x04, header.e_cp, true);
  view.setUint16(0x06, header.e_crlc, true);
  view.setUint16(0x08, header.e_cparhdr, true);
  view.setUint16(0x0A, header.e_minalloc, true);
  view.setUint16(0x0C, header.e_maxalloc, true);
  view.setUint16(0x0E, header.e_ss, true);
  view.setUint16(0x10, header.e_sp, true);
  view.setUint16(0x12, header.e_csum, true);
  view.setUint16(0x14, header.e_ip, true);
  view.setUint16(0x16, header.e_cs, true);
  view.setUint16(0x18, header.e_lfarlc, true);
  view.setUint16(0x1A, header.e_ovno, true);

  // Extended OEM / padding fields up to headerSizeBytes
  for (let i = 0x1C; i < headerSizeBytes; i++) {
    binary[i] = 0x00;
  }

  // Write x86 Code
  binary.set(codeBytes, headerSizeBytes);

  // Write Audio Payload
  const finalAudioOffset = headerSizeBytes + codeSizeBytes;
  binary.set(audioData, finalAudioOffset);

  // Segment layout definitions for visual hex mapping
  const segments = [
    {
      name: 'MZ Executable Header',
      start: 0,
      end: 27,
      color: 'text-cyan-400 bg-cyan-950/40 border-cyan-700/50',
      description: 'Standard 28-byte MS-DOS MZ header (Mark Zbikowski format) containing execution registers and page counts.',
    },
    {
      name: 'Header Paragraph Alignment',
      start: 28,
      end: headerSizeBytes - 1,
      color: 'text-neutral-400 bg-neutral-900/40 border-neutral-700/50',
      description: `Zero-padding to satisfy e_cparhdr alignment (${headerParagraphs} paragraphs = ${headerSizeBytes} bytes).`,
    },
    {
      name: 'x86 Real-Mode Machine Code',
      start: headerSizeBytes,
      end: headerSizeBytes + stringOffset - 1,
      color: 'text-amber-400 bg-amber-950/40 border-amber-700/50',
      description: `16-bit 8086 machine code instructions for ${getModeLabel(mode)} playback and DOS interrupts.`,
    },
    {
      name: 'DOS Console String Banner',
      start: headerSizeBytes + stringOffset,
      end: headerSizeBytes + codeSizeBytes - 1,
      color: 'text-sky-400 bg-sky-950/40 border-sky-700/50',
      description: 'DOS $-terminated text banner printed to screen via INT 21h function AH=09h.',
    },
    {
      name: '8-bit Audio Sample Payload',
      start: finalAudioOffset,
      end: totalFileSizeBytes - 1,
      color: 'text-emerald-400 bg-emerald-950/40 border-emerald-700/50',
      description: `Raw 8-bit PCM audio samples (${audioLength} bytes @ ${sampleRate} Hz).`,
    },
  ];

  return {
    rawBytes: binary,
    header,
    headerSize: headerSizeBytes,
    codeSize: codeSizeBytes,
    audioOffset: finalAudioOffset,
    audioLength,
    fileSizeBytes: totalFileSizeBytes,
    dosMode: mode,
    segments,
  };
}

/**
 * Builds a 16-bit flat MS-DOS .COM binary (starts at ORG 100h)
 */
function buildFlatComBinary(audio: ConvertedAudioData, audioLength: number): CompiledDosBinary {
  const sampleRate = audio.sampleRate;
  const audioData = audio.raw8BitData;

  // In .COM files, the binary is loaded at CS:0100h directly.
  const { codeBytes, stringOffset } = generateX86PlayerCode('pc-speaker', sampleRate, audioLength, 0x0100);
  const totalSize = codeBytes.length + audioLength;
  const binary = new Uint8Array(totalSize);

  binary.set(codeBytes, 0);
  binary.set(audioData, codeBytes.length);

  const mockHeader: MzHeader = {
    e_magic: 0x0000,
    e_cblp: totalSize % 512,
    e_cp: Math.ceil(totalSize / 512),
    e_crlc: 0,
    e_cparhdr: 0,
    e_minalloc: 0,
    e_maxalloc: 0,
    e_ss: 0,
    e_sp: 0xFFFE,
    e_csum: 0,
    e_ip: 0x0100,
    e_cs: 0,
    e_lfarlc: 0,
    e_ovno: 0,
    reserved: [0, 0, 0, 0],
  };

  const segments = [
    {
      name: '16-bit x86 Code (ORG 100h)',
      start: 0,
      end: stringOffset - 1,
      color: 'text-amber-400 bg-amber-950/40 border-amber-700/50',
      description: '16-bit real-mode machine code for .COM flat execution model.',
    },
    {
      name: 'DOS String Message',
      start: stringOffset,
      end: codeBytes.length - 1,
      color: 'text-sky-400 bg-sky-950/40 border-sky-700/50',
      description: 'DOS $-terminated text banner printed via INT 21h AH=09h.',
    },
    {
      name: '8-bit Audio Payload',
      start: codeBytes.length,
      end: totalSize - 1,
      color: 'text-emerald-400 bg-emerald-950/40 border-emerald-700/50',
      description: `Raw 8-bit PCM audio stream (${audioLength} samples).`,
    },
  ];

  return {
    rawBytes: binary,
    header: mockHeader,
    headerSize: 0,
    codeSize: codeBytes.length,
    audioOffset: codeBytes.length,
    audioLength,
    fileSizeBytes: totalSize,
    dosMode: 'com-flat',
    segments,
  };
}

/**
 * Synthesizes valid 16-bit x86 machine code instructions tailored to each playback hardware mode
 */
function generateX86PlayerCode(
  mode: DosPlayerMode,
  sampleRate: number,
  audioLength: number,
  codeBaseOffset: number = 0
): { codeBytes: Uint8Array; audioOffsetInCode: number; stringOffset: number; delayCount: number } {
  // Approximate 8086/286 CPU loop delay count for target sample rate
  // Base 4.77MHz - 12MHz PC delay loop calibration:
  // At 11025 Hz, delay is ~10-25 loop cycles
  const delayCount = Math.max(2, Math.min(250, Math.floor(180000 / sampleRate)));

  // Banner text printed via INT 21h AH=09h
  let bannerText = '';
  switch (mode) {
    case 'pc-speaker':
      bannerText = `\r\n[MS-DOS AUDIO] PC SPEAKER PWM PLAYER\r\nRATE: ${sampleRate} HZ | BYTES: ${audioLength}\r\nPLAYING AUDIO... PRESS ANY KEY TO STOP\r\n$`;
      break;
    case 'covox-lpt1':
      bannerText = `\r\n[MS-DOS AUDIO] COVOX SPEECH THING (LPT1 0378H)\r\nRATE: ${sampleRate} HZ | BYTES: ${audioLength}\r\nSTREAMING TO DAC... PRESS ANY KEY TO STOP\r\n$`;
      break;
    case 'sound-blaster':
      bannerText = `\r\n[MS-DOS AUDIO] SOUND BLASTER DSP DIRECT 8-BIT\r\nPORT: 220H | RATE: ${sampleRate} HZ | BYTES: ${audioLength}\r\nOUTPUTTING PCM... PRESS ANY KEY TO STOP\r\n$`;
      break;
    case 'data-stub':
    default:
      bannerText = `\r\n[MS-DOS AUDIO] 8-BIT AUDIO DATA CONTAINER v1.0\r\nRATE: ${sampleRate} HZ | SAMPLES: ${audioLength}\r\nPAYLOAD ALIGNED AT END OF EXECUTABLE.\r\nRETURNING TO DOS (ERRORLEVEL 0)...\r\n$`;
      break;
  }

  const textBytes = new TextEncoder().encode(bannerText);

  // Machine instructions array
  const insns: number[] = [];

  // PUSH CS / POP DS: ensure DS = CS
  insns.push(0x0E);       // PUSH CS
  insns.push(0x1F);       // POP DS

  // Print DOS Banner:
  // MOV AH, 09h
  insns.push(0xB4, 0x09);
  // MOV DX, offset bannerText
  // Placeholder for string offset (filled after calculating code length)
  const dxOffsetPos = insns.length + 1; // index where 16-bit offset will sit
  insns.push(0xBA, 0x00, 0x00);
  // INT 21h
  insns.push(0xCD, 0x21);

  if (mode === 'data-stub') {
    // Just exit cleanly to DOS: MOV AX, 4C00h / INT 21h
    insns.push(0xB8, 0x00, 0x4C); // MOV AX, 4C00h
    insns.push(0xCD, 0x21);       // INT 21h
  } else if (mode === 'covox-lpt1') {
    // Covox LPT1 (port 0x378) loop:
    // MOV DX, 0378h (LPT1 data port)
    insns.push(0xBA, 0x78, 0x03);

    // MOV SI, offset audioPayload (placeholder)
    const siOffsetPos = insns.length + 1;
    insns.push(0xBE, 0x00, 0x00);

    // MOV CX, low 16-bits of audioLength
    const cxLen = audioLength & 0xFFFF;
    insns.push(0xB9, cxLen & 0xFF, (cxLen >> 8) & 0xFF);

    // Loop label:
    const loopStart = insns.length;
    // LODSB (load sample from DS:SI into AL and increment SI)
    insns.push(0xAC);
    // OUT DX, AL (send byte to Covox DAC at port 378h)
    insns.push(0xEE);

    // Delay loop:
    // MOV AH, delayCount
    insns.push(0xB4, delayCount & 0xFF);
    const delayLoopStart = insns.length;
    insns.push(0xFE, 0xCC); // DEC AH
    // JNZ delayLoopStart
    const delayRel = delayLoopStart - (insns.length + 2);
    insns.push(0x75, delayRel & 0xFF);

    // Check keyboard without blocking:
    // MOV AH, 01h / INT 16h
    insns.push(0xB4, 0x01);
    insns.push(0xCD, 0x16);
    // JNZ key_pressed -> exit
    // We will patch the exit jump
    const exitKeyJumpPos = insns.length;
    insns.push(0x75, 0x00); // placeholder rel8

    // LOOP loopStart (DEC CX; JNZ loopStart)
    const loopRel = loopStart - (insns.length + 2);
    insns.push(0xE2, loopRel & 0xFF);

    // Exit routine:
    const exitRoutineStart = insns.length;
    // Patch exitKeyJump
    insns[exitKeyJumpPos + 1] = (exitRoutineStart - (exitKeyJumpPos + 2)) & 0xFF;

    // Flush keyboard buffer if key was pressed:
    // MOV AH, 01h / INT 16h / JZ no_flush / MOV AH, 00h / INT 16h
    insns.push(0xB4, 0x01, 0xCD, 0x16, 0x74, 0x04, 0xB4, 0x00, 0xCD, 0x16);

    // Reset LPT port to 0:
    // XOR AL, AL / OUT DX, AL
    insns.push(0x30, 0xC0, 0xEE);

    // MOV AX, 4C00h / INT 21h (Exit to DOS)
    insns.push(0xB8, 0x00, 0x4C, 0xCD, 0x21);

    // Record SI offset placeholder
    (insns as unknown as { __siOffsetPos: number }).__siOffsetPos = siOffsetPos;
  } else if (mode === 'pc-speaker') {
    // PC Speaker Timer 2 PWM output:
    // Reprogram PIT 8253: Port 43h = control, Port 42h = Timer 2
    // MOV AL, 90h (Channel 2, LSB only, Mode 0)
    // OUT 43h, AL
    insns.push(0xB0, 0x90, 0xE6, 0x43);

    // Turn speaker on (bits 0 and 1 of port 61h):
    // IN AL, 61h / OR AL, 03h / OUT 61h, AL
    insns.push(0xE4, 0x61, 0x0C, 0x03, 0xE6, 0x61);

    // MOV SI, offset audioPayload
    const siOffsetPos = insns.length + 1;
    insns.push(0xBE, 0x00, 0x00);

    // MOV CX, count
    const cxLen = audioLength & 0xFFFF;
    insns.push(0xB9, cxLen & 0xFF, (cxLen >> 8) & 0xFF);

    // Play loop:
    const loopStart = insns.length;
    // LODSB -> AL has sample
    insns.push(0xAC);
    // Scale sample to PIT divisor (write to port 42h)
    insns.push(0xE6, 0x42);

    // Delay loop
    insns.push(0xB4, Math.max(1, delayCount >> 1));
    const delayLoopStart = insns.length;
    insns.push(0xFE, 0xCC); // DEC AH
    const delayRel = delayLoopStart - (insns.length + 2);
    insns.push(0x75, delayRel & 0xFF);

    // Check keyboard:
    insns.push(0xB4, 0x01, 0xCD, 0x16);
    const exitKeyJumpPos = insns.length;
    insns.push(0x75, 0x00); // JNZ exit

    // LOOP
    const loopRel = loopStart - (insns.length + 2);
    insns.push(0xE2, loopRel & 0xFF);

    // Exit routine:
    const exitRoutineStart = insns.length;
    insns[exitKeyJumpPos + 1] = (exitRoutineStart - (exitKeyJumpPos + 2)) & 0xFF;

    // Flush keyboard:
    insns.push(0xB4, 0x01, 0xCD, 0x16, 0x74, 0x04, 0xB4, 0x00, 0xCD, 0x16);

    // Shut off speaker:
    // IN AL, 61h / AND AL, 0FCh / OUT 61h, AL
    insns.push(0xE4, 0x61, 0x24, 0xFC, 0xE6, 0x61);

    // Restore PIT Timer 2 Mode 3:
    // MOV AL, B6h / OUT 43h, AL
    insns.push(0xB0, 0xB6, 0xE6, 0x43);

    // MOV AX, 4C00h / INT 21h
    insns.push(0xB8, 0x00, 0x4C, 0xCD, 0x21);

    (insns as unknown as { __siOffsetPos: number }).__siOffsetPos = siOffsetPos;
  } else if (mode === 'sound-blaster') {
    // Sound Blaster Direct DSP mode (Base Port 220h):
    // Reset DSP:
    // MOV DX, 0226h / MOV AL, 1 / OUT DX, AL
    insns.push(0xBA, 0x26, 0x02, 0xB0, 0x01, 0xEE);
    // Wait loops / MOV AL, 0 / OUT DX, AL
    insns.push(0x30, 0xC0, 0xEE);

    // Turn SB Speaker ON (command D1h to DSP write port 022Ch):
    // MOV DX, 022Ch / MOV AL, 0D1h / OUT DX, AL
    insns.push(0xBA, 0x2C, 0x02, 0xB0, 0xD1, 0xEE);

    // MOV SI, offset audioPayload
    const siOffsetPos = insns.length + 1;
    insns.push(0xBE, 0x00, 0x00);

    const cxLen = audioLength & 0xFFFF;
    insns.push(0xB9, cxLen & 0xFF, (cxLen >> 8) & 0xFF);

    // Main playback loop:
    const loopStart = insns.length;
    // Command 10h = Direct single-cycle 8-bit sample output
    // MOV AL, 10h / OUT DX, AL
    insns.push(0xB0, 0x10, 0xEE);
    // LODSB / OUT DX, AL
    insns.push(0xAC, 0xEE);

    // Sample rate delay:
    insns.push(0xB4, delayCount & 0xFF);
    const delayLoopStart = insns.length;
    insns.push(0xFE, 0xCC);
    const delayRel = delayLoopStart - (insns.length + 2);
    insns.push(0x75, delayRel & 0xFF);

    // Keyboard poll:
    insns.push(0xB4, 0x01, 0xCD, 0x16);
    const exitKeyJumpPos = insns.length;
    insns.push(0x75, 0x00);

    // LOOP
    const loopRel = loopStart - (insns.length + 2);
    insns.push(0xE2, loopRel & 0xFF);

    // Exit Routine:
    const exitRoutineStart = insns.length;
    insns[exitKeyJumpPos + 1] = (exitRoutineStart - (exitKeyJumpPos + 2)) & 0xFF;

    // Flush key:
    insns.push(0xB4, 0x01, 0xCD, 0x16, 0x74, 0x04, 0xB4, 0x00, 0xCD, 0x16);

    // Turn SB speaker OFF (command D3h):
    insns.push(0xB0, 0xD3, 0xEE);

    // INT 21h 4C00h exit:
    insns.push(0xB8, 0x00, 0x4C, 0xCD, 0x21);

    (insns as unknown as { __siOffsetPos: number }).__siOffsetPos = siOffsetPos;
  }

  // String offset is immediately after machine code
  const stringOffset = insns.length;
  const stringEffectiveOffset = codeBaseOffset + stringOffset;

  // Patch MOV DX, stringOffset
  insns[dxOffsetPos] = stringEffectiveOffset & 0xFF;
  insns[dxOffsetPos + 1] = (stringEffectiveOffset >> 8) & 0xFF;

  // Audio payload begins immediately after string banner
  const audioOffsetInCode = stringOffset + textBytes.length;
  const audioEffectiveOffset = codeBaseOffset + audioOffsetInCode;

  // If there was a MOV SI placeholder, patch it
  const siPos = (insns as unknown as { __siOffsetPos?: number }).__siOffsetPos;
  if (siPos !== undefined) {
    insns[siPos] = audioEffectiveOffset & 0xFF;
    insns[siPos + 1] = (audioEffectiveOffset >> 8) & 0xFF;
  }

  // Combine machine code + text banner
  const totalCodeBytes = new Uint8Array(insns.length + textBytes.length);
  totalCodeBytes.set(insns, 0);
  totalCodeBytes.set(textBytes, insns.length);

  return {
    codeBytes: totalCodeBytes,
    audioOffsetInCode,
    stringOffset,
    delayCount,
  };
}

function getModeLabel(mode: DosPlayerMode): string {
  switch (mode) {
    case 'pc-speaker': return 'PC Speaker PIT Timer 2 PWM';
    case 'covox-lpt1': return 'Covox Speech Thing LPT1 DAC (0x378)';
    case 'sound-blaster': return 'Sound Blaster DSP Direct Mode (0x22C)';
    case 'data-stub': return 'MS-DOS Audio Data Container MZ Stub';
    case 'com-flat': return '16-bit Flat COM Binary';
  }
}

/**
 * Annotates any byte offset within the compiled DOS binary for the interactive Hex Inspector
 */
export function annotateByte(offset: number, binary: CompiledDosBinary): ByteAnnotation {
  const bytes = binary.rawBytes;
  const byteVal = bytes[offset] ?? 0;
  const hex = byteVal.toString(16).padStart(2, '0').toUpperCase();
  const ascii = (byteVal >= 32 && byteVal <= 126) ? String.fromCharCode(byteVal) : '·';
  const signed = byteVal > 127 ? byteVal - 256 : byteVal;

  // Segment:Offset notation assuming CS base 0000h or header
  const segNum = Math.floor(offset / 16).toString(16).padStart(4, '0').toUpperCase();
  const segOff = (offset % 16).toString(16).padStart(4, '0').toUpperCase();
  const segment = `${segNum}:${segOff}`;

  // Find which segment this byte belongs to
  const segMatch = binary.segments.find(s => offset >= s.start && offset <= s.end);
  const segmentName = segMatch ? segMatch.name : 'Unknown';

  let fieldTitle = segmentName;
  let explanation = segMatch ? segMatch.description : '';

  // Specific MZ header byte interpretations
  if (binary.headerSize > 0 && offset < binary.headerSize) {
    if (offset === 0x00 || offset === 0x01) {
      fieldTitle = 'MZ Signature (e_magic)';
      explanation = 'Magic number 0x5A4D ("MZ" in ASCII) identifying Mark Zbikowski\'s DOS executable header.';
    } else if (offset === 0x02 || offset === 0x03) {
      fieldTitle = 'Last Page Bytes (e_cblp)';
      explanation = `Bytes on last 512-byte page of the executable file: ${binary.header.e_cblp} bytes.`;
    } else if (offset === 0x04 || offset === 0x05) {
      fieldTitle = 'Pages in File (e_cp)';
      explanation = `Total 512-byte pages in executable (including partial last page): ${binary.header.e_cp} pages (${binary.header.e_cp * 512} bytes).`;
    } else if (offset === 0x06 || offset === 0x07) {
      fieldTitle = 'Relocation Count (e_crlc)';
      explanation = `Number of pointers in the relocation table: ${binary.header.e_crlc} items.`;
    } else if (offset === 0x08 || offset === 0x09) {
      fieldTitle = 'Header Size in Paragraphs (e_cparhdr)';
      explanation = `Size of header in 16-byte units: ${binary.header.e_cparhdr} paragraphs (${binary.header.e_cparhdr * 16} bytes). Code begins immediately after.`;
    } else if (offset === 0x0A || offset === 0x0B) {
      fieldTitle = 'Min Extra Memory (e_minalloc)';
      explanation = `Minimum additional paragraphs of memory required beyond load image: 0x${binary.header.e_minalloc.toString(16)} (${binary.header.e_minalloc * 16} bytes).`;
    } else if (offset === 0x0C || offset === 0x0D) {
      fieldTitle = 'Max Extra Memory (e_maxalloc)';
      explanation = `Maximum paragraphs of memory to allocate (0xFFFF = allocate all available conventional DOS RAM).`;
    } else if (offset === 0x0E || offset === 0x0F) {
      fieldTitle = 'Stack Segment (e_ss)';
      explanation = `Initial relative SS value: 0x${binary.header.e_ss.toString(16)}. Stack segment relative to program load segment.`;
    } else if (offset === 0x10 || offset === 0x11) {
      fieldTitle = 'Stack Pointer (e_sp)';
      explanation = `Initial SP value: 0x${binary.header.e_sp.toString(16).padStart(4, '0')} (${binary.header.e_sp} bytes).`;
    } else if (offset === 0x12 || offset === 0x13) {
      fieldTitle = 'Checksum (e_csum)';
      explanation = `Executable file checksum (commonly 0x0000 in MS-DOS).`;
    } else if (offset === 0x14 || offset === 0x15) {
      fieldTitle = 'Instruction Pointer (e_ip)';
      explanation = `Initial IP entry point offset within Code Segment (CS): 0x${binary.header.e_ip.toString(16).padStart(4, '0')}. First instruction to execute.`;
    } else if (offset === 0x16 || offset === 0x17) {
      fieldTitle = 'Code Segment (e_cs)';
      explanation = `Initial relative Code Segment (CS): 0x${binary.header.e_cs.toString(16)}. Segment relative to program load segment.`;
    } else if (offset === 0x18 || offset === 0x19) {
      fieldTitle = 'Relocation Table Offset (e_lfarlc)';
      explanation = `File byte offset to first relocation item: 0x${binary.header.e_lfarlc.toString(16).padStart(4, '0')}.`;
    } else if (offset === 0x1A || offset === 0x1B) {
      fieldTitle = 'Overlay Number (e_ovno)';
      explanation = `Overlay number: 0x0000 (0 = main executable).`;
    } else {
      fieldTitle = 'Header Paragraph Padding';
      explanation = 'Alignment bytes ensuring code segment begins exactly on a 16-byte paragraph boundary.';
    }
  } else if (offset >= binary.audioOffset) {
    const sampleIndex = offset - binary.audioOffset;
    fieldTitle = `8-bit Audio Sample #${sampleIndex.toLocaleString()}`;
    const diffFromCenter = byteVal - 128;
    explanation = `Quantized 8-bit sample byte: 0x${hex} (Unsigned: ${byteVal}, Signed: ${signed}). Deviation from center: ${diffFromCenter >= 0 ? '+' : ''}${diffFromCenter}.`;
  }

  return {
    offset,
    hex,
    ascii,
    decimal: byteVal,
    signedDec: signed,
    segment,
    fieldTitle,
    explanation,
  };
}
