import { loadSettings } from '../shared/settings.js';
import { buildFilename } from './filename.js';
import { buildMenu, updateMenu, IDS } from './menus.js';

const OFFSCREEN = 'src/offscreen/offscreen.html';
let offscreenPromise = null;
const activeDownloads = new Map();

async function ensureOffscreen() {
  if (offscreenPromise) return offscreenPromise;
  offscreenPromise = (async () => {
    const url = chrome.runtime.getURL(OFFSCREEN);
    const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls: [url] });
    if (!contexts.length) {
      await chrome.offscreen.createDocument({
        url: OFFSCREEN,
        reasons: ['BLOBS'],
        justification: 'Converter imagens em JPG/PNG/GIF no navegador e criar URLs temporárias para download.'
      });
    }
  })();
  try { await offscreenPromise; } finally { offscreenPromise = null; }
}

async function convertImage(url, format, settings) {
  await ensureOffscreen();
  return chrome.runtime.sendMessage({
    target: 'offscreen', action: 'convert', url, format,
    jpegQuality: settings.jpegQuality,
    jpegBackground: settings.jpegBackground
  });
}

// Para blob: e fontes vinculadas à sessão do site. Requer um gesto explícito na imagem.
async function getImageFromTab(tab, info) {
  if (!tab?.id || !info.srcUrl) throw new Error('Esta página não permite ler a imagem.');
  const injected = await chrome.scripting.executeScript({
    target: { tabId: tab.id, ...(Number.isInteger(info.frameId) && info.frameId >= 0 ? { frameIds: [info.frameId] } : {}) },
    func: async (source) => {
      const response = await fetch(source, { credentials: 'include' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      if (blob.size > 20 * 1024 * 1024) throw new Error('Imagem protegida grande demais para o método alternativo.');
      return await new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result);
        fr.onerror = () => reject(new Error('Falha ao ler imagem da página.'));
        fr.readAsDataURL(blob);
      });
    },
    args: [info.srcUrl]
  });
  if (!injected?.[0]?.result) throw new Error('Não foi possível recuperar a imagem desta página.');
  return injected[0].result;
}

async function setStatus(ok, message) {
  await chrome.storage.local.set({ lastStatus: { ok, message, timestamp: Date.now() } });
  await chrome.action.setBadgeText({ text: ok ? '' : '!' });
  if (!ok) await chrome.action.setBadgeBackgroundColor({ color: '#e35a72' });
}

async function releaseObjectUrl(url) {
  try { await chrome.runtime.sendMessage({ target: 'offscreen', action: 'release', url }); }
  catch { /* A URL expira automaticamente após um período. */ }
}

async function downloadFromMenu(info, tab) {
  const settings = await loadSettings();
  const format = info.menuItemId === IDS.quick ? settings.defaultFormat : info.menuItemId === IDS.png ? 'png' : info.menuItemId === IDS.gif ? 'gif' : 'jpg';
  const filename = buildFilename(info.srcUrl, format, settings);
  let result;
  try {
    result = await convertImage(info.srcUrl, format, settings);
    if (!result?.ok) {
      try {
        const dataUrl = await getImageFromTab(tab, info);
        result = await convertImage(dataUrl, format, settings);
      } catch (fallbackError) {
        console.warn('Leitura alternativa indisponível:', fallbackError?.message);
      }
    }
    if (!result?.ok) throw new Error(result?.error || 'Falha ao converter esta imagem.');
    const id = await chrome.downloads.download({
      url: result.blobUrl,
      filename,
      saveAs: settings.askWhere,
      conflictAction: 'uniquify'
    });
    if (typeof id !== 'number') throw new Error('O Chrome não iniciou o download.');
    activeDownloads.set(id, result.blobUrl);
    await setStatus(true, `Download iniciado: ${filename}`);
  } catch (error) {
    if (result?.blobUrl) await releaseObjectUrl(result.blobUrl);
    await setStatus(false, `Não foi possível salvar: ${error?.message || String(error)}`);
    console.error('Imagem do Jeito:', error);
  }
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!info.srcUrl || ![IDS.quick, IDS.jpg, IDS.png, IDS.gif].includes(info.menuItemId)) return;
  void downloadFromMenu(info, tab);
});

chrome.downloads.onChanged.addListener((delta) => {
  if (!delta.state || !['complete', 'interrupted'].includes(delta.state.current)) return;
  const url = activeDownloads.get(delta.id);
  if (url) {
    activeDownloads.delete(delta.id);
    void releaseObjectUrl(url);
  }
});

chrome.runtime.onInstalled.addListener(() => { void loadSettings().then(buildMenu); });
chrome.runtime.onStartup.addListener(() => { void loadSettings().then(buildMenu); });
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && (changes.defaultFormat || changes.quickAction)) {
    void loadSettings().then(updateMenu);
  }
});
