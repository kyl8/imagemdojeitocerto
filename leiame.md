# Imagem do Jeito v1.2 (Brave / Chrome / Edge)

Extensão Manifest V3 que adiciona um submenu em **cliques com botão direito em imagens**.

## Instalação

1. Extraia o ZIP em uma pasta fixa.
2. Abra `brave://extensions` (ou `chrome://extensions` / `edge://extensions`).
3. Ative **Modo do desenvolvedor** e clique em **Carregar sem compactação**.
4. Selecione a pasta `imagem-do-jeito-ext` que contém `manifest.json`.
5. Se estiver atualizando uma instalação existente, substitua os arquivos e clique em **Recarregar** na página de extensões. As configurações ficam salvas no navegador.

## Uso

Botão direito na imagem → **Imagem do Jeito** → selecione:

- **Salvar como JPG**: converte a imagem estática ou usa JPEG original sem recodificar.
- **Salvar como PNG**: exporta um quadro estático.
- **Salvar como GIF (manter animação)**: salva GIF original sem alterar ou converte WebP animado quadro a quadro. Uma imagem estática vira GIF de um quadro.
- **Salvar rápido**: usa o formato padrão (JPG, PNG ou GIF) definido no painel da extensão.

Clique no ícone da extensão para mudar formato padrão, qualidade JPG, fundo, prefixo, sufixo, nome, subpasta e confirmação de destino.

**A opção nativa “Salvar imagem como...” não é alterada.** Se clicar nela, o navegador continuará salvando no formato que o servidor envia.

## Limitações

- **GIF aceita no máximo 256 cores**, por isso WebP animado → GIF pode alterar cores e gerar arquivo maior.
- WebP animado usa o **WebCodecs ImageDecoder** disponível em navegadores Chromium modernos. Se o navegador não oferecer essa API, a extensão exibe erro, **não** converte silenciosamente para uma imagem parada.
- Conversões GIF geradas localmente usam paleta RGB 3-3-2 e LZW: são funcionais, mas a fidelidade de cor não é a mesma do WebP original. GIFs originais não são recodificados.
- Limite de conversão de GIF: **250 quadros**, **2,5 milhões de pixels por quadro** e **36 milhões de pixels no conjunto de quadros** para reduzir o risco de travamentos. GIF original é preservado sem precisar decodificar.
- Se o site disponibilizar somente uma **prévia estática em WebP**, não há quadros de animação a recuperar. Vídeos MP4 e conteúdo animado por CSS também não são convertidos por este menu.
- JPG e PNG exportam somente um quadro caso a origem seja animada.
- Algumas imagens protegidas, `blob:`, com autenticação específica ou presentes em páginas internas podem não ser acessíveis.
- A extensão não envia arquivos a conversores de terceiros; lê as imagens na origem e converte no navegador. Para conseguir ler imagens de vários sites, declara permissão de acesso a URLs.

## Estrutura extensível

- `src/background/menus.js`: entradas de menu do botão direito.
- `src/background/service-worker.js`: captura da origem, downloads e erros.
- `src/background/filename.js`: formato de nomes e pastas.
- `src/offscreen/offscreen.js`: conversão JPG, PNG, uso do ImageDecoder e GIF.
- `src/offscreen/gif-encoder.js`: escrita de quadros e codificação GIF89a local.
- `src/popup/popup.html`, `.css`, `.js`: painel de ajustes.
- `src/shared/settings.js`: formatos e preferências.

Para adicionar um novo formato, expanda os menus, o conversor e as opções do painel. Não exige Node.js ou dependências para instalar.
