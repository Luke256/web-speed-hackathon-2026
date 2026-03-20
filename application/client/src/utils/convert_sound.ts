interface Options {
  extension: string;
}

export async function convertSound(file: File, options: Options): Promise<Blob> {
  if (options.extension !== "mp3") {
    throw new Error(`Unsupported extension: ${options.extension}`);
  }

  const arrayBuffer = await file.arrayBuffer();
  const audioContext = new AudioContext();

  try {
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));

    const { Mp3Encoder } = await import("lamejs");
    const encoded = encodeAudioBufferToMp3(audioBuffer, Mp3Encoder, 128);
    const encodedBytes = Uint8Array.from(encoded);

    return new Blob([encodedBytes.buffer], { type: "audio/mpeg" });
  } finally {
    await audioContext.close();
  }
}

function encodeAudioBufferToMp3(
  audioBuffer: AudioBuffer,
  Mp3Encoder: new (channels: number, sampleRate: number, kbps: number) => {
    encodeBuffer(left: Int16Array, right?: Int16Array): Int8Array;
    flush(): Int8Array;
  },
  kbps: number,
): Uint8Array {
  const channels = Math.min(audioBuffer.numberOfChannels, 2);
  const encoder = new Mp3Encoder(channels, audioBuffer.sampleRate, kbps);
  const blockSize = 1152;

  const leftChannel = audioBuffer.getChannelData(0);
  const rightChannel = channels === 2 ? audioBuffer.getChannelData(1) : undefined;

  const chunks: Uint8Array[] = [];
  for (let index = 0; index < audioBuffer.length; index += blockSize) {
    const leftChunk = float32ToInt16(leftChannel.subarray(index, index + blockSize));

    const encodedChunk =
      channels === 2 && rightChannel
        ? encoder.encodeBuffer(leftChunk, float32ToInt16(rightChannel.subarray(index, index + blockSize)))
        : encoder.encodeBuffer(leftChunk);

    if (encodedChunk.length > 0) {
      chunks.push(new Uint8Array(encodedChunk.buffer.slice(0)));
    }
  }

  const tail = encoder.flush();
  if (tail.length > 0) {
    chunks.push(new Uint8Array(tail.buffer.slice(0)));
  }

  return mergeUint8Arrays(chunks);
}

function float32ToInt16(input: Float32Array): Int16Array {
  const output = new Int16Array(input.length);

  for (let i = 0; i < input.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, input[i]!));
    output[i] = sample < 0 ? sample * 32768 : sample * 32767;
  }

  return output;
}

function mergeUint8Arrays(chunks: Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Uint8Array(totalLength);

  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  return merged;
}
