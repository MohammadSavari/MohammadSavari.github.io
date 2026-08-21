// ==UserScript==
// @name         Scribd Full Page PNG Exporter
// @namespace    local.scribd.exporter
// @version      1.7.0
// @description  Open Scribd documents in embed view and save every complete page as separate PNGs, one ZIP, or one PDF.
// @author       Mohammad Savari
// @homepageURL  https://mohammadsavari.github.io/tools/scribd-exporter/
// @downloadURL  https://mohammadsavari.github.io/assets/js/scribd-page-exporter.user.js
// @updateURL    https://mohammadsavari.github.io/assets/js/scribd-page-exporter.user.js
// @match        https://www.scribd.com/*
// @run-at       document-start
// @require      https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @connect      html.scribd.com
// @connect      html.scribdassets.com
// @connect      *.scribdassets.com
// ==/UserScript==

(() => {
  'use strict';

  const BUTTON_ID_PREFIX = 'tm-scribd-full-page-exporter-';
  const STOP_BUTTON_ID = 'tm-scribd-full-page-exporter-stop';
  const match = location.href.match(/\/(?:document|doc|presentation|book)\/(\d+)/i);

  if (match) {
    location.href = `https://www.scribd.com/embeds/${match[1]}/content`;
    return;
  }

  if (!/^\/embeds\/\d+\/content\/?$/i.test(location.pathname)) return;

  // The numeric id from the URL names the bundled outputs, so a zip or PDF is
  // traceable back to the document it came from.
  const DOC_ID = location.pathname.match(/^\/embeds\/(\d+)\//)[1];

  const OUTPUTS = {
    png: {
      label: 'PNG',
      title: 'Save every page as a separate PNG file',
    },
    zip: {
      label: 'ZIP',
      title: `Save every page as a PNG inside scribd-${DOC_ID}.zip`,
    },
    pdf: {
      label: 'PDF',
      title: `Save every page into a single scribd-${DOC_ID}.pdf`,
    },
  };

  // @require libraries land on the userscript sandbox's window, but which global
  // they define differs by build, so resolve defensively rather than assuming one.
  function getJsZip() {
    const lib = (typeof JSZip !== 'undefined' && JSZip) || window.JSZip;
    if (!lib) throw new Error('JSZip did not load; reinstall the userscript');
    return lib;
  }

  function getJsPdf() {
    const namespace = (typeof jspdf !== 'undefined' && jspdf) || window.jspdf;
    const constructor = namespace?.jsPDF || window.jsPDF;
    if (!constructor) throw new Error('jsPDF did not load; reinstall the userscript');
    return constructor;
  }

  // ---------------------------------------------------------------------------
  // Cancellation
  // ---------------------------------------------------------------------------

  let stopRequested = false;

  class CancelledError extends Error {
    constructor() {
      super('Export stopped');
      this.name = 'CancelledError';
    }
  }

  const throwIfStopped = () => {
    if (stopRequested) throw new CancelledError();
  };

  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // Sleeps in short slices so Stop reacts quickly.
  async function cancellableDelay(ms) {
    const step = 100;
    for (let waited = 0; waited < ms; waited += step) {
      throwIfStopped();
      await delay(Math.min(step, ms - waited));
    }
    throwIfStopped();
  }

  const request = (url, responseType = 'text') => new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method: 'GET',
      url,
      responseType,
      timeout: 30000,
      onload: (response) => response.status >= 200 && response.status < 300
        ? resolve(response.response)
        : reject(new Error(`HTTP ${response.status} for ${url}`)),
      ontimeout: () => reject(new Error(`Timed out loading ${url}`)),
      onerror: () => reject(new Error(`Could not load ${url}`)),
    });
  });

  // ---------------------------------------------------------------------------
  // Page discovery
  // ---------------------------------------------------------------------------

  // Source A: explicit addPage calls used for lazy-loaded pages.
  function collectFromAddPage() {
    const found = [];
    const expression = /docManager\.addPage\s*\(\s*\{([\s\S]*?)\}\s*\)\s*;/g;

    for (const entry of document.documentElement.innerHTML.matchAll(expression)) {
      const pageNum = Number(entry[1].match(/\bpageNum\s*:\s*(\d+)/)?.[1]);
      const contentUrl = entry[1].match(/\bcontentUrl\s*:\s*["']([^"']+)["']/)?.[1];
      if (!Number.isInteger(pageNum) || pageNum < 1 || !contentUrl) continue;
      found.push({ pageNum, contentUrl, source: 'addPage' });
    }

    return found;
  }

  // Source B: JSONP page URLs found anywhere in the embed markup.
  function collectFromJsonpUrls() {
    const found = [];
    const expression = /["'](https?:)?\/\/[^"'\s]*\/pages\/(\d+)-[^"'\s]*?\.jsonp[^"'\s]*["']/gi;

    for (const entry of document.documentElement.innerHTML.matchAll(expression)) {
      const raw = entry[0].slice(1, -1);
      const pageNum = Number(entry[2]);
      if (!Number.isInteger(pageNum) || pageNum < 1) continue;
      found.push({
        pageNum,
        contentUrl: new URL(raw, location.href).href,
        source: 'jsonp',
      });
    }

    return found;
  }

  // Source C: inline live-DOM pages, including Scribd's initial #page1,
  // #page2, and #page3 elements that do not have an outer_page_N parent.
  function collectFromDom() {
    const found = [];
    const seen = new Set();
    const selector = [
      '.newpage[id^="page"]',
      '[class*="outer_page_"] .newpage',
      '[class*="outer_page_"].newpage',
    ].join(',');

    for (const page of document.querySelectorAll(selector)) {
      const idPageNum = Number(page.id?.match(/^page(\d+)$/i)?.[1]);
      const outer = page.closest('[class*="outer_page_"]');
      const outerIndex = Number(
        String(outer?.className || '')
          .match(/(?:^|\s)outer_page_(\d+)(?:\s|$)/)?.[1],
      );

      const pageNum = Number.isInteger(idPageNum) && idPageNum > 0
        ? idPageNum
        : Number.isInteger(outerIndex)
          ? outerIndex + 1
          : NaN;

      if (!Number.isInteger(pageNum) || pageNum < 1 || seen.has(pageNum)) continue;
      if (!page.querySelector('img, .text_layer, span, div')) continue;

      seen.add(pageNum);
      found.push({ pageNum, element: page, source: 'dom' });
    }

    return found;
  }

  const SOURCE_RANK = { addPage: 3, jsonp: 2, dom: 1 };

  function collectPageConfigs() {
    const byPageNum = new Map();
    const configs = [
      ...collectFromAddPage(),
      ...collectFromJsonpUrls(),
      ...collectFromDom(),
    ];

    for (const config of configs) {
      const existing = byPageNum.get(config.pageNum);
      if (!existing || SOURCE_RANK[config.source] > SOURCE_RANK[existing.source]) {
        byPageNum.set(config.pageNum, config);
      }
    }

    return [...byPageNum.values()].sort((a, b) => a.pageNum - b.pageNum);
  }

  function detectExpectedPageCount() {
    const markup = document.documentElement.innerHTML;
    const patterns = [
      /\bpage_count\b["']?\s*[:=]\s*["']?(\d+)/i,
      /\bpageCount\b["']?\s*[:=]\s*["']?(\d+)/i,
      /\bnum_pages\b["']?\s*[:=]\s*["']?(\d+)/i,
      /\btotal_pages\b["']?\s*[:=]\s*["']?(\d+)/i,
    ];
    let best = 0;

    for (const pattern of patterns) {
      const value = Number(markup.match(pattern)?.[1]);
      if (Number.isInteger(value) && value > best) best = value;
    }

    return best || null;
  }

  function nudgeLazyLoading() {
    const targets = [
      document.scrollingElement,
      document.body,
      document.querySelector('.document_container'),
    ];

    for (const target of targets) {
      if (!target || !target.scrollHeight) continue;
      const previous = target.scrollTop;
      target.scrollTop = target.scrollHeight;
      target.dispatchEvent(new Event('scroll', { bubbles: true }));
      target.scrollTop = previous;
    }

    window.dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new Event('resize'));
  }

  function findGaps(configs) {
    if (!configs.length) return [];
    const present = new Set(configs.map((config) => config.pageNum));
    const missing = [];

    for (let pageNum = 1; pageNum <= configs[configs.length - 1].pageNum; pageNum += 1) {
      if (!present.has(pageNum)) missing.push(pageNum);
    }

    return missing;
  }

  function summarize(configs) {
    const counts = configs.reduce((totals, config) => {
      totals[config.source] = (totals[config.source] || 0) + 1;
      return totals;
    }, {});

    return Object.entries(counts)
      .map(([source, count]) => `${source}:${count}`)
      .join(' ');
  }

  async function gatherPageConfigs(onProgress) {
    const expected = detectExpectedPageCount();
    let best = [];
    let stableFor = 0;

    for (let attempt = 0; attempt < 40; attempt += 1) {
      throwIfStopped();

      const current = collectPageConfigs();
      if (current.length > best.length) {
        best = current;
        stableFor = 0;
      } else {
        stableFor += 1;
      }

      onProgress?.(best.length, expected);

      const complete = best.length
        && best[0].pageNum === 1
        && !findGaps(best).length
        && (!expected || best.length >= expected);

      if (complete) break;
      if (stableFor >= 5 && best.length) break;

      nudgeLazyLoading();
      await cancellableDelay(400);
    }

    if (!best.length) throw new Error('No Scribd pages could be discovered');

    console.info(
      `[Scribd exporter] ${best.length} pages found (${summarize(best)}), expected ${expected ?? 'unknown'}`,
    );

    if (best[0].pageNum !== 1) {
      console.warn(`[Scribd exporter] page 1 not found; lowest is ${best[0].pageNum}`);
    }

    const missing = findGaps(best);
    if (missing.length) {
      console.warn('[Scribd exporter] missing pages:', missing.join(', '));
    }

    return best;
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  function parseJsonpMarkup(source) {
    const open = source.indexOf('(');
    const close = source.lastIndexOf(')');
    if (open < 0 || close <= open) throw new Error('Invalid Scribd page response');

    const payload = JSON.parse(source.slice(open + 1, close));
    if (!Array.isArray(payload) || typeof payload[0] !== 'string') {
      throw new Error('Scribd page markup is missing');
    }

    return payload[0];
  }

  function resolveImageUrl(image) {
    const source = image.getAttribute('orig') || image.getAttribute('src');
    if (!source || source.startsWith('data:')) return source;

    const url = new URL(source, location.href);
    if (url.hostname === 'html.scribd.com') {
      url.protocol = 'https:';
      url.hostname = 'html.scribdassets.com';
    }

    return url.href;
  }

  const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Image conversion failed'));
    reader.readAsDataURL(blob);
  });

  function normalizeLegacyImageClip(image) {
    const style = getComputedStyle(image);
    const clip = style.clip.match(
      /^rect\(\s*(-?[\d.]+)px[ ,]+\s*(-?[\d.]+)px[ ,]+\s*(-?[\d.]+)px[ ,]+\s*(-?[\d.]+)px\s*\)$/i,
    );
    if (!clip) return;

    const top = Number(clip[1]);
    const right = Number(clip[2]);
    const bottom = Number(clip[3]);
    const left = Number(clip[4]);
    const wrapper = document.createElement('div');

    wrapper.style.cssText = [
      'position:absolute',
      `left:${(parseFloat(style.left) || 0) + left}px`,
      `top:${(parseFloat(style.top) || 0) + top}px`,
      `width:${Math.max(0, right - left)}px`,
      `height:${Math.max(0, bottom - top)}px`,
      'overflow:hidden',
    ].join(';');

    image.style.position = 'absolute';
    image.style.left = `${-left}px`;
    image.style.top = `${-top}px`;
    image.style.clip = 'auto';
    image.parentNode.insertBefore(wrapper, image);
    wrapper.appendChild(image);
  }

  async function inlineImages(root) {
    const cache = new Map();

    for (const image of root.querySelectorAll('img')) {
      throwIfStopped();

      const source = resolveImageUrl(image);
      if (!source) continue;

      if (!cache.has(source)) {
        cache.set(source, await blobToDataUrl(await request(source, 'blob')));
      }

      image.src = cache.get(source);
      await image.decode().catch(() => {});

      if (!image.complete || !image.naturalWidth) {
        throw new Error('A Scribd page image could not be decoded');
      }

      normalizeLegacyImageClip(image);
    }
  }

  function createStage(content) {
    const host = document.createElement('div');
    host.style.cssText = [
      'position:fixed',
      'left:-100000px',
      'top:0',
      'display:block',
      'visibility:visible',
      'pointer-events:none',
    ].join(';');

    if (typeof content === 'string') host.innerHTML = content;
    else host.appendChild(content.cloneNode(true));

    document.body.appendChild(host);
    const page = host.querySelector('.newpage') || host.firstElementChild;

    if (!page) {
      host.remove();
      throw new Error('Rendered page container is missing');
    }

    return { host, page };
  }

  const canvasToBlob = (canvas) => new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('PNG creation failed')),
      'image/png',
    );
  });

  async function renderPage(config) {
    throwIfStopped();

    const content = config.contentUrl
      ? parseJsonpMarkup(await request(config.contentUrl))
      : config.element;
    const { host, page } = createStage(content);

    try {
      await inlineImages(page);
      await delay(0);
      throwIfStopped();

      const width = Math.round(parseFloat(page.style.width) || page.offsetWidth);
      const height = Math.round(parseFloat(page.style.height) || page.offsetHeight);
      if (!width || !height) throw new Error('Page has no measurable size');

      const canvas = await html2canvas(page, {
        backgroundColor: '#fff',
        logging: false,
        scale: 1,
        useCORS: false,
        width,
        height,
        windowWidth: width,
        windowHeight: height,
      });

      return canvas;
    } finally {
      host.remove();
    }
  }

  // ---------------------------------------------------------------------------
  // Bundling
  // ---------------------------------------------------------------------------

  // One canvas pixel becomes one PDF point, so each page keeps the exact aspect
  // ratio it was rendered at and pages of differing sizes each get their own size.
  function addPdfPage(pdf, canvas) {
    const width = canvas.width;
    const height = canvas.height;
    const orientation = width > height ? 'landscape' : 'portrait';
    const image = canvas.toDataURL('image/png');

    if (pdf) pdf.addPage([width, height], orientation);
    else {
      const JsPDF = getJsPdf();
      pdf = new JsPDF({ unit: 'pt', format: [width, height], orientation, compress: true });
    }

    pdf.addImage(image, 'PNG', 0, 0, width, height);
    return pdf;
  }

  // PNGs are already deflated, so re-compressing them in the zip only burns time.
  function generateZip(zip, onProgress) {
    return zip.generateAsync({ type: 'blob', compression: 'STORE' }, (meta) => {
      onProgress?.(meta.percent);
    });
  }

  // ---------------------------------------------------------------------------
  // Download
  // ---------------------------------------------------------------------------

  // The first file of a run may prompt (so the user can pick a folder);
  // every later file is written silently to that same download location.
  function downloadBlob(blob, name) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = name;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      // Give the browser a moment to claim the blob before releasing it.
      setTimeout(() => {
        link.remove();
        URL.revokeObjectURL(url);
        resolve();
      }, 400);
    });
  }

  // ---------------------------------------------------------------------------
  // Export driver
  // ---------------------------------------------------------------------------

  async function startExport(mode, button, siblings, stopButton) {
    stopRequested = false;
    button.disabled = true;
    siblings.forEach((sibling) => { sibling.disabled = true; });
    stopButton.disabled = false;
    stopButton.style.display = 'block';

    let exported = 0;
    const failures = [];
    const zip = mode === 'zip' ? new (getJsZip())() : null;
    let pdf = null;

    // Resolve the PDF library before rendering anything, so a library that failed to
    // load reports itself once instead of failing every single page.
    if (mode === 'pdf') getJsPdf();

    try {
      const configs = await gatherPageConfigs((count, expected) => {
        button.textContent = expected ? `${count}/${expected}` : `${count}?`;
        button.title = 'Discovering pages';
      });

      const digits = Math.max(3, String(configs[configs.length - 1].pageNum).length);

      for (let index = 0; index < configs.length; index += 1) {
        throwIfStopped();

        const config = configs[index];
        button.textContent = `${index + 1}/${configs.length}`;
        button.title = `Rendering page ${config.pageNum} (${config.source})`;

        try {
          const canvas = await renderPage(config);
          const filename = `page-${String(config.pageNum).padStart(digits, '0')}.png`;

          if (mode === 'pdf') pdf = addPdfPage(pdf, canvas);
          else if (mode === 'zip') zip.file(filename, await canvasToBlob(canvas));
          else await downloadBlob(await canvasToBlob(canvas), filename);

          exported += 1;
        } catch (error) {
          if (error instanceof CancelledError) throw error;
          failures.push(config.pageNum);
          console.error(`[Scribd exporter] page ${config.pageNum} failed:`, error);
        }

        // Loose PNGs download one per page, so give the browser time to register
        // each one; the bundled modes only need a cancellation checkpoint here.
        await cancellableDelay(mode === 'png' ? 200 : 0);
      }

      if (mode !== 'png') {
        if (!exported) throw new Error('No page could be rendered, so there is nothing to bundle');

        button.textContent = '...';
        button.title = mode === 'zip' ? 'Building the zip' : 'Building the PDF';

        const bundle = mode === 'zip'
          ? await generateZip(zip, (percent) => {
              button.textContent = `${Math.round(percent)}%`;
            })
          : pdf.output('blob');

        await downloadBlob(bundle, `scribd-${DOC_ID}.${mode}`);
      }

      const outcome = mode === 'png'
        ? `${exported} page${exported === 1 ? '' : 's'} exported to the browser download folder`
        : `${exported} page${exported === 1 ? '' : 's'} exported as scribd-${DOC_ID}.${mode}`;

      flashStatus(
        button,
        mode,
        failures.length ? `${failures.length}!` : 'Done',
        failures.length ? `${outcome} — failed pages: ${failures.join(', ')}` : outcome,
      );
    } catch (error) {
      if (!(error instanceof CancelledError)) throw error;

      flashStatus(
        button,
        mode,
        'Stop',
        `Stopped after ${exported} page${exported === 1 ? '' : 's'}`
          + (mode === 'png' ? '' : ' (nothing was saved)')
          + (failures.length ? ` (failed: ${failures.join(', ')})` : ''),
      );
      console.info(`[Scribd exporter] stopped after ${exported} pages`);
    } finally {
      stopRequested = false;
      button.disabled = false;
      siblings.forEach((sibling) => { sibling.disabled = false; });
      stopButton.disabled = false;
      stopButton.textContent = 'Stop';
      stopButton.style.display = 'none';
    }
  }

  // ---------------------------------------------------------------------------
  // UI
  // ---------------------------------------------------------------------------

  const BASE_BUTTON_STYLE = [
    'position:fixed',
    'right:16px',
    'z-index:2147483647',
    'width:54px',
    'height:40px',
    'border:1px solid #555',
    'border-radius:6px',
    'font:600 12px/1 Arial,sans-serif',
    'cursor:pointer',
    'box-shadow:0 2px 8px rgba(0,0,0,.25)',
  ];

  // A finished button keeps its result on screen briefly, then goes back to being
  // a labelled action button so the stack stays readable across runs.
  function flashStatus(button, mode, text, title) {
    button.textContent = text;
    button.title = title;

    setTimeout(() => {
      if (button.disabled) return; // another run has already claimed the button
      button.textContent = OUTPUTS[mode].label;
      button.title = OUTPUTS[mode].title;
    }, 6000);
  }

  function createActionButton(mode, offset) {
    const button = document.createElement('button');
    button.id = BUTTON_ID_PREFIX + mode;
    button.type = 'button';
    button.textContent = OUTPUTS[mode].label;
    button.title = OUTPUTS[mode].title;
    button.style.cssText = [
      ...BASE_BUTTON_STYLE,
      `bottom:${offset}px`,
      'background:#fff',
      'color:#111',
    ].join(';');

    return button;
  }

  function addButtons() {
    if (document.getElementById(BUTTON_ID_PREFIX + 'png')) return;

    const modes = ['png', 'zip', 'pdf'];
    const buttons = modes.map((mode, index) => createActionButton(mode, 16 + index * 46));

    const stopButton = document.createElement('button');
    stopButton.id = STOP_BUTTON_ID;
    stopButton.type = 'button';
    stopButton.textContent = 'Stop';
    stopButton.title = 'Stop the export after the current page';
    stopButton.style.cssText = [
      ...BASE_BUTTON_STYLE,
      `bottom:${16 + modes.length * 46}px`,
      'background:#c0392b',
      'color:#fff',
      'display:none',
    ].join(';');

    stopButton.addEventListener('click', () => {
      stopRequested = true;
      stopButton.disabled = true;
      stopButton.textContent = '...';
      stopButton.title = 'Stopping';
    });

    buttons.forEach((button, index) => {
      const mode = modes[index];
      const siblings = buttons.filter((other) => other !== button);

      button.addEventListener('click', () => {
        startExport(mode, button, siblings, stopButton).catch((error) => {
          stopRequested = false;
          button.disabled = false;
          siblings.forEach((sibling) => { sibling.disabled = false; });
          flashStatus(button, mode, '!', String(error?.message || error));
          stopButton.style.display = 'none';
          console.error('[Scribd exporter]', error);
        });
      });

      document.body.appendChild(button);
    });

    document.body.appendChild(stopButton);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addButtons, { once: true });
  } else {
    addButtons();
  }
})();
