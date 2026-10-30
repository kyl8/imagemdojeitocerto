import { loadSettings } from '../shared/settings.js';

const $ = (id) => document.getElementById(id);
const fields = ['jpegQuality', 'jpegBackground', 'askWhere', 'quickAction', 'nameMode', 'filePrefix', 'fileSuffix', 'subfolder'];
const statusEl = $('status');
const statusBar = document.querySelector('.status-bar');
let lastMessageTime = 0;

function showStatus(message, ok = true) {
  statusEl.textContent = message;
  statusBar.classList.toggle('error', !ok);
}

async function save(key, value) {
  try {
    await chrome.storage.sync.set({ [key]: value });
    showStatus('Preferências salvas automaticamente.');
  } catch (error) {
    showStatus(`Falha ao salvar configuração: ${error.message}`, false);
  }
}

async function init() {
  const settings = await loadSettings();
  $(`default${settings.defaultFormat === 'gif' ? 'Gif' : settings.defaultFormat === 'png' ? 'Png' : 'Jpg'}`).checked = true;
  for (const key of fields) {
    const element = $(key);
    if (element.type === 'checkbox') element.checked = Boolean(settings[key]);
    else element.value = settings[key];
  }
  $('qualityDisplay').textContent = `${settings.jpegQuality}%`;

  for (const radio of document.querySelectorAll('input[name=format]')) {
    radio.addEventListener('change', () => { if (radio.checked) void save('defaultFormat', radio.value); });
  }
  for (const key of fields) {
    const element = $(key);
    if (key === 'jpegQuality') {
      element.addEventListener('input', () => { $('qualityDisplay').textContent = `${element.value}%`; });
    }
    element.addEventListener('change', () => {
      const value = element.type === 'checkbox' ? element.checked : key === 'jpegQuality' ? Number(element.value) : element.value;
      void save(key, value);
    });
  }
  const { lastStatus } = await chrome.storage.local.get('lastStatus');
  if (lastStatus?.message && Date.now() - lastStatus.timestamp < 10 * 60 * 1000) {
    lastMessageTime = lastStatus.timestamp;
    showStatus(lastStatus.message, lastStatus.ok);
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.lastStatus) return;
  const status = changes.lastStatus.newValue;
  if (status?.timestamp > lastMessageTime) {
    lastMessageTime = status.timestamp;
    showStatus(status.message, status.ok);
  }
});
init().catch(error => showStatus(`Erro ao abrir preferências: ${error.message}`, false));
