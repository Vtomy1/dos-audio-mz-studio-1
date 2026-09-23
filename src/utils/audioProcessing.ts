/**
 * Retro Audio Processing Engine for MS-DOS 8-Bit Conversion
 */

import { AudioConversionConfig, ConvertedAudioData } from '../types/dos';

// Global AudioContext singleton
let sharedAudioCtx: AudioContext | null = null;
export function getAudioContext(): AudioContext {
  if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    sharedAudioCtx = new AudioContextClass();
  }
  if (sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume();
  }
  return sharedAudioCtx;
}

/**
 * Decodes an ArrayBuffer or File into an AudioBuffer
 */
export async function decodeAudioFile(arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
  const ctx = getAudioContext();
  return await ctx.decodeAudioData(arrayBuffer.slice(0));
}

/**
 * Resamples and converts an AudioBuffer according to configuration
 */
export function convertAudioTo8Bit(
  audioBuffer: AudioBuffer,
  config: AudioConversionConfig,
  name: string = 'audio_sample'
): ConvertedAudioData {
  // Downmix to mono if multi-channel
  const numChannels = audioBuffer.numberOfChannels;
  const inLength = audioBuffer.length;
  const inSampleRate = audioBuffer.sampleRate;
  const monoFloat = new Float32Array(inLength);

  for (let c = 0; c < numChannels; c++) {
    const channelData = audioBuffer.getChannelData(c);
    for (let i = 0; i < inLength; i++) {
      monoFloat[i] += channelData[i] / numChannels;
    }
  }

  // Handle cropping
  const startIdx = Math.floor((config.cropStartPercent / 100) * inLength);
  const endIdx = Math.max(startIdx + 1, Math.floor((config.cropEndPercent / 100) * inLength));
  const croppedLength = endIdx - startIdx;
  const croppedFloat = monoFloat.subarray(startIdx, endIdx);

  // Apply gain and optional peak normalization
  let maxAbs = 0;
  for (let i = 0; i < croppedLength; i++) {
    const abs = Math.abs(croppedFloat[i]);
    if (abs > maxAbs) maxAbs = abs;
  }

  const normMultiplier = (config.normalize && maxAbs > 0.0001) ? (1.0 / maxAbs) : 1.0;
  const totalGain = config.gain * normMultiplier;

  // Resample to target sample rate (e.g. 11025, 8000, 22050)
  const targetRate = config.sampleRate;
  const ratio = inSampleRate / targetRate;
  const outLength = Math.max(1, Math.floor(croppedLength / ratio));
  const resampled = new Float32Array(outLength);

  for (let i = 0; i < outLength; i++) {
    const origPos = i * ratio;
    const idx0 = Math.floor(origPos);
    const idx1 = Math.min(idx0 + 1, croppedLength - 1);
    const frac = origPos - idx0;
    // Linear interpolation
    const val = croppedFloat[idx0] * (1 - frac) + croppedFloat[idx1] * frac;
    // Clamp to [-1.0, 1.0] after gain
    resampled[i] = Math.max(-1.0, Math.min(1.0, val * totalGain));
  }

  // Quantization to 8-bit bytes
  const raw8Bit = new Uint8Array(outLength);
  let minByte = 255;
  let maxByte = 0;
  let sumSquares = 0;
  let errorCarry = 0;

  for (let i = 0; i < outLength; i++) {
    let sample = resampled[i];

    // Dither computation
    if (config.dither === 'triangular') {
      const dither = (Math.random() - Math.random()) / 256.0;
      sample = Math.max(-1.0, Math.min(1.0, sample + dither));
    } else if (config.dither === 'floyd-steinberg') {
      sample = Math.max(-1.0, Math.min(1.0, sample + errorCarry * 0.5));
    }

    let byteVal = 128;

    switch (config.quantization) {
      case 'unsigned-8bit':
      case 'covox-lpt': {
        // Standard MS-DOS / Sound Blaster: 0 to 255 with 128 as silence
        const quant = Math.round((sample + 1.0) * 127.5);
        byteVal = Math.max(0, Math.min(255, quant));
        if (config.dither === 'floyd-steinberg') {
          const reconstructed = (byteVal / 127.5) - 1.0;
          errorCarry = sample - reconstructed;
        }
        break;
      }

      case 'signed-8bit': {
        // -128 to 127 (stored as uint8 two's complement)
        const quant = Math.round(sample * 127.0);
        const signedByte = Math.max(-128, Math.min(127, quant));
        byteVal = (signedByte + 256) & 0xFF;
        if (config.dither === 'floyd-steinberg') {
          const reconstructed = signedByte / 127.0;
          errorCarry = sample - reconstructed;
        }
        break;
      }

      case 'ulaw-8bit': {
        // G.711 μ-law compression (8-bit)
        byteVal = linearToUlaw(sample);
        break;
      }

      case 'pc-speaker-pwm': {
        // PC Speaker PWM counter (typically 1 to 254 for 8253 PIT divisor)
        const quant = Math.round((sample + 1.0) * 126.0) + 1;
        byteVal = Math.max(1, Math.min(254, quant));
        break;
      }
    }

    raw8Bit[i] = byteVal;
    if (byteVal < minByte) minByte = byteVal;
    if (byteVal > maxByte) maxByte = byteVal;
    sumSquares += sample * sample;
  }

  const rms = Math.sqrt(sumSquares / Math.max(1, outLength));

  return {
    originalBuffer: audioBuffer,
    raw8BitData: raw8Bit,
    sampleRate: targetRate,
    durationSeconds: outLength / targetRate,
    samplesCount: outLength,
    minByte,
    maxByte,
    rms,
    audioName: name.replace(/\.[^/.]+$/, ''),
  };
}

/**
 * Encodes linear float (-1.0 to 1.0) to 8-bit G.711 μ-law
 */
function linearToUlaw(sample: number): number {
  const BIAS = 0x84;
  const CLIP = 32635;
  let pcm = Math.round(sample * 32767);
  let sign = (pcm < 0) ? 0x80 : 0x00;
  if (pcm < 0) pcm = -pcm;
  if (pcm > CLIP) pcm = CLIP;
  pcm += BIAS;

  let exponent = 7;
  for (let expMask = 0x4000; (pcm & expMask) === 0 && exponent > 0; expMask >>= 1) {
    exponent--;
  }

  const mantissa = (pcm >> (exponent + 3)) & 0x0F;
  const ulawByte = ~(sign | (exponent << 4) | mantissa);
  return ulawByte & 0xFF;
}

/**
 * Decodes 8-bit μ-law back to float32
 */
function ulawToLinear(ulawByte: number): number {
  const BIAS = 0x84;
  const inverted = ~ulawByte & 0xFF;
  const sign = (inverted & 0x80) ? -1 : 1;
  const exponent = (inverted >> 4) & 0x07;
  const mantissa = inverted & 0x0F;
  let sample = ((mantissa << 3) + BIAS) << exponent;
  sample -= BIAS;
  return (sign * sample) / 32768.0;
}

/**
 * Reconstructs a playable AudioBuffer from the 8-bit raw data so the user
 * can accurately preview the retro sound with authentic quantization & sample rate.
 */
export function reconstruct8BitAudioBuffer(
  raw8Bit: Uint8Array,
  sampleRate: number,
  quantization: string
): AudioBuffer {
  const ctx = getAudioContext();
  const buffer = ctx.createBuffer(1, raw8Bit.length, sampleRate);
  const channelData = buffer.getChannelData(0);

  for (let i = 0; i < raw8Bit.length; i++) {
    const byte = raw8Bit[i];
    if (quantization === 'signed-8bit') {
      const signed = byte > 127 ? byte - 256 : byte;
      channelData[i] = signed / 128.0;
    } else if (quantization === 'ulaw-8bit') {
      channelData[i] = ulawToLinear(byte);
    } else if (quantization === 'pc-speaker-pwm') {
      // PWM center is ~128
      channelData[i] = (byte - 128) / 128.0;
    } else {
      // unsigned-8bit / covox
      channelData[i] = (byte - 128) / 128.0;
    }
  }

  return buffer;
}

/**
 * Generates a valid standard RIFF 8-bit Mono WAV file as a Blob/Uint8Array
 */
export function exportToWav8Bit(raw8Bit: Uint8Array, sampleRate: number, isSigned: boolean = false): Uint8Array {
  const numSamples = raw8Bit.length;
  const byteRate = sampleRate * 1; // mono 8-bit = 1 byte per sec per sample
  const blockAlign = 1;
  const dataChunkSize = numSamples;
  const totalFileSize = 36 + dataChunkSize;

  const buffer = new ArrayBuffer(44 + dataChunkSize);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  function writeString(offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  // RIFF chunk descriptor
  writeString(0, 'RIFF');
  view.setUint32(4, totalFileSize, true);
  writeString(8, 'WAVE');

  // fmt sub-chunk
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);          // Subchunk1Size for PCM (16)
  view.setUint16(20, 1, true);           // AudioFormat 1 = PCM
  view.setUint16(22, 1, true);           // NumChannels 1 = Mono
  view.setUint32(24, sampleRate, true);  // SampleRate
  view.setUint32(28, byteRate, true);    // ByteRate
  view.setUint16(32, blockAlign, true);  // BlockAlign
  view.setUint16(34, 8, true);           // BitsPerSample 8

  // data sub-chunk
  writeString(36, 'data');
  view.setUint32(40, dataChunkSize, true);

  // WAV 8-bit PCM is strictly unsigned (0-255). If our raw data was signed, convert to unsigned.
  if (isSigned) {
    for (let i = 0; i < numSamples; i++) {
      const signed = raw8Bit[i] > 127 ? raw8Bit[i] - 256 : raw8Bit[i];
      bytes[44 + i] = Math.max(0, Math.min(255, signed + 128));
    }
  } else {
    bytes.set(raw8Bit, 44);
  }

  return bytes;
}

/**
 * Built-in Synthesizers for authentic retro demo audio presets
 */
export function createRetroPresetBuffer(presetId: string): AudioBuffer {
  const ctx = getAudioContext();
  const sampleRate = 44100;

  switch (presetId) {
    case 'doom-riff': {
      // 2.2-second distorted synth guitar & bass riff (E1M1 style)
      const duration = 2.4;
      const length = Math.floor(sampleRate * duration);
      const buffer = ctx.createBuffer(1, length, sampleRate);
      const data = buffer.getChannelData(0);
      
      const bpm = 140;
      const sixteenth = 60 / bpm / 4;
      // Notes in Hz: E2=82.4, G2=98.0, Bb2=116.5, B2=123.5, D3=146.8
      const notes = [
        82.4, 82.4, 146.8, 82.4, 82.4, 130.8, 82.4, 82.4,
        123.5, 82.4, 82.4, 116.5, 123.5, 82.4, 82.4, 82.4
      ];

      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        const noteIdx = Math.floor(t / sixteenth) % notes.length;
        const freq = notes[noteIdx];
        const noteT = t % sixteenth;

        // Sawtooth wave with clipping distortion
        const saw = 2 * ((t * freq) % 1) - 1;
        const sub = Math.sin(2 * Math.PI * (freq / 2) * t);
        let raw = (saw * 0.7 + sub * 0.4);
        
        // Distortion overdrive
        raw = Math.tanh(raw * 2.5) * 0.7;

        // Drum punch on every beat
        const beatT = t % (sixteenth * 4);
        const kick = Math.sin(2 * Math.PI * Math.max(40, 150 * Math.exp(-beatT * 30)) * beatT) * Math.exp(-beatT * 12);
        
        // Envelope decay
        const env = Math.exp(-noteT * 3.5);
        data[i] = Math.max(-1.0, Math.min(1.0, raw * (0.6 + 0.4 * env) + kick * 0.4));
      }
      return buffer;
    }

    case 'sound-blaster-voice': {
      // Vintage robotic speech "VOICE: SOUND BLASTER 16 ACTIVE"
      const duration = 2.2;
      const length = Math.floor(sampleRate * duration);
      const buffer = ctx.createBuffer(1, length, sampleRate);
      const data = buffer.getChannelData(0);

      // Formant frequency synthesis simulating speech
      const formants = [
        { f1: 700, f2: 1220, f0: 110, dur: 0.35 }, // "SOU-"
        { f1: 300, f2: 870, f0: 105, dur: 0.35 },  // "-ND"
        { f1: 520, f2: 1100, f0: 118, dur: 0.4 },  // "BLAS-"
        { f1: 450, f2: 1020, f0: 98, dur: 0.4 },   // "-TER"
        { f1: 350, f2: 2100, f0: 125, dur: 0.4 },  // "SYS"
        { f1: 600, f2: 1000, f0: 88, dur: 0.3 },   // "TEM"
      ];

      let elapsed = 0;
      for (const seg of formants) {
        const segSamples = Math.floor(seg.dur * sampleRate);
        const startIdx = Math.floor(elapsed * sampleRate);
        for (let i = 0; i < segSamples && (startIdx + i) < length; i++) {
          const t = i / sampleRate;
          const buzz = (t * seg.f0) % 1 > 0.5 ? 0.3 : -0.3;
          const f1Wave = Math.sin(2 * Math.PI * seg.f1 * t) * Math.exp(-((t * seg.f0) % 1) * 8);
          const f2Wave = Math.sin(2 * Math.PI * seg.f2 * t) * Math.exp(-((t * seg.f0) % 1) * 12);
          const noise = (Math.random() - 0.5) * 0.15;
          const sample = (buzz * 0.2 + f1Wave * 0.5 + f2Wave * 0.3 + noise);
          data[startIdx + i] = Math.max(-1.0, Math.min(1.0, sample * 0.9));
        }
        elapsed += seg.dur;
      }
      return buffer;
    }

    case 'pc-speaker-arp': {
      // Rapid 8253 PIT square-wave demoscene arpeggio
      const duration = 2.0;
      const length = Math.floor(sampleRate * duration);
      const buffer = ctx.createBuffer(1, length, sampleRate);
      const data = buffer.getChannelData(0);

      const arpSpeed = 50; // 50 Hz speed arpeggios
      // C minor / Eb / G / Bb / C5
      const chords = [
        [261.6, 311.1, 392.0, 523.3],
        [233.1, 293.7, 349.2, 466.2],
        [207.7, 261.6, 311.1, 415.3],
        [196.0, 246.9, 293.7, 392.0]
      ];

      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        const chordIdx = Math.floor(t / 0.5) % chords.length;
        const chord = chords[chordIdx];
        const noteIdx = Math.floor(t * arpSpeed) % chord.length;
        const freq = chord[noteIdx];

        // Sharp pure square wave
        const sq = Math.sin(2 * Math.PI * freq * t) >= 0 ? 0.6 : -0.6;
        data[i] = sq;
      }
      return buffer;
    }

    case 'modem-handshake': {
      // Authentic V.22bis / V.32 dialup modem handshake tones
      const duration = 2.5;
      const length = Math.floor(sampleRate * duration);
      const buffer = ctx.createBuffer(1, length, sampleRate);
      const data = buffer.getChannelData(0);

      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        let s = 0;
        if (t < 0.6) {
          // 2100 Hz Answer Tone
          s = Math.sin(2 * Math.PI * 2100 * t) * 0.6;
          // Phase reversals
          if (Math.floor(t * 2.2) % 2 === 1) s = -s;
        } else if (t < 1.4) {
          // Dual frequency V.22 calling tones: 1200 Hz and 2400 Hz
          const dual = Math.sin(2 * Math.PI * 1200 * t) * 0.4 + Math.sin(2 * Math.PI * 2400 * t) * 0.3;
          s = dual;
        } else {
          // Scrambled 1's white noise burst
          const noise = (Math.random() - 0.5) * 0.7;
          const carrier = Math.sin(2 * Math.PI * 1800 * t) * 0.3;
          s = noise + carrier;
        }
        data[i] = Math.max(-1.0, Math.min(1.0, s * 0.75));
      }
      return buffer;
    }

    default: {
      // 8086 Turbo Beep & Jingle
      const duration = 1.8;
      const length = Math.floor(sampleRate * duration);
      const buffer = ctx.createBuffer(1, length, sampleRate);
      const data = buffer.getChannelData(0);

      // POST Beep at 900 Hz followed by fanfare
      const jingleNotes = [
        { f: 880, start: 0.0, end: 0.18 },  // POST Beep
        { f: 523.25, start: 0.4, end: 0.55 }, // C5
        { f: 659.25, start: 0.55, end: 0.7 }, // E5
        { f: 783.99, start: 0.7, end: 0.85 }, // G5
        { f: 1046.5, start: 0.85, end: 1.5 }, // C6
      ];

      for (const note of jingleNotes) {
        const start = Math.floor(note.start * sampleRate);
        const end = Math.floor(note.end * sampleRate);
        for (let i = start; i < end && i < length; i++) {
          const t = (i - start) / sampleRate;
          const env = Math.exp(-t * 2.5);
          const sq = (Math.sin(2 * Math.PI * note.f * t) >= 0 ? 0.6 : -0.6) * env;
          data[i] += sq;
        }
      }
      return buffer;
    }
  }
}
