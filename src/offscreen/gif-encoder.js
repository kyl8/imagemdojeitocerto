/* GIF89a encoder local, sem dependências. Paleta RGB 3-3-2 e LZW.
 * GIF trabalha com até 256 cores e delays em centésimos de segundo.
 * Cada frame é completo: evitar rastros de frames anteriores (disposal 2).
 */
(() => {
  'use strict';
  class Bytes {
    constructor() { this.parts = []; this.length = 0; }
    add(data) { const part = data instanceof Uint8Array ? data : Uint8Array.from(data); this.parts.push(part); this.length += part.length; }
    byte(n) { this.add([n & 255]); }
    word(n) { this.add([n & 255, (n >>> 8) & 255]); }
    ascii(s) { this.add(Array.from(s, c => c.charCodeAt(0))); }
    toBlob() { return new Blob(this.parts, { type: 'image/gif' }); }
  }
  function palette332() {
    const palette = new Uint8Array(768);
    for (let i = 0; i < 256; i++) {
      const r = i >>> 5, g = (i >>> 2) & 7, b = i & 3;
      palette[i * 3] = Math.round(r * 255 / 7);
      palette[i * 3 + 1] = Math.round(g * 255 / 7);
      palette[i * 3 + 2] = Math.round(b * 255 / 3);
    }
    return palette;
  }
  function indexPixels(rgba, width, height) {
    const out = new Uint8Array(width * height);
    let transparent = false;
    for (let p = 0, k = 0; k < out.length; p += 4, k++) {
      if (rgba[p + 3] < 128) { out[k] = 255; transparent = true; continue; }
      // Quantização arredondada 3-3-2; índice 255 reservado para transparência.
      const r = Math.min(7, Math.floor((rgba[p] * 8) / 256));
      const g = Math.min(7, Math.floor((rgba[p + 1] * 8) / 256));
      const b = Math.min(3, Math.floor((rgba[p + 2] * 4) / 256));
      out[k] = Math.min(254, (r << 5) | (g << 2) | b);
    }
    return { indexed: out, transparent };
  }
  function lzwEncode(indices) {
    const CLEAR = 256, END = 257;
    let next = 258, size = 9;
    const codes = new Map();
    const out = [];
    let bits = 0, bitCount = 0;
    const emit = code => {
      bits |= code << bitCount;
      bitCount += size;
      while (bitCount >= 8) {
        out.push(bits & 255);
        bits >>>= 8;
        bitCount -= 8;
      }
    };
    const reset = () => { codes.clear(); next = 258; size = 9; emit(CLEAR); };
    reset();
    if (indices.length) {
      let prefix = indices[0];
      for (let i = 1; i < indices.length; i++) {
        const nextPixel = indices[i];
        const key = prefix * 256 + nextPixel;
        const code = codes.get(key);
        if (code !== undefined) { prefix = code; continue; }
        emit(prefix);
        if (next < 500) {
          codes.set(key, next++);
          // Evita fronteiras de largura LZW: reinicia antes de 512 códigos.
          // Códigos de 9 bits garantem decodificação consistente em leitores GIF.
        } else {
          reset();
        }
        prefix = nextPixel;
      }
      emit(prefix);
    }
    emit(END);
    if (bitCount) out.push(bits & 255);
    return Uint8Array.from(out);
  }
  class LocalGifEncoder {
    constructor(width, height) {
      if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 65535 || height > 65535) {
        throw new Error('Dimensões incompatíveis com o GIF.');
      }
      this.width = width;
      this.height = height;
      this.data = new Bytes();
      this.data.ascii('GIF89a');
      this.data.word(width); this.data.word(height);
      this.data.add([0xf7, 255, 0]); // Tabela global 256 cores, fundo reservado
      this.data.add(palette332());
      // Loop infinito padrão Netscape para frames animados
      this.data.add([0x21, 0xff, 0x0b]); this.data.ascii('NETSCAPE2.0');
      this.data.add([0x03, 0x01, 0x00, 0x00, 0x00]);
      this.frames = 0;
    }
    addFrame(rgba, durationMicroseconds = 100000) {
      const { indexed, transparent } = indexPixels(rgba, this.width, this.height);
      const delayCs = Number.isFinite(durationMicroseconds)
        ? Math.min(65535, Math.max(2, Math.round(durationMicroseconds / 10000))) : 10;
      // Graphics Control Extension, disposal 2 (limpar área anterior).
      this.data.add([0x21, 0xf9, 0x04, 0x08 | (transparent ? 1 : 0)]);
      this.data.word(delayCs); this.data.add([255, 0]);
      this.data.byte(0x2c); // Image Descriptor
      this.data.word(0); this.data.word(0);
      this.data.word(this.width); this.data.word(this.height);
      this.data.byte(0); // Usa paleta global
      this.data.byte(8); // LZW minimum code size
      const compressed = lzwEncode(indexed);
      for (let p = 0; p < compressed.length; p += 255) {
        const sub = compressed.subarray(p, p + 255);
        this.data.byte(sub.length);
        this.data.add(sub);
      }
      this.data.byte(0);
      this.frames++;
    }
    finish() {
      if (this.frames === 0) throw new Error('A imagem não contém quadros para exportar.');
      this.data.byte(0x3b);
      return this.data.toBlob();
    }
  }
  globalThis.LocalGifEncoder = LocalGifEncoder;
})();
