// Preferências centralizadas. Para adicionar novas funções, estenda aqui e na interface.
export const DEFAULTS = Object.freeze({
  defaultFormat: 'jpg',
  askWhere: true,
  jpegQuality: 92,
  jpegBackground: '#ffffff',
  nameMode: 'original',
  filePrefix: '',
  fileSuffix: '',
  subfolder: '',
  quickAction: true
});

export function normalizeSettings(raw = {}) {
  const incoming = { ...DEFAULTS, ...raw };
  const jpegQuality = Number(incoming.jpegQuality);
  return {
    defaultFormat: ['jpg', 'png', 'gif'].includes(incoming.defaultFormat) ? incoming.defaultFormat : 'jpg',
    askWhere: incoming.askWhere !== false,
    jpegQuality: Number.isFinite(jpegQuality) ? Math.max(50, Math.min(100, Math.round(jpegQuality))) : DEFAULTS.jpegQuality,
    jpegBackground: /^#[0-9a-f]{6}$/i.test(incoming.jpegBackground) ? incoming.jpegBackground : DEFAULTS.jpegBackground,
    nameMode: incoming.nameMode === 'datetime' ? 'datetime' : 'original',
    filePrefix: String(incoming.filePrefix || '').slice(0, 40),
    fileSuffix: String(incoming.fileSuffix || '').slice(0, 40),
    subfolder: String(incoming.subfolder || '').slice(0, 80),
    quickAction: incoming.quickAction !== false
  };
}

export async function loadSettings() {
  return normalizeSettings(await chrome.storage.sync.get(DEFAULTS));
}
