---
layout: page
title: Scribd Exporter
permalink: /tools/scribd-exporter/
description: A userscript that saves every page of a Scribd document as PNG files, one zip, or one PDF.
nav: false
---

<!-- markdownlint-disable MD033 -->
<!-- pages/tools-scribd.md -->
<div class="post">

  <p>
    A browser userscript that walks through a Scribd document page by page, renders each complete page, and
    hands you the result in whichever shape you want: a folder full of numbered PNGs, a single zip named after
    the document, or a single PDF. No screenshotting, no page-by-page right-clicking.
  </p>

  <p>
    Unlike the other tools here, this one can't run as a button on this page: it has to execute
    <em>on</em> scribd.com, and it needs to fetch page images from Scribd's asset servers, which the
    browser's same-origin policy blocks for an ordinary website. A userscript manager grants exactly that
    privilege (<code>GM_xmlhttpRequest</code>), so the script is installed into your browser instead of
    hosted as a web app.
  </p>

  <h4>Install</h4>
  <ol>
    <li>
      Install a userscript manager —
      <a href="https://www.tampermonkey.net/" target="_blank" rel="noopener">Tampermonkey</a>
      (Chrome, Edge, Firefox, Safari) or
      <a href="https://violentmonkey.github.io/" target="_blank" rel="noopener">Violentmonkey</a>.
    </li>
    <li>
      Click the button below. Your userscript manager will intercept the <code>.user.js</code> file and
      show its install screen; confirm the install. It also fetches and caches three libraries —
      <a href="https://html2canvas.hertzen.com/" target="_blank" rel="noopener">html2canvas</a> to turn each
      page into an image, <a href="https://stuk.github.io/jszip/" target="_blank" rel="noopener">JSZip</a>
      for the zip, and <a href="https://github.com/parallax/jsPDF" target="_blank" rel="noopener">jsPDF</a>
      for the PDF.
    </li>
    <li>
      On Chrome and Edge, you may also need to enable <em>Developer mode</em> (Chrome) or
      <em>Allow user scripts</em> (Edge) in the extensions settings — Tampermonkey will tell you if so.
    </li>
  </ol>

  <p>
    <a class="btn btn-primary" href="{{ '/assets/js/scribd-page-exporter.user.js' | relative_url }}">
      Install userscript
    </a>
  </p>

  <h4>Use it</h4>
  <ol>
    <li>
      Open any Scribd document URL (<code>/document/…</code>, <code>/doc/…</code>,
      <code>/presentation/…</code>, or <code>/book/…</code>). The script redirects you to Scribd's own embed
      view of the same document, which serves the page markup in a form it can render.
    </li>
    <li>
      Pick an output from the button stack in the bottom-right corner:
      <ul>
        <li><strong>PNG</strong> — one file per page, <code>page-001.png</code>, <code>page-002.png</code>, …, downloaded as they render.</li>
        <li><strong>ZIP</strong> — those same PNGs bundled into <code>scribd-&lt;id&gt;.zip</code>, where <code>&lt;id&gt;</code> is the document's numeric id from the URL. One download instead of hundreds.</li>
        <li><strong>PDF</strong> — every page in one <code>scribd-&lt;id&gt;.pdf</code>, one image per PDF page, in order.</li>
      </ul>
    </li>
    <li>
      Whichever you click becomes the progress display: first a <code>found/expected</code> counter while it
      scrolls the document to discover pages, then <code>current/total</code> while it renders them, then
      (for ZIP) a percentage while the archive is packed. A red <strong>Stop</strong> button appears above the
      stack and halts the run after the current page.
    </li>
    <li>
      In <strong>PNG</strong> mode the first file may raise your browser's "allow multiple downloads?" prompt —
      allow it, or nothing after page one will be saved. ZIP and PDF produce a single download and never hit that
      prompt.
    </li>
    <li>
      When it finishes, the button reads <strong>Done</strong> and then goes back to its label. If some pages
      failed it shows a failure count instead — hover it for the page numbers, and check the browser console for
      the reason.
    </li>
  </ol>

  <h4>Notes and limits</h4>
  <ul>
    <li>Pages are rendered at their native embed size (scale 1), and numbered by real page number, so a gap in the export is a gap Scribd didn't serve.</li>
    <li>
      Stopping a ZIP or PDF run saves nothing — those formats can only be written once every page is in hand.
      Stopping a PNG run keeps every page already downloaded.
    </li>
    <li>
      In the PDF, one canvas pixel becomes one PDF point, so each page keeps the aspect ratio it was rendered at
      and pages of different sizes stay correct relative to each other. Printing to a fixed paper size scales to fit.
    </li>
    <li>
      ZIP and PDF hold the whole document in memory before saving, so a several-hundred-page document is
      correspondingly heavy — PNG mode streams to disk page by page and stays flat.
    </li>
    <li>
      Loose PNGs are named by page number only, so exporting two documents into the same download folder will
      collide — another reason to prefer ZIP, which carries the document id in its name.
    </li>
    <li>
      It only exports what Scribd actually serves to your browser. Pages behind a paywall or a preview cutoff
      are not served, so they can't be exported — the run just ends early or reports gaps in the console.
    </li>
    <li>
      Page discovery reads three sources (lazy-load <code>addPage</code> calls, JSONP page URLs, and live DOM
      pages) and prefers whichever is most reliable per page, so it still works when Scribd only partially
      hydrates a long document.
    </li>
    <li>Scribd changes its embed markup from time to time; if discovery finds zero pages, the script needs updating.</li>
    <li>Use it for documents you have the right to download, and respect Scribd's terms and the author's copyright.</li>
  </ul>

  <h4>Source</h4>
  <p>
    <a href="{{ '/assets/js/scribd-page-exporter.user.js' | relative_url }}">
      scribd-page-exporter.user.js
    </a>
    — the same file the install button points at, so your userscript manager can also auto-update from it.
  </p>

  <pre id="sx-source" style="max-height: 28rem; overflow: auto;"><code>Loading source…</code></pre>

</div>

<script>
  // The source shown below is fetched from the served file rather than pasted into this page,
  // so it can never drift from what the install button hands your userscript manager.
  // The site-wide copy button (assets/js/copy_code.js) reads the block at click time, so it
  // picks up the fetched text without any extra wiring here.
  (function () {
    var block = document.querySelector('#sx-source code');

    fetch('{{ '/assets/js/scribd-page-exporter.user.js' | relative_url }}')
      .then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.text();
      })
      .then(function (text) {
        block.textContent = text;
      })
      .catch(function () {
        block.textContent = 'Could not load the source here — open the link above instead.';
      });
  })();
</script>
