import { dump, ImageIFD, insert, load } from "piexifjs";

export const MagickFormat = {
  Jpg: "jpg",
  Png: "png",
  WebP: "webp",
} as const;

export type MagickFormat = (typeof MagickFormat)[keyof typeof MagickFormat];

interface Options {
  extension: MagickFormat;
}

function toBinary(bytes: Uint8Array<ArrayBuffer>): string {
  return Array.from(bytes)
    .map((b) => String.fromCharCode(b))
    .join("");
}

function fromBinary(binary: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(binary.split("").map((c) => c.charCodeAt(0)));
}

function extensionToMimeType(extension: MagickFormat): string {
  switch (extension) {
    case MagickFormat.Jpg:
      return "image/jpeg";
    case MagickFormat.Png:
      return "image/png";
    case MagickFormat.WebP:
      return "image/webp";
    default:
      return "image/jpeg";
  }
}

function readImageDescription(binary: string): string | undefined {
  try {
    const exif = load(binary) as { "0th"?: Record<number, unknown> };
    const description = exif["0th"]?.[ImageIFD.ImageDescription];

    if (typeof description !== "string" || description.length === 0) {
      return undefined;
    }

    return description;
  } catch {
    return undefined;
  }
}

async function drawToBlob(file: File, mimeType: string): Promise<Blob> {
  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = objectUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext("2d");

    if (ctx == null) {
      throw new Error("Failed to create canvas context");
    }

    ctx.drawImage(image, 0, 0);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob == null) {
            reject(new Error("Failed to convert image"));
            return;
          }

          resolve(blob);
        },
        mimeType,
      );
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function convertImage(file: File, options: Options): Promise<Blob> {
  const sourceBytes = new Uint8Array(await file.arrayBuffer()) as Uint8Array<ArrayBuffer>;
  const sourceBinary = toBinary(sourceBytes);
  const description = readImageDescription(sourceBinary);

  const mimeType = extensionToMimeType(options.extension);
  const convertedBlob = await drawToBlob(file, mimeType);
  const convertedBytes = new Uint8Array(await convertedBlob.arrayBuffer()) as Uint8Array<ArrayBuffer>;

  if (description == null || mimeType !== "image/jpeg") {
    return new Blob([convertedBytes], { type: mimeType });
  }

  const descriptionBinary = toBinary(new TextEncoder().encode(description) as Uint8Array<ArrayBuffer>);
  const exifStr = dump({ "0th": { [ImageIFD.ImageDescription]: descriptionBinary } });
  const outputWithExif = insert(exifStr, toBinary(convertedBytes));
  const outputBytes = fromBinary(outputWithExif);
  return new Blob([outputBytes], { type: mimeType });
}
