import { IMAGE_POLICY } from '@football-lottery-analysis-lab/ocr-core';
import { describe, expect, it, vi } from 'vitest';

import {
  assertDecodedImageMatchesHeader,
  BrowserImageFileError,
  inspectImageFileHeader,
  type BrowserImageFileErrorCode,
  type ImageHeader
} from './browserImageFile';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const JPEG_SCAN_LIMIT = 64 * 1024;

class ReadableTestFile extends File {
  private readonly sourceBytes: Uint8Array;

  constructor(bytes: Uint8Array, type: string) {
    const sourceBytes = Uint8Array.from(bytes);
    super([sourceBytes.buffer as ArrayBuffer], 'must-not-be-read.png', { type });
    this.sourceBytes = sourceBytes;
  }

  override slice(start = 0, end = this.size, contentType = ''): Blob {
    const blob = super.slice(start, end, contentType);
    const selectedBytes = this.sourceBytes.slice(start, end);
    Object.defineProperty(blob, 'arrayBuffer', {
      configurable: true,
      value: async () => selectedBytes.buffer as ArrayBuffer
    });
    return blob;
  }
}

function ascii(value: string): number[] {
  return [...value].map((character) => character.charCodeAt(0));
}

function concatBytes(...parts: readonly (readonly number[] | Uint8Array)[]): Uint8Array {
  const size = parts.reduce((total, part) => total + part.length, 0);
  const result = new Uint8Array(size);
  let offset = 0;

  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }

  return result;
}

function writeUint32BigEndian(target: Uint8Array, offset: number, value: number): void {
  target[offset] = Math.floor(value / 0x1000000) & 0xff;
  target[offset + 1] = Math.floor(value / 0x10000) & 0xff;
  target[offset + 2] = Math.floor(value / 0x100) & 0xff;
  target[offset + 3] = value & 0xff;
}

function writeUint32LittleEndian(target: Uint8Array, offset: number, value: number): void {
  target[offset] = value & 0xff;
  target[offset + 1] = Math.floor(value / 0x100) & 0xff;
  target[offset + 2] = Math.floor(value / 0x10000) & 0xff;
  target[offset + 3] = Math.floor(value / 0x1000000) & 0xff;
}

function writeUint24LittleEndian(target: Uint8Array, offset: number, value: number): void {
  target[offset] = value & 0xff;
  target[offset + 1] = Math.floor(value / 0x100) & 0xff;
  target[offset + 2] = Math.floor(value / 0x10000) & 0xff;
}

function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(29);
  bytes.set(PNG_SIGNATURE, 0);
  writeUint32BigEndian(bytes, 8, 13);
  bytes.set(ascii('IHDR'), 12);
  writeUint32BigEndian(bytes, 16, width);
  writeUint32BigEndian(bytes, 20, height);
  bytes.set([8, 2, 0, 0, 0], 24);
  return bytes;
}

function jpegSegment(marker: number, payload: readonly number[]): Uint8Array {
  const length = payload.length + 2;
  return Uint8Array.from([0xff, marker, length >> 8, length & 0xff, ...payload]);
}

function jpeg(width: number, height: number, sofMarker: 0xc0 | 0xc2): Uint8Array {
  return concatBytes(
    [0xff, 0xd8],
    jpegSegment(0xe0, [0x4a, 0x46]),
    jpegSegment(0xfe, ascii('note')),
    [0xff, 0xff],
    jpegSegment(sofMarker, [
      8,
      height >> 8,
      height & 0xff,
      width >> 8,
      width & 0xff,
      1,
      1,
      0x11,
      0
    ])
  );
}

function webpContainer(
  chunkType: string,
  payload: Uint8Array,
  overrides: { riffSize?: number; chunkLength?: number; webpFourcc?: string } = {}
): Uint8Array {
  const paddedLength = payload.length + (payload.length & 1);
  const bytes = new Uint8Array(20 + paddedLength);
  bytes.set(ascii('RIFF'), 0);
  writeUint32LittleEndian(bytes, 4, overrides.riffSize ?? bytes.length - 8);
  bytes.set(ascii(overrides.webpFourcc ?? 'WEBP'), 8);
  bytes.set(ascii(chunkType), 12);
  writeUint32LittleEndian(bytes, 16, overrides.chunkLength ?? payload.length);
  bytes.set(payload, 20);
  return bytes;
}

function webpVp8(width: number, height: number): Uint8Array {
  const payload = new Uint8Array(10);
  payload.set([0x10, 0, 0, 0x9d, 0x01, 0x2a], 0);
  payload[6] = width & 0xff;
  payload[7] = (width >> 8) & 0x3f;
  payload[8] = height & 0xff;
  payload[9] = (height >> 8) & 0x3f;
  return webpContainer('VP8 ', payload);
}

function webpVp8l(width: number, height: number): Uint8Array {
  const encodedWidth = width - 1;
  const encodedHeight = height - 1;
  const payload = Uint8Array.from([
    0x2f,
    encodedWidth & 0xff,
    ((encodedWidth >> 8) & 0x3f) | ((encodedHeight & 0x03) << 6),
    (encodedHeight >> 2) & 0xff,
    (encodedHeight >> 10) & 0x0f
  ]);
  return webpContainer('VP8L', payload);
}

function webpVp8x(width: number, height: number): Uint8Array {
  const payload = new Uint8Array(10);
  writeUint24LittleEndian(payload, 4, width - 1);
  writeUint24LittleEndian(payload, 7, height - 1);
  return webpContainer('VP8X', payload);
}

function imageFile(bytes: Uint8Array, type: string): File {
  return new ReadableTestFile(bytes, type);
}

async function expectImageError(
  action: Promise<unknown> | (() => unknown),
  code: BrowserImageFileErrorCode
): Promise<BrowserImageFileError> {
  let error: unknown;

  try {
    if (typeof action === 'function') {
      action();
    } else {
      await action;
    }
  } catch (caught) {
    error = caught;
  }

  expect(error).toBeInstanceOf(BrowserImageFileError);
  expect(error).toMatchObject({ code });
  return error as BrowserImageFileError;
}

describe('inspectImageFileHeader', () => {
  it('reads PNG signature and first IHDR dimensions', async () => {
    await expect(inspectImageFileHeader(imageFile(png(1440, 1000), 'image/png'))).resolves.toEqual({
      mimeType: 'image/png',
      width: 1440,
      height: 1000
    });
  });

  it('skips JPEG APP, COM, fill, and standalone markers before baseline SOF', async () => {
    await expect(inspectImageFileHeader(imageFile(jpeg(1920, 1080, 0xc0), 'image/jpeg'))).resolves.toEqual({
      mimeType: 'image/jpeg',
      width: 1920,
      height: 1080
    });
  });

  it('reads progressive JPEG SOF dimensions', async () => {
    await expect(inspectImageFileHeader(imageFile(jpeg(800, 600, 0xc2), 'image/jpeg'))).resolves.toEqual({
      mimeType: 'image/jpeg',
      width: 800,
      height: 600
    });
  });

  it.each([
    ['VP8', webpVp8(640, 360)],
    ['VP8L', webpVp8l(1024, 768)],
    ['VP8X', webpVp8x(4096, 2048)]
  ])('reads WebP %s dimensions', async (_variant, bytes) => {
    const header = await inspectImageFileHeader(imageFile(bytes, 'image/webp'));
    expect(header).toEqual({
      mimeType: 'image/webp',
      width: _variant === 'VP8' ? 640 : _variant === 'VP8L' ? 1024 : 4096,
      height: _variant === 'VP8' ? 360 : _variant === 'VP8L' ? 768 : 2048
    });
  });

  it.each([
    ['image/png', jpeg(320, 200, 0xc0)],
    ['image/jpeg', webpVp8(320, 200)],
    ['image/webp', png(320, 200)]
  ])('rejects %s when the declared MIME does not match the container', async (type, bytes) => {
    await expectImageError(inspectImageFileHeader(imageFile(bytes, type)), 'IMAGE_DECODE_FAILED');
  });

  it.each(['', 'application/octet-stream', 'image/gif', 'image/svg+xml', 'image/heic']) (
    'rejects an unsupported declared MIME type %j before reading',
    async (type) => {
      const file = imageFile(png(10, 10), type);
      const slice = vi.spyOn(file, 'slice');

      await expectImageError(inspectImageFileHeader(file), 'UNSUPPORTED_IMAGE_TYPE');
      expect(slice).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['GIF', concatBytes(ascii('GIF89a'), new Uint8Array(24))],
    ['SVG', concatBytes(ascii('<svg xmlns="http://www.w3.org/2000/svg">'), new Uint8Array(8))],
    ['PDF', concatBytes(ascii('%PDF-1.7'), new Uint8Array(24))],
    ['HEIC', concatBytes([0, 0, 0, 24], ascii('ftypheic'), new Uint8Array(20))]
  ])('rejects misdeclared %s magic as an undecodable PNG', async (_label, bytes) => {
    await expectImageError(
      inspectImageFileHeader(imageFile(bytes, 'image/png')),
      'IMAGE_DECODE_FAILED'
    );
  });

  it.each([
    ['truncated signature', Uint8Array.from(PNG_SIGNATURE.slice(0, 7))],
    ['wrong IHDR length', (() => {
      const bytes = png(10, 10);
      writeUint32BigEndian(bytes, 8, 12);
      return bytes;
    })()],
    ['non-first IHDR', (() => {
      const bytes = png(10, 10);
      bytes.set(ascii('IDAT'), 12);
      return bytes;
    })()],
    ['truncated IHDR data', png(10, 10).slice(0, 23)]
  ])('rejects PNG with %s', async (_label, bytes) => {
    await expectImageError(
      inspectImageFileHeader(imageFile(bytes, 'image/png')),
      'IMAGE_DECODE_FAILED'
    );
  });

  it.each([
    ['truncated SOI', Uint8Array.from([0xff])],
    ['truncated marker length', Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00])],
    ['marker length below two', Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x01])],
    ['truncated SOF', concatBytes([0xff, 0xd8], [0xff, 0xc0, 0x00, 0x0b, 8, 0, 1])],
    ['SOS before SOF', concatBytes([0xff, 0xd8], jpegSegment(0xda, [1, 1, 0, 0, 0, 0]))]
  ])('rejects JPEG with %s', async (_label, bytes) => {
    await expectImageError(
      inspectImageFileHeader(imageFile(bytes, 'image/jpeg')),
      'IMAGE_DECODE_FAILED'
    );
  });

  it.each([
    ['bad RIFF signature', (() => {
      const bytes = webpVp8(2, 2);
      bytes[0] = 0;
      return bytes;
    })()],
    ['bad RIFF size', webpContainer('VP8 ', webpVp8(2, 2).slice(20), { riffSize: 1 })],
    ['bad WEBP fourcc', webpContainer('VP8 ', webpVp8(2, 2).slice(20), { webpFourcc: 'WEPB' })],
    ['unknown first chunk', webpContainer('JUNK', new Uint8Array(10))],
    ['short first chunk', webpContainer('VP8X', new Uint8Array(9))],
    ['chunk length beyond RIFF', webpContainer('VP8X', new Uint8Array(10), { chunkLength: 100 })],
    ['bad VP8 signature', (() => {
      const bytes = webpVp8(100, 100);
      bytes[23] = 0;
      return bytes;
    })()],
    ['bad VP8L signature', (() => {
      const bytes = webpVp8l(100, 100);
      bytes[20] = 0;
      return bytes;
    })()],
    ['bad VP8L version bits', (() => {
      const bytes = webpVp8l(100, 100);
      bytes[24] |= 0x20;
      return bytes;
    })()],
    ['reserved VP8X feature bits', (() => {
      const bytes = webpVp8x(100, 100);
      bytes[20] = 0x80;
      return bytes;
    })()],
    ['truncated VP8X dimensions', webpVp8x(100, 100).slice(0, 29)]
  ])('rejects WebP with %s', async (_label, bytes) => {
    await expectImageError(
      inspectImageFileHeader(imageFile(bytes, 'image/webp')),
      'IMAGE_DECODE_FAILED'
    );
  });

  it('accepts a file exactly at the byte limit without reading the full file', async () => {
    const header = png(25_000_000, 1);
    const bytes = new Uint8Array(IMAGE_POLICY.maxBytes);
    bytes.set(header);
    const file = imageFile(bytes, 'image/png');
    const slice = vi.spyOn(file, 'slice');

    await expect(inspectImageFileHeader(file)).resolves.toEqual({
      mimeType: 'image/png',
      width: 25_000_000,
      height: 1
    });
    expect(file.size).toBe(IMAGE_POLICY.maxBytes);
    expect(slice).toHaveBeenCalledTimes(1);
    expect(slice.mock.results[0]?.value.size).toBe(29);
  });

  it('rejects one byte over the byte limit before any slice', async () => {
    const file = imageFile(png(1, 1), 'image/png');
    Object.defineProperty(file, 'size', { configurable: true, value: IMAGE_POLICY.maxBytes + 1 });
    const slice = vi.spyOn(file, 'slice');

    await expectImageError(inspectImageFileHeader(file), 'IMAGE_TOO_LARGE');
    expect(slice).not.toHaveBeenCalled();
  });

  it('accepts exactly 25,000,000 pixels and rejects exactly one pixel over', async () => {
    await expect(inspectImageFileHeader(imageFile(png(5000, 5000), 'image/png'))).resolves.toEqual({
      mimeType: 'image/png',
      width: 5000,
      height: 5000
    });
    await expectImageError(
      inspectImageFileHeader(imageFile(png(25_000_001, 1), 'image/png')),
      'IMAGE_TOO_LARGE'
    );
  });

  it.each([
    ['zero width', 0, 10, 'IMAGE_DECODE_FAILED'],
    ['zero height', 10, 0, 'IMAGE_DECODE_FAILED'],
    ['uint32 product overflow', 0xffffffff, 0xffffffff, 'IMAGE_TOO_LARGE']
  ] as const)('rejects PNG %s safely', async (_label, width, height, code) => {
    await expectImageError(inspectImageFileHeader(imageFile(png(width, height), 'image/png')), code);
  });

  it('does not read File.name, text, whole-file bytes, or create an Object URL', async () => {
    const file = imageFile(png(32, 24), 'image/png');
    const text = vi.fn(() => Promise.reject(new Error('text must not be read')));
    const arrayBuffer = vi.fn(() => Promise.reject(new Error('whole file must not be read')));
    const createObjectURL = vi.fn();
    const originalCreateObjectURL = URL.createObjectURL;

    Object.defineProperty(file, 'name', {
      configurable: true,
      get: () => {
        throw new Error('secret-file-name.png');
      }
    });
    Object.defineProperty(file, 'text', { configurable: true, value: text });
    Object.defineProperty(file, 'arrayBuffer', { configurable: true, value: arrayBuffer });
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });

    try {
      await expect(inspectImageFileHeader(file)).resolves.toEqual({
        mimeType: 'image/png',
        width: 32,
        height: 24
      });
      expect(text).not.toHaveBeenCalled();
      expect(arrayBuffer).not.toHaveBeenCalled();
      expect(createObjectURL).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(URL, 'createObjectURL', {
        configurable: true,
        value: originalCreateObjectURL
      });
    }
  });

  it('uses one bounded slice and one slice arrayBuffer read per supported parser', async () => {
    const cases = [
      { file: imageFile(png(40, 30), 'image/png'), maxRead: 29 },
      { file: imageFile(jpeg(40, 30, 0xc0), 'image/jpeg'), maxRead: JPEG_SCAN_LIMIT },
      { file: imageFile(webpVp8x(40, 30), 'image/webp'), maxRead: 30 }
    ];

    for (const { file, maxRead } of cases) {
      const originalSlice = file.slice.bind(file);
      const readSizes: number[] = [];
      const arrayBufferReads = vi.fn();
      Object.defineProperty(file, 'slice', {
        configurable: true,
        value: vi.fn((start?: number, end?: number, contentType?: string) => {
          const part = originalSlice(start, end, contentType);
          const originalArrayBuffer = part.arrayBuffer.bind(part);
          Object.defineProperty(part, 'arrayBuffer', {
            configurable: true,
            value: async () => {
              arrayBufferReads();
              readSizes.push(part.size);
              return originalArrayBuffer();
            }
          });
          return part;
        })
      });

      await inspectImageFileHeader(file);

      expect(file.slice).toHaveBeenCalledTimes(1);
      expect(arrayBufferReads).toHaveBeenCalledTimes(1);
      expect(readSizes).toHaveLength(1);
      expect(readSizes[0]).toBeLessThanOrEqual(maxRead);
      expect(readSizes[0]).toBeLessThan(file.size + 1);
    }
  });

  it('wraps slice and read failures without retaining external details', async () => {
    const sliceFailure = imageFile(png(1, 1), 'image/png');
    Object.defineProperty(sliceFailure, 'slice', {
      configurable: true,
      value: () => {
        throw new Error('private-path/secret-file-name.png');
      }
    });
    const sliceError = await expectImageError(
      inspectImageFileHeader(sliceFailure),
      'IMAGE_DECODE_FAILED'
    );
    expect(sliceError.message).not.toContain('secret-file-name');

    const readFailure = imageFile(png(1, 1), 'image/png');
    Object.defineProperty(readFailure, 'slice', {
      configurable: true,
      value: () => {
        const part = new Blob([png(1, 1).buffer as ArrayBuffer]);
        Object.defineProperty(part, 'arrayBuffer', {
          configurable: true,
          value: () => Promise.reject(new Error('private bytes'))
        });
        return part;
      }
    });
    const readError = await expectImageError(
      inspectImageFileHeader(readFailure),
      'IMAGE_DECODE_FAILED'
    );
    expect(readError.message).not.toContain('private bytes');
  });

  it('rejects non-Blob input with a stable error', async () => {
    const error = await expectImageError(
      inspectImageFileHeader(null as unknown as File),
      'IMAGE_DECODE_FAILED'
    );
    expect(error.message).not.toContain('null');
  });

  describe('review regressions', () => {
    it('wraps an external Proxy error whose prototype lookup throws', async () => {
      const file = imageFile(png(1, 1), 'image/png');
      const hostileError = new Proxy(Object.create(null) as object, {
        getPrototypeOf: () => {
          throw new Error('prototype trap escaped');
        }
      });
      Object.defineProperty(file, 'slice', {
        configurable: true,
        value: () => {
          throw hostileError;
        }
      });

      const error = await expectImageError(
        inspectImageFileHeader(file),
        'IMAGE_DECODE_FAILED'
      );
      expect(error.message).toBe(new BrowserImageFileError('IMAGE_DECODE_FAILED').message);
    });

    it.each(['slice', 'arrayBuffer'] as const)(
      'does not trust a BrowserImageFileError thrown by external %s I/O',
      async (boundary) => {
        const file = imageFile(png(1, 1), 'image/png');
        const forgedError = new BrowserImageFileError('IMAGE_TOO_LARGE');
        forgedError.message = 'private forged external error';

        Object.defineProperty(file, 'slice', {
          configurable: true,
          value: () => {
            if (boundary === 'slice') {
              throw forgedError;
            }
            const part = new Blob([png(1, 1).buffer as ArrayBuffer]);
            Object.defineProperty(part, 'arrayBuffer', {
              configurable: true,
              value: () => Promise.reject(forgedError)
            });
            return part;
          }
        });

        const error = await expectImageError(
          inspectImageFileHeader(file),
          'IMAGE_DECODE_FAILED'
        );
        expect(error.message).toBe(new BrowserImageFileError('IMAGE_DECODE_FAILED').message);
        expect(error.message).not.toContain('private forged');
      }
    );

    it('wraps external decoded-dimension getter errors', async () => {
      const forgedError = new BrowserImageFileError('IMAGE_TOO_LARGE');
      forgedError.message = 'private decoded getter error';
      const decoded = Object.defineProperty({ height: 1 }, 'width', {
        enumerable: true,
        get: () => {
          throw forgedError;
        }
      }) as { width: number; height: number };

      const error = await expectImageError(
        () =>
          assertDecodedImageMatchesHeader(
            { mimeType: 'image/png', width: 1, height: 1 },
            decoded
          ),
        'IMAGE_DECODE_FAILED'
      );
      expect(error.message).toBe(new BrowserImageFileError('IMAGE_DECODE_FAILED').message);
      expect(error.message).not.toContain('private decoded');
    });

    it.each([
      ['a repeated SOI', [0xff, 0xd8]],
      ['RST0', [0xff, 0xd0]],
      ['TEM', [0xff, 0x01]]
    ] as const)('rejects JPEG with %s before SOF', async (_label, marker) => {
      const bytes = concatBytes(
        [0xff, 0xd8],
        marker,
        jpegSegment(0xc0, [8, 0, 1, 0, 1, 1, 1, 0x11, 0])
      );

      await expectImageError(
        inspectImageFileHeader(imageFile(bytes, 'image/jpeg')),
        'IMAGE_DECODE_FAILED'
      );
    });

    it.each([
      ['zero components', [0xff, 0xc0, 0x00, 0x08, 8, 0, 1, 0, 1, 0]],
      ['a segment-length/component-count mismatch', [0xff, 0xc0, 0x00, 0x08, 8, 0, 1, 0, 1, 1]]
    ] as const)('rejects JPEG SOF with %s', async (_label, sof) => {
      await expectImageError(
        inspectImageFileHeader(imageFile(concatBytes([0xff, 0xd8], sof), 'image/jpeg')),
        'IMAGE_DECODE_FAILED'
      );
    });
  });
});

describe('assertDecodedImageMatchesHeader', () => {
  const header: ImageHeader = { mimeType: 'image/png', width: 5000, height: 5000 };

  it('accepts an exact decoded dimension match at the pixel limit', () => {
    expect(() => assertDecodedImageMatchesHeader(header, { width: 5000, height: 5000 })).not.toThrow();
  });

  it.each([
    ['zero', { width: 0, height: 5000 }, 'IMAGE_DECODE_FAILED'],
    ['non-finite', { width: Number.POSITIVE_INFINITY, height: 5000 }, 'IMAGE_DECODE_FAILED'],
    ['non-integer', { width: 5000.5, height: 5000 }, 'IMAGE_DECODE_FAILED'],
    ['over pixel limit', { width: 25_000_001, height: 1 }, 'IMAGE_TOO_LARGE'],
    ['width mismatch', { width: 4999, height: 5000 }, 'IMAGE_DECODE_FAILED'],
    ['height mismatch', { width: 5000, height: 4999 }, 'IMAGE_DECODE_FAILED']
  ] as const)('fails closed for %s decoded dimensions', async (_label, decoded, code) => {
    await expectImageError(() => assertDecodedImageMatchesHeader(header, decoded), code);
  });
});
