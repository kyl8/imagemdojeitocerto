// Isolado do popup e dos menus. Converter = só Canvas/Blob, sem servidor externo.
const urls = new Set();
const MAX_PIXELS = 70_000_000;

function makeDownloadUrl(blob) {
  const url = URL.createObjectURL(blob);
  urls.add(url);
  // Proteção caso a aba seja fechada e o evento de download nunca chegue.
  setTimeout(() => release(url), 30 * 60 * 1000);
  return url;
}
function release(url) {
  if (!urls.has(url)) return;
  urls.delete(url);
  URL.revokeObjectURL(url);
}
async function isJpeg(blob) {
  const magic = new Uint8Array(await blob.slice(0, 3).arrayBuffer());
  return magic.length >= 3 && magic[0] === 255 && magic[1] === 216 && magic[2] === 255;
}

// Limites para evitar travar o navegador ao converter GIFs muito grandes.
const MAX_ANIMATED_PIXELS = 36_000_000; // largura × altura × quantidade de quadros
const MAX_FRAMES = 250;
const MAX_FRAME_PIXELS = 2_500_000;

async function isGif(blob) {
  const first = new Uint8Array(await blob.slice(0, 6).arrayBuffer());
  return String.fromCharCode(...first) === 'GIF89a' || String.fromCharCode(...first) === 'GIF87a';
}

async function sourceMime(blob) {
  const header = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  const headerStr = String.fromCharCode(...header);
  if (headerStr.startsWith('RIFF') && headerStr.slice(8, 12) === 'WEBP') return 'image/webp';
  if (headerStr.startsWith('GIF8')) return 'image/gif';
  if (headerStr.startsWith('\x89PNG')) return 'image/png';
  return blob.type.toLowerCase().split(';')[0];
}

async function convertGif(source) {
  // GIF original: salvar todos os quadros e tempos exatamente, sem reprocessar.
  if (await isGif(source)) return { blobUrl: makeDownloadUrl(source), originalGif: true, frames: null };

  const mime = await sourceMime(source);
  const header = new Uint8Array(await source.slice(0, 21).arrayBuffer());
  // RIFF WEBP + VP8X + size + flags (bit 1 indica animação).
  const animatedWebp = mime === 'image/webp'
    && String.fromCharCode(...header.subarray(12, 16)) === 'VP8X'
    && (header[20] & 0x02) !== 0;
  let decoder = null;
  if (globalThis.ImageDecoder && mime && await ImageDecoder.isTypeSupported(mime)) {
    decoder = new ImageDecoder({ data: await source.arrayBuffer(), type: mime, preferAnimation: true });
    try {
      await decoder.tracks.ready;
      await decoder.completed;
      const track = decoder.tracks.selectedTrack;
      const frameCount = track?.frameCount || 0;
      if (animatedWebp && frameCount < 2) throw new Error('Não foi possível acessar os quadros da animação WebP.');
      if (frameCount > MAX_FRAMES) throw new Error(`Animação com muitos quadros (${frameCount}). Limite: ${MAX_FRAMES}.`);
      if (frameCount) {
        const { image: first } = await decoder.decode({ frameIndex: 0 });
        const width = first.displayWidth, height = first.displayHeight;
        const framePixels = width * height;
        if (!framePixels || framePixels > MAX_FRAME_PIXELS || framePixels * frameCount > MAX_ANIMATED_PIXELS) {
          first.close();
          throw new Error('Animação muito grande para converter com segurança.');
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) { first.close(); throw new Error('Canvas indisponível.'); }
        const gif = new LocalGifEncoder(width, height);
        for (let i = 0; i < frameCount; i++) {
          const image = i === 0 ? first : (await decoder.decode({ frameIndex: i })).image;
          try {
            ctx.clearRect(0, 0, width, height);
            ctx.drawImage(image, 0, 0, width, height);
            gif.addFrame(ctx.getImageData(0, 0, width, height).data, image.duration);
          } finally { image.close(); }
          // Não monopolizar a thread de rendering.
          if (i % 8 === 7) await new Promise(r => setTimeout(r, 0));
        }
        return { blobUrl: makeDownloadUrl(gif.finish()), originalGif: false, frames: frameCount };
      }
    } finally { decoder.close(); }
  }

  if (animatedWebp) throw new Error('Seu navegador não suporta converter os quadros deste WebP animado.');

  // Caso imagem estática ou formato que o WebCodecs não decodifica.
  let bitmap;
  try { bitmap = await createImageBitmap(source); }
  catch { throw new Error('O navegador não conseguiu abrir este formato para GIF.'); }
  try {
    const width = bitmap.width, height = bitmap.height;
    if (!width || !height || width * height > MAX_FRAME_PIXELS) {
      throw new Error('Imagem estática muito grande para gerar GIF.');
    }
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Canvas indisponível.');
    ctx.drawImage(bitmap, 0, 0);
    const gif = new LocalGifEncoder(width, height);
    gif.addFrame(ctx.getImageData(0, 0, width, height).data, 100000);
    return { blobUrl: makeDownloadUrl(gif.finish()), originalGif: false, frames: 1 };
  } finally { bitmap.close(); }
}

async function convert({ url, format, jpegQuality, jpegBackground }) {
  if (!['jpg', 'png', 'gif'].includes(format)) throw new Error('Formato de saída inválido.');
  if (!/^(https?:|data:|blob:)/i.test(url)) throw new Error('Origem não permitida.');
  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) throw new Error(`O site da imagem respondeu ${response.status}.`);
  const source = await response.blob();
  if (source.size === 0) throw new Error('A imagem está vazia.');

  if (format === 'gif') return convertGif(source);

  // JFIF/JPEG -> JPG: sem recodificação, preservando qualidade.
  if (format === 'jpg' && await isJpeg(source)) {
    return { blobUrl: makeDownloadUrl(source), originalJpeg: true };
  }

  let bitmap;
  try { bitmap = await createImageBitmap(source); }
  catch { throw new Error('O navegador não conseguiu abrir esse formato de imagem.'); }
  try {
    const pixels = bitmap.width * bitmap.height;
    if (!pixels || pixels > MAX_PIXELS) throw new Error('Imagem grande demais para converter com segurança.');
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas não está disponível.');
    if (format === 'jpg') {
      ctx.fillStyle = /^#[0-9a-f]{6}$/i.test(jpegBackground) ? jpegBackground : '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(bitmap, 0, 0);
    const mime = format === 'png' ? 'image/png' : 'image/jpeg';
    const quality = Math.min(1, Math.max(0.5, Number(jpegQuality) / 100 || 0.92));
    const output = await new Promise((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Não foi possível exportar a imagem.')), mime, quality);
    });
    return { blobUrl: makeDownloadUrl(output), originalJpeg: false };
  } finally { bitmap.close(); }
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.target !== 'offscreen' || sender.id !== chrome.runtime.id) return false;
  if (message.action === 'release') {
    release(message.url);
    respond({ ok: true });
    return false;
  }
  if (message.action !== 'convert') return false;
  convert(message)
    .then(output => respond({ ok: true, ...output }))
    .catch(error => respond({ ok: false, error: error?.message || String(error) }));
  return true;
});
