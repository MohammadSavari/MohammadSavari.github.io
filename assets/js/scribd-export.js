/**
 * Scribd Exporter — saves a whole Scribd document as one PDF or one ZIP.
 *
 * This file is the engine. It is injected into a scribd.com document tab by the
 * bookmarklet on /tools/scribd-exporter/, which is the only place it can run:
 * the list of a document's pages exists solely inside Scribd's own HTML, that
 * response carries no Access-Control-Allow-Origin header, and Scribd answers
 * proxy/datacenter IPs with a bot challenge. Running inside the tab makes that
 * read same-origin and sidesteps both problems.
 *
 * Once the page list is in hand the rest is plain CORS: html.scribdassets.com
 * serves both the page markup and the page images with Access-Control-Allow-Origin: *.
 */
(() => {
  'use strict';

  const PANEL_ID = 'scribd-exporter-panel';
  const CDN = {
    JSZip: 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
    jspdf: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    html2canvas: 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  };

  const existing = document.getElementById(PANEL_ID);
  if (existing) {
    existing.style.display = 'block';
    return;
  }

  // ---------------------------------------------------------------------------
  // Small helpers
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

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Could not load ${src}`));
      document.head.appendChild(script);
    });
  }

  // Libraries are pulled in only when a run actually needs them: a PDF run never
  // downloads JSZip, and neither touches html2canvas unless a page needs rendering.
  async function library(name) {
    if (name === 'jspdf' && window.jspdf?.jsPDF) return window.jspdf.jsPDF;
    if (window[name]) return window[name];

    await loadScript(CDN[name]);

    const resolved = name === 'jspdf' ? window.jspdf?.jsPDF : window[name];
    if (!resolved) throw new Error(`${name} loaded but did not register itself`);
    return resolved;
  }

  // ---------------------------------------------------------------------------
  // Page discovery
  // ---------------------------------------------------------------------------

  const DOC_ID = location.pathname.match(/\/(?:document|doc|presentation|book|embeds)\/(\d+)/i)?.[1]
    || 'document';

  /**
   * Every page's JSONP URL is already present in the served HTML, on both
   * /document/ and /embeds/ pages. The page image sits next to it under the same
   * token, so /pages/<n>-<token>.jsonp gives /images/<n>-<token>.jpg for free —
   * which is why the fast path below needs no per-page metadata request at all.
   */
  function collectPages() {
    const html = document.documentElement.innerHTML.replace(/\\\//g, '/');
    const byPageNum = new Map();

    const add = (raw, pageNum, kind) => {
      if (!Number.isInteger(pageNum) || pageNum < 1 || byPageNum.has(pageNum)) return;

      const url = new URL(raw.startsWith('//') ? `https:${raw}` : raw, location.href);
      url.protocol = 'https:';
      if (url.hostname === 'html.scribd.com') url.hostname = 'html.scribdassets.com';

      const href = url.href;
      byPageNum.set(pageNum, {
        pageNum,
        jsonpUrl: kind === 'jsonp' ? href : href.replace('/images/', '/pages/').replace(/\.jpg$/, '.jsonp'),
        imageUrl: kind === 'jsonp' ? href.replace('/pages/', '/images/').replace(/\.jsonp$/, '.jpg') : href,
      });
    };

    // Most pages are listed as JSONP URLs. The embed view inlines its first few
    // pages instead, listing only their image URL, so both shapes have to be read
    // or those opening pages go missing.
    for (const entry of html.matchAll(/(?:https?:)?\/\/[^"'\s\\]*?\/pages\/(\d+)-[a-f0-9]+\.jsonp/gi)) {
      add(entry[0], Number(entry[1]), 'jsonp');
    }
    for (const entry of html.matchAll(/(?:https?:)?\/\/[^"'\s\\]*?\/images\/(\d+)-[a-f0-9]+\.jpg/gi)) {
      add(entry[0], Number(entry[1]), 'image');
    }

    return [...byPageNum.values()].sort((a, b) => a.pageNum - b.pageNum);
  }

  function detectPageCount() {
    const patterns = [
      /"page_count"\s*:\s*(\d+)/i,
      /\bpageCount\b["']?\s*[:=]\s*["']?(\d+)/i,
      /\bnum_pages\b["']?\s*[:=]\s*["']?(\d+)/i,
    ];
    const html = document.documentElement.innerHTML;

    for (const pattern of patterns) {
      const value = Number(html.match(pattern)?.[1]);
      if (Number.isInteger(value) && value > 0) return value;
    }

    return null;
  }

  // Scribd loads long documents lazily; nudging the scroll makes it emit the rest
  // of the page list. Most documents ship the whole list up front and skip this.
  async function gatherPages(onProgress) {
    const expected = detectPageCount();
    let pages = collectPages();

    for (let attempt = 0; attempt < 12 && expected && pages.length < expected; attempt += 1) {
      throwIfStopped();
      onProgress(pages.length, expected);

      const scroller = document.scrollingElement || document.body;
      const previous = scroller.scrollTop;
      scroller.scrollTop = scroller.scrollHeight;
      window.dispatchEvent(new Event('scroll'));
      await delay(400);
      scroller.scrollTop = previous;

      const found = collectPages();
      if (found.length === pages.length) break; // nothing new is arriving
      pages = found;
    }

    if (!pages.length) {
      throw new Error('No pages found here. Open the document itself (or its /embeds/<id>/content view) and click the bookmark again.');
    }

    onProgress(pages.length, expected);
    return { pages, expected };
  }

  // ---------------------------------------------------------------------------
  // Getting one page
  // ---------------------------------------------------------------------------

  async function fetchBlob(url) {
    const response = await fetch(url, { credentials: 'omit' });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    return response.blob();
  }

  async function measure(blob) {
    const url = URL.createObjectURL(blob);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      return { width: image.naturalWidth, height: image.naturalHeight };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

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

  async function fetchMarkup(page) {
    const response = await fetch(page.jsonpUrl, { credentials: 'omit' });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${page.jsonpUrl}`);
    return parseJsonpMarkup(await response.text());
  }

  function absoluteImageUrl(source) {
    const url = new URL(source, location.href);
    url.protocol = 'https:';
    if (url.hostname === 'html.scribd.com') url.hostname = 'html.scribdassets.com';
    return url.href;
  }

  // "left:31px;top:584px;width:238px" -> { left: 31, top: 584, width: 238 }
  function styleLengths(style) {
    const lengths = {};

    for (const [, name, value] of (style || '').matchAll(/([a-z-]+)\s*:\s*(-?[\d.]+)px/gi)) {
      lengths[name.toLowerCase()] = Number(value);
    }

    return lengths;
  }

  /**
   * A page qualifies for the fast path only if it is exactly one image that covers
   * the whole page. That rules out the older layout, where Scribd packs regions of
   * several pages into one sprite and positions clipped copies of it over real text —
   * there the image alone is not the page, and the text would be lost.
   */
  function looksImageOnly(markup) {
    const page = styleLengths(markup.match(/<div[^>]*class=["']?newpage[^>]*style=["']([^"']+)["']/i)?.[1]);
    if (!page.width || !page.height) return false;

    const images = markup.match(/<img[^>]*>/gi) || [];
    if (images.length !== 1) return false;

    const style = images[0].match(/style=["']([^"']+)["']/i)?.[1] || '';
    const box = styleLengths(style);
    const clip = style.match(/clip\s*:\s*rect\(\s*(-?[\d.]+)px[ ,]+\s*(-?[\d.]+)px[ ,]+\s*(-?[\d.]+)px[ ,]+\s*(-?[\d.]+)px\s*\)/i);

    const width = clip ? Number(clip[2]) - Number(clip[4]) : box.width;
    const height = clip ? Number(clip[3]) - Number(clip[1]) : box.height;
    if (!width || !height) return false;

    return (width * height) / (page.width * page.height) >= 0.95;
  }

  /**
   * Sampled rather than assumed from page one: a document can open with a full-page
   * cover scan and switch to the sprite layout later, and guessing wrong there would
   * quietly save sprite fragments instead of pages.
   */
  async function detectFastPath(pages) {
    const sample = [...new Set([0, Math.floor(pages.length / 2), pages.length - 1])];

    for (const index of sample) {
      try {
        if (!looksImageOnly(await fetchMarkup(pages[index]))) return false;
      } catch (error) {
        console.warn('[Scribd exporter] page probe failed, rendering instead:', error);
        return false;
      }
    }

    return true;
  }

  // Fast path: Scribd's own JPEG, untouched.
  async function grabPageImage(page) {
    let blob;
    try {
      blob = await fetchBlob(page.imageUrl);
    } catch (error) {
      // The derived URL is a convention, not a promise — fall back to the real one.
      const markup = await fetchMarkup(page);
      const source = markup.match(/\borig=["']([^"']+)["']/i)?.[1]
        || markup.match(/<img[^>]*\bsrc=["']([^"']+)["']/i)?.[1];
      if (!source) throw error;
      blob = await fetchBlob(absoluteImageUrl(source));
    }

    if (!blob.type.startsWith('image/')) throw new Error('Page did not come back as an image');
    return { blob, format: 'JPEG', extension: 'jpg', ...(await measure(blob)) };
  }

  /**
   * Scribd packs several regions of a page into one sprite image and shows the right
   * slice of it with the legacy CSS `clip: rect(...)` property. html2canvas does not
   * implement `clip`, so without this every slice draws at full size and the same
   * image appears several times on the page. Re-express each clip as a wrapper div
   * with overflow:hidden, which html2canvas does understand.
   */
  function normalizeLegacyImageClip(image) {
    const style = getComputedStyle(image);
    const clip = style.clip.match(
      /^rect\(\s*(-?[\d.]+)px[ ,]+\s*(-?[\d.]+)px[ ,]+\s*(-?[\d.]+)px[ ,]+\s*(-?[\d.]+)px\s*\)$/i,
    );
    if (!clip) return;

    const [top, right, bottom, left] = clip.slice(1, 5).map(Number);
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

  // Slow path: rebuild the page offscreen and rasterise it.
  async function renderPage(page) {
    const html2canvas = await library('html2canvas');
    const markup = await fetchMarkup(page);

    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-100000px;top:0;visibility:visible;pointer-events:none';
    host.innerHTML = markup;
    document.body.appendChild(host);

    try {
      const node = host.querySelector('.newpage') || host.firstElementChild;
      if (!node) throw new Error('Rendered page container is missing');

      for (const image of node.querySelectorAll('img')) {
        throwIfStopped();
        const source = image.getAttribute('orig') || image.getAttribute('src');
        if (!source || source.startsWith('data:')) continue;

        image.crossOrigin = 'anonymous';
        image.src = absoluteImageUrl(source);
        await image.decode().catch(() => {});

        // Needs the decoded image in the document: the clip is read off computed style.
        normalizeLegacyImageClip(image);
      }

      const width = Math.round(parseFloat(node.style.width) || node.offsetWidth);
      const height = Math.round(parseFloat(node.style.height) || node.offsetHeight);
      if (!width || !height) throw new Error('Page has no measurable size');

      const canvas = await html2canvas(node, {
        backgroundColor: '#fff',
        logging: false,
        scale: 1,
        useCORS: true,
        width,
        height,
        windowWidth: width,
        windowHeight: height,
      });

      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((result) => result ? resolve(result) : reject(new Error('PNG creation failed')), 'image/png');
      });

      return { blob, format: 'PNG', extension: 'png', width: canvas.width, height: canvas.height };
    } finally {
      host.remove();
    }
  }

  // ---------------------------------------------------------------------------
  // Output
  // ---------------------------------------------------------------------------

  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      link.remove();
      URL.revokeObjectURL(url);
    }, 1000);
  }

  // One rendered pixel becomes one PDF point, so each page keeps the aspect ratio
  // it was captured at and mixed portrait/landscape documents stay correct.
  function addPdfPage(JsPDF, pdf, bytes, page) {
    const orientation = page.width > page.height ? 'landscape' : 'portrait';

    if (pdf) pdf.addPage([page.width, page.height], orientation);
    else pdf = new JsPDF({ unit: 'pt', format: [page.width, page.height], orientation, compress: true });

    // Raw bytes rather than a data URL: the original JPEG is embedded as-is, with
    // no re-encoding, no base64 inflation, and no quality loss.
    pdf.addImage(bytes, page.format, 0, 0, page.width, page.height);
    return pdf;
  }

  // ---------------------------------------------------------------------------
  // Driver
  // ---------------------------------------------------------------------------

  async function run(mode, ui) {
    stopRequested = false;
    ui.busy(true);

    const failures = [];
    let exported = 0;

    try {
      ui.status('Finding pages…');
      const { pages, expected } = await gatherPages((count, total) => {
        ui.status(`Finding pages… ${count}${total ? ` of ${total}` : ''}`);
      });

      if (expected && pages.length < expected) {
        console.warn(`[Scribd exporter] found ${pages.length} of ${expected} pages`);
      }

      ui.status('Checking page format…');
      const imageOnly = await detectFastPath(pages);
      console.info(`[Scribd exporter] ${pages.length} pages, ${imageOnly ? 'image' : 'render'} mode`);

      const JSZip = mode === 'zip' ? await library('JSZip') : null;
      const JsPDF = mode === 'pdf' ? await library('jspdf') : null;
      const zip = JSZip ? new JSZip() : null;
      const digits = Math.max(3, String(pages[pages.length - 1].pageNum).length);
      let pdf = null;

      for (const [index, page] of pages.entries()) {
        throwIfStopped();
        ui.status(`Page ${index + 1} of ${pages.length}`, (index / pages.length) * 100);

        try {
          const captured = imageOnly ? await grabPageImage(page) : await renderPage(page);
          const name = `page-${String(page.pageNum).padStart(digits, '0')}.${captured.extension}`;

          if (mode === 'zip') zip.file(name, captured.blob);
          else pdf = addPdfPage(JsPDF, pdf, new Uint8Array(await captured.blob.arrayBuffer()), captured);

          exported += 1;
        } catch (error) {
          if (error instanceof CancelledError) throw error;
          failures.push(page.pageNum);
          console.error(`[Scribd exporter] page ${page.pageNum} failed:`, error);
        }
      }

      if (!exported) throw new Error('No page could be saved. Scribd may not be serving this document.');

      const filename = `scribd-${DOC_ID}.${mode}`;
      ui.status(mode === 'zip' ? 'Packing the zip…' : 'Building the PDF…', 100);

      // PNG and JPEG are already compressed, so deflating them again only costs time.
      const bundle = mode === 'zip'
        ? await zip.generateAsync({ type: 'blob', compression: 'STORE' }, (meta) => {
            ui.status(`Packing the zip… ${Math.round(meta.percent)}%`, meta.percent);
          })
        : pdf.output('blob');

      download(bundle, filename);
      ui.done(`Saved ${filename} — ${exported} page${exported === 1 ? '' : 's'}`
        + (failures.length ? `, ${failures.length} failed (${failures.join(', ')})` : ''));
    } catch (error) {
      if (error instanceof CancelledError) {
        ui.done(`Stopped after ${exported} page${exported === 1 ? '' : 's'}; nothing was saved.`);
      } else {
        console.error('[Scribd exporter]', error);
        ui.fail(String(error?.message || error));
      }
    } finally {
      stopRequested = false;
      ui.busy(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Panel
  // ---------------------------------------------------------------------------

  function buildPanel() {
    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.style.cssText = [
      'position:fixed', 'right:16px', 'bottom:16px', 'z-index:2147483647',
      'width:260px', 'padding:14px', 'box-sizing:border-box',
      'background:#fff', 'color:#111', 'border:1px solid #d0d0d0', 'border-radius:10px',
      'font:13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif',
      'box-shadow:0 6px 24px rgba(0,0,0,.22)',
    ].join(';');

    panel.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <strong style="font-size:13px">Scribd Exporter</strong>
        <button type="button" data-act="close" aria-label="Close"
          style="border:0;background:none;font-size:18px;line-height:1;cursor:pointer;color:#888;padding:0">&times;</button>
      </div>
      <div data-el="buttons" style="display:flex;gap:8px">
        <button type="button" data-act="pdf" style="flex:1;padding:9px 0;border:1px solid #bbb;border-radius:6px;background:#f7f7f7;color:#111;font-weight:600;cursor:pointer">PDF</button>
        <button type="button" data-act="zip" style="flex:1;padding:9px 0;border:1px solid #bbb;border-radius:6px;background:#f7f7f7;color:#111;font-weight:600;cursor:pointer">ZIP</button>
      </div>
      <button type="button" data-act="stop" style="display:none;width:100%;margin-top:8px;padding:9px 0;border:1px solid #c0392b;border-radius:6px;background:#c0392b;color:#fff;font-weight:600;cursor:pointer">Stop</button>
      <div data-el="status" style="margin-top:10px;color:#555;min-height:18px">Choose a format.</div>
      <div data-el="track" style="margin-top:8px;height:4px;border-radius:2px;background:#eee;overflow:hidden">
        <div data-el="bar" style="height:100%;width:0;background:#2a6fdb;transition:width .2s"></div>
      </div>`;

    document.body.appendChild(panel);

    const find = (name) => panel.querySelector(`[data-el="${name}"]`);
    const action = (name) => panel.querySelector(`[data-act="${name}"]`);

    const ui = {
      status(text, percent) {
        find('status').textContent = text;
        find('status').style.color = '#555';
        if (typeof percent === 'number') find('bar').style.width = `${Math.min(100, percent)}%`;
      },
      done(text) {
        find('status').textContent = text;
        find('status').style.color = '#1a7f37';
        find('bar').style.width = '100%';
      },
      fail(text) {
        find('status').textContent = text;
        find('status').style.color = '#c0392b';
        find('bar').style.width = '0';
      },
      busy(isBusy) {
        action('pdf').disabled = isBusy;
        action('zip').disabled = isBusy;
        find('buttons').style.opacity = isBusy ? '.5' : '1';
        action('stop').style.display = isBusy ? 'block' : 'none';
        action('stop').disabled = false;
        action('stop').textContent = 'Stop';
        if (!isBusy) return;
        find('bar').style.width = '0';
      },
    };

    action('pdf').addEventListener('click', () => run('pdf', ui));
    action('zip').addEventListener('click', () => run('zip', ui));
    action('close').addEventListener('click', () => panel.remove());
    action('stop').addEventListener('click', () => {
      stopRequested = true;
      action('stop').disabled = true;
      action('stop').textContent = 'Stopping…';
    });

    return ui;
  }

  const ui = buildPanel();

  // A link from the tool page can ask for a format up front: .../content#export=pdf
  const requested = location.hash.match(/^#export=(pdf|zip)$/i)?.[1].toLowerCase();
  if (requested) run(requested, ui);
})();
