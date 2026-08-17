import { IMAGE_POLICY } from '@football-lottery-analysis-lab/ocr-core';

export interface ImageHeader {
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  width: number;
  height: number;
}

export type BrowserImageFileErrorCode =
  | 'UNSUPPORTED_IMAGE_TYPE'
  | 'IMAGE_TOO_LARGE'
  | 'IMAGE_DECODE_FAILED';

const ERROR_MESSAGES: Readonly<Record<BrowserImageFileErrorCode, string>> = {
  UNSUPPORTED_IMAGE_TYPE: 'The selected image type is not supported.',
  IMAGE_TOO_LARGE: 'The selected image exceeds the allowed size.',
  IMAGE_DECODE_FAILED: 'The selected image header could not be decoded.'
};

export class BrowserImageFileError extends Error {
  readonly code: BrowserImageFileErrorCode;

  constructor(code: BrowserImageFileErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = 'BrowserImageFileError';
    this.code = code;
  }
}

const PNG_HEADER_BYTES = 29;
const WEBP_HEADER_BYTES = 30;

// JPEG permits metadata segments before SOF. A fixed 64 KiB scan accepts normal
// camera/browser files while preventing header inspection from becoming a full read.
const JPEG_MARKER_SCAN_BYTES = 64 * 1024;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

function imageError(code: BrowserImageFileErrorCode): BrowserImageFileError {
  return new BrowserImageFileError(code);
}

function readExternalValue<T>(read: () => T): T {
  try {
    return read();
  } catch {
    throw imageError('IMAGE_DECODE_FAILED');
  }
}

async function readExternalPromise<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch {
    throw imageError('IMAGE_DECODE_FAILED');
  }
}

function isAcceptedMimeType(value: unknown): value is ImageHeader['mimeType'] {
  return (
    typeof value === 'string' &&
    (IMAGE_POLICY.acceptedMimeTypes as readonly string[]).includes(value)
  );
}

function hasBytes(bytes: Uint8Array, offset: number, expected: readonly number[]): boolean {
  if (offset < 0 || offset + expected.length > bytes.length) {
    return false;
  }

  return expected.every((value, index) => bytes[offset + index] === value);
}

function readUint16BigEndian(bytes: Uint8Array, offset: number): number {
  return bytes[offset] * 0x100 + bytes[offset + 1];
}

function readUint16LittleEndian(bytes: Uint8Array, offset: number): number {
  return bytes[offset] + bytes[offset + 1] * 0x100;
}

function readUint24LittleEndian(bytes: Uint8Array, offset: number): number {
  return bytes[offset] + bytes[offset + 1] * 0x100 + bytes[offset + 2] * 0x10000;
}

function readUint32BigEndian(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] * 0x1000000 +
    bytes[offset + 1] * 0x10000 +
    bytes[offset + 2] * 0x100 +
    bytes[offset + 3]
  );
}

function readUint32LittleEndian(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] +
    bytes[offset + 1] * 0x100 +
    bytes[offset + 2] * 0x10000 +
    bytes[offset + 3] * 0x1000000
  );
}

function validateDimensions(width: number, height: number): void {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw imageError('IMAGE_DECODE_FAILED');
  }

  // Compare by division so hostile uint32 dimensions cannot overflow a product.
  if (width > IMAGE_POLICY.maxPixels || height > Math.floor(IMAGE_POLICY.maxPixels / width)) {
    throw imageError('IMAGE_TOO_LARGE');
  }
}

async function readBoundedHeader(
  file: File,
  fileSize: number,
  byteLimit: number
): Promise<Uint8Array> {
  const expectedLength = Math.min(fileSize, byteLimit);
  const headerBlob = readExternalValue(() => file.slice(0, expectedLength));

  if (headerBlob === null || typeof headerBlob !== 'object') {
    throw imageError('IMAGE_DECODE_FAILED');
  }

  const headerSize = readExternalValue(() => headerBlob.size);
  if (!Number.isSafeInteger(headerSize) || headerSize < 0) {
    throw imageError('IMAGE_DECODE_FAILED');
  }

  const buffer = await readExternalPromise(() => headerBlob.arrayBuffer());
  // DataView performs an ArrayBuffer internal-slot check without the false
  // negatives that cross-realm `instanceof ArrayBuffer` produces.
  const bufferView = readExternalValue(() => new DataView(buffer));
  if (bufferView.byteLength !== headerSize || bufferView.byteLength > byteLimit) {
    throw imageError('IMAGE_DECODE_FAILED');
  }

  return readExternalValue(() => new Uint8Array(buffer));
}

function parsePng(bytes: Uint8Array): { width: number; height: number } {
  if (
    bytes.length < PNG_HEADER_BYTES ||
    !hasBytes(bytes, 0, PNG_SIGNATURE) ||
    readUint32BigEndian(bytes, 8) !== 13 ||
    !hasBytes(bytes, 12, [0x49, 0x48, 0x44, 0x52])
  ) {
    throw imageError('IMAGE_DECODE_FAILED');
  }

  return {
    width: readUint32BigEndian(bytes, 16),
    height: readUint32BigEndian(bytes, 20)
  };
}

function isJpegSofMarker(marker: number): boolean {
  return (
    (marker >= 0xc0 && marker <= 0xc3) ||
    (marker >= 0xc5 && marker <= 0xc7) ||
    (marker >= 0xc9 && marker <= 0xcb) ||
    (marker >= 0xcd && marker <= 0xcf)
  );
}

function parseJpeg(bytes: Uint8Array): { width: number; height: number } {
  if (bytes.length < 2 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw imageError('IMAGE_DECODE_FAILED');
  }

  let cursor = 2;
  while (cursor < bytes.length) {
    if (bytes[cursor] !== 0xff) {
      throw imageError('IMAGE_DECODE_FAILED');
    }

    while (cursor < bytes.length && bytes[cursor] === 0xff) {
      cursor += 1;
    }
    if (cursor >= bytes.length) {
      break;
    }

    const marker = bytes[cursor];
    cursor += 1;

    if (
      marker === 0x00 ||
      marker === 0x01 ||
      marker === 0xd8 ||
      marker === 0xd9 ||
      marker === 0xda ||
      (marker >= 0xd0 && marker <= 0xd7)
    ) {
      throw imageError('IMAGE_DECODE_FAILED');
    }
    if (cursor + 1 >= bytes.length) {
      throw imageError('IMAGE_DECODE_FAILED');
    }

    const segmentLength = readUint16BigEndian(bytes, cursor);
    if (segmentLength < 2) {
      throw imageError('IMAGE_DECODE_FAILED');
    }

    const segmentEnd = cursor + segmentLength;
    if (segmentEnd > bytes.length) {
      throw imageError('IMAGE_DECODE_FAILED');
    }

    if (isJpegSofMarker(marker)) {
      if (segmentLength < 8) {
        throw imageError('IMAGE_DECODE_FAILED');
      }

      const componentCount = bytes[cursor + 7];
      if (componentCount < 1 || segmentLength !== 8 + 3 * componentCount) {
        throw imageError('IMAGE_DECODE_FAILED');
      }

      return {
        height: readUint16BigEndian(bytes, cursor + 3),
        width: readUint16BigEndian(bytes, cursor + 5)
      };
    }

    cursor = segmentEnd;
  }

  throw imageError('IMAGE_DECODE_FAILED');
}

function parseWebp(bytes: Uint8Array, fileSize: number): { width: number; height: number } {
  if (
    fileSize < 20 ||
    bytes.length < 20 ||
    !hasBytes(bytes, 0, [0x52, 0x49, 0x46, 0x46]) ||
    !hasBytes(bytes, 8, [0x57, 0x45, 0x42, 0x50]) ||
    readUint32LittleEndian(bytes, 4) !== fileSize - 8
  ) {
    throw imageError('IMAGE_DECODE_FAILED');
  }

  const chunkLength = readUint32LittleEndian(bytes, 16);
  const paddedChunkLength = chunkLength + (chunkLength & 1);
  if (20 + paddedChunkLength > fileSize) {
    throw imageError('IMAGE_DECODE_FAILED');
  }

  if (hasBytes(bytes, 12, [0x56, 0x50, 0x38, 0x20])) {
    if (
      chunkLength < 10 ||
      bytes.length < 30 ||
      (bytes[20] & 0x01) !== 0 ||
      !hasBytes(bytes, 23, [0x9d, 0x01, 0x2a])
    ) {
      throw imageError('IMAGE_DECODE_FAILED');
    }

    return {
      width: readUint16LittleEndian(bytes, 26) & 0x3fff,
      height: readUint16LittleEndian(bytes, 28) & 0x3fff
    };
  }

  if (hasBytes(bytes, 12, [0x56, 0x50, 0x38, 0x4c])) {
    if (
      chunkLength < 5 ||
      bytes.length < 25 ||
      bytes[20] !== 0x2f ||
      (bytes[24] & 0xe0) !== 0
    ) {
      throw imageError('IMAGE_DECODE_FAILED');
    }

    return {
      width: 1 + bytes[21] + ((bytes[22] & 0x3f) << 8),
      height: 1 + (bytes[22] >> 6) + (bytes[23] << 2) + ((bytes[24] & 0x0f) << 10)
    };
  }

  if (hasBytes(bytes, 12, [0x56, 0x50, 0x38, 0x58])) {
    if (
      chunkLength < 10 ||
      bytes.length < 30 ||
      (bytes[20] & 0xc1) !== 0 ||
      bytes[21] !== 0 ||
      bytes[22] !== 0 ||
      bytes[23] !== 0
    ) {
      throw imageError('IMAGE_DECODE_FAILED');
    }

    return {
      width: readUint24LittleEndian(bytes, 24) + 1,
      height: readUint24LittleEndian(bytes, 27) + 1
    };
  }

  throw imageError('IMAGE_DECODE_FAILED');
}

export async function inspectImageFileHeader(file: File): Promise<ImageHeader> {
  if (file === null || (typeof file !== 'object' && typeof file !== 'function')) {
    throw imageError('IMAGE_DECODE_FAILED');
  }

  // Keep both policy checks synchronous and ahead of every byte slice.
  const fileSize = readExternalValue(() => file.size);
  const mimeType = readExternalValue(() => file.type);
  if (!Number.isSafeInteger(fileSize) || fileSize < 0) {
    throw imageError('IMAGE_DECODE_FAILED');
  }
  if (fileSize > IMAGE_POLICY.maxBytes) {
    throw imageError('IMAGE_TOO_LARGE');
  }
  if (!isAcceptedMimeType(mimeType)) {
    throw imageError('UNSUPPORTED_IMAGE_TYPE');
  }

  let dimensions: { width: number; height: number };
  if (mimeType === 'image/png') {
    dimensions = parsePng(await readBoundedHeader(file, fileSize, PNG_HEADER_BYTES));
  } else if (mimeType === 'image/jpeg') {
    dimensions = parseJpeg(await readBoundedHeader(file, fileSize, JPEG_MARKER_SCAN_BYTES));
  } else {
    dimensions = parseWebp(await readBoundedHeader(file, fileSize, WEBP_HEADER_BYTES), fileSize);
  }

  validateDimensions(dimensions.width, dimensions.height);
  return Object.freeze({ mimeType, ...dimensions });
}

export function assertDecodedImageMatchesHeader(
  header: ImageHeader,
  decoded: { width: number; height: number }
): void {
  const mimeType = readExternalValue(() => header.mimeType);
  const headerWidth = readExternalValue(() => header.width);
  const headerHeight = readExternalValue(() => header.height);
  const decodedWidth = readExternalValue(() => decoded.width);
  const decodedHeight = readExternalValue(() => decoded.height);

  if (!isAcceptedMimeType(mimeType)) {
    throw imageError('IMAGE_DECODE_FAILED');
  }

  validateDimensions(headerWidth, headerHeight);
  validateDimensions(decodedWidth, decodedHeight);
  if (decodedWidth !== headerWidth || decodedHeight !== headerHeight) {
    throw imageError('IMAGE_DECODE_FAILED');
  }
}
