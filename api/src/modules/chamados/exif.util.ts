/**
 * Remoção de metadados EXIF de JPEG (DPIA docs/07-dpia.md): a foto de um
 * chamado pode embutir a geolocalização GPS no EXIF, independente do campo
 * `geo` — o que revelaria a rotina/endereço do denunciante. Removemos os
 * segmentos APP1 (onde vivem EXIF/GPS) sem reencodar a imagem.
 *
 * Implementação pura (sem dependências nativas). Para não-JPEG, retorna o
 * buffer original (PNG/WebP raramente carregam GPS de câmera de celular).
 */
export function stripExif(buf: Buffer): Buffer {
  // assinatura JPEG: FF D8
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return buf;

  const partes: Buffer[] = [Buffer.from([0xff, 0xd8])];
  let i = 2;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff) break; // estrutura inesperada → para
    const marcador = buf[i + 1];
    // SOS (início do scan): daqui em diante é a imagem comprimida — copia tudo
    if (marcador === 0xda) {
      partes.push(buf.subarray(i));
      return Buffer.concat(partes);
    }
    const tamanho = buf.readUInt16BE(i + 2); // inclui os 2 bytes do tamanho
    const segmento = buf.subarray(i, i + 2 + tamanho);
    // APP1 (FF E1) carrega EXIF/GPS → descarta. Demais segmentos preserva.
    if (marcador !== 0xe1) partes.push(segmento);
    i += 2 + tamanho;
  }
  // se saiu do loop sem SOS, devolve o que tinha + resto
  if (i < buf.length) partes.push(buf.subarray(i));
  return Buffer.concat(partes);
}
