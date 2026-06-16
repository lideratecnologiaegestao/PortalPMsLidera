import { stripExif } from './exif.util';

// monta um JPEG mínimo: SOI + APP1(EXIF) + APP0 + SOS + dados
function jpegComExif(): Buffer {
  const soi = Buffer.from([0xff, 0xd8]);
  const exifPayload = Buffer.from('Exif\0\0GPSDATA-secreta');
  const app1 = Buffer.concat([
    Buffer.from([0xff, 0xe1]),
    tamanho(exifPayload.length + 2),
    exifPayload,
  ]);
  const app0Payload = Buffer.from('JFIF\0');
  const app0 = Buffer.concat([
    Buffer.from([0xff, 0xe0]),
    tamanho(app0Payload.length + 2),
    app0Payload,
  ]);
  const sos = Buffer.from([0xff, 0xda, 0x00, 0x03, 0x01, 0xaa, 0xbb]);
  return Buffer.concat([soi, app1, app0, sos]);
}
function tamanho(n: number): Buffer {
  const b = Buffer.alloc(2);
  b.writeUInt16BE(n);
  return b;
}

describe('stripExif', () => {
  it('remove o segmento APP1 (EXIF/GPS) preservando o resto', () => {
    const original = jpegComExif();
    const limpo = stripExif(original);
    expect(limpo.includes(Buffer.from('GPSDATA-secreta'))).toBe(false); // EXIF foi
    expect(limpo.includes(Buffer.from('JFIF'))).toBe(true); // APP0 ficou
    expect(limpo.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8])); // ainda é JPEG
    expect(limpo.length).toBeLessThan(original.length);
  });

  it('não altera buffers que não são JPEG', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
    expect(stripExif(png)).toEqual(png);
  });
});
