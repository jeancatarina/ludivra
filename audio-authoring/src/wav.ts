import { clamp, roundHalfAwayFromZero } from "./deterministic-math.js";

/**
 * Canonical WAV writer: 16-bit PCM, little endian, no metadata chunk. No
 * timestamp, no encoder name and no locale enters the file, so the same recipe
 * produces the same bytes on any machine.
 */
export function writeWav(channels: Float64Array[], sampleRate: number): Uint8Array {
  const channelCount = channels.length;
  const frames = channels[0]?.length ?? 0;
  const bytesPerSample = 2;
  const dataBytes = frames * channelCount * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);

  const ascii = (offset: number, text: string): void => {
    for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index));
  };

  ascii(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channelCount * bytesPerSample, true);
  view.setUint16(32, channelCount * bytesPerSample, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, dataBytes, true);

  let offset = 44;
  for (let frame = 0; frame < frames; frame += 1) {
    for (let channel = 0; channel < channelCount; channel += 1) {
      const sample = clamp(channels[channel]?.[frame] ?? 0, -1, 1);
      // Asymmetric range of 16-bit PCM: scaling by 32767 keeps +1 representable.
      const quantized = clamp(roundHalfAwayFromZero(sample * 32767), -32768, 32767);
      view.setInt16(offset, quantized, true);
      offset += 2;
    }
  }
  return new Uint8Array(buffer);
}
