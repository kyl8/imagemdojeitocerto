const IDS = Object.freeze({ parent: 'idj-parent', quick: 'idj-quick', jpg: 'idj-jpg', png: 'idj-png', gif: 'idj-gif' });
export { IDS };

export async function buildMenu(settings) {
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: IDS.parent,
    title: 'Imagem do Jeito',
    contexts: ['image']
  });
  chrome.contextMenus.create({
    id: IDS.quick,
    title: `Salvar rápido como ${settings.defaultFormat.toUpperCase()}`,
    contexts: ['image'],
    parentId: IDS.parent,
    visible: settings.quickAction
  });
  chrome.contextMenus.create({ id: IDS.jpg, title: 'Salvar como JPG', contexts: ['image'], parentId: IDS.parent });
  chrome.contextMenus.create({ id: IDS.png, title: 'Salvar como PNG', contexts: ['image'], parentId: IDS.parent });
  chrome.contextMenus.create({ id: IDS.gif, title: 'Salvar como GIF (manter animação)', contexts: ['image'], parentId: IDS.parent });
}

export async function updateMenu(settings) {
  try {
    await chrome.contextMenus.update(IDS.quick, {
      title: `Salvar rápido como ${settings.defaultFormat.toUpperCase()}`,
      visible: settings.quickAction
    });
  } catch {
    await buildMenu(settings);
  }
}
