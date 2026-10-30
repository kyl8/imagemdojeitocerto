// Evita caracteres proibidos pelo Windows e caminhos fora da pasta Downloads.
function cleanPart(value, maxLength = 90) {
  const cleaned = String(value || '')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '-')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, maxLength);
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(cleaned) ? `_${cleaned}` : cleaned;
}

export function buildFilename(srcUrl, format, settings) {
  let stem = 'imagem';
  if (settings.nameMode === 'datetime') {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    stem = `imagem-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
  } else {
    try {
      const url = new URL(srcUrl);
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        let tail = url.pathname.split('/').pop() || 'imagem';
        try { tail = decodeURIComponent(tail); } catch { /* Nome original codificado. */ }
        stem = tail.replace(/\.(?:jfif|jpe|jpeg|jpg|png|webp|avif|gif|bmp|heic|heif|svg|tiff?|ico)$/i, '') || 'imagem';
      }
    } catch { /* URL data: ou blob: recebe nome genérico. */ }
  }

  const base = cleanPart(stem, 100) || 'imagem';
  const prefix = cleanPart(settings.filePrefix, 40);
  const suffix = cleanPart(settings.fileSuffix, 40);
  const name = `${prefix}${base}${suffix}`.slice(0, 160);
  const folder = cleanPart(settings.subfolder, 80);
  return `${folder ? folder + '/' : ''}${name}.${format}`;
}
