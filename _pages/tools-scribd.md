---
layout: page
title: Scribd Exporter
permalink: /tools/scribd-exporter/
description: Paste a Scribd link and get the whole document back as one PDF, or one zip of page images.
nav: false
---

<!-- markdownlint-disable MD033 -->
<!-- pages/tools-scribd.md -->
<div class="post">

  <p>
    Paste a Scribd document link, pick <strong>PDF</strong> or <strong>ZIP</strong>, and get the whole
    document back as a single file — every page, in order, no page-by-page screenshotting.
  </p>

  <div class="card">
    <div class="card-body">
      <div class="form-group">
        <label for="sx-url">Scribd document URL</label>
        <input type="url" class="form-control" id="sx-url"
               placeholder="https://www.scribd.com/document/123456789/some-title">
        <small class="form-text text-muted">
          A <code>/document/</code>, <code>/doc/</code>, <code>/presentation/</code>, or <code>/book/</code>
          link — an <code>/embeds/</code> link or the bare numeric id work too.
        </small>
      </div>

      <div class="form-group">
        <label class="d-block">Output</label>
        <div class="form-check form-check-inline">
          <input class="form-check-input" type="radio" name="sx-mode" id="sx-mode-pdf" value="pdf" checked>
          <label class="form-check-label" for="sx-mode-pdf">One PDF</label>
        </div>
        <div class="form-check form-check-inline">
          <input class="form-check-input" type="radio" name="sx-mode" id="sx-mode-zip" value="zip">
          <label class="form-check-label" for="sx-mode-zip">One ZIP of page images</label>
        </div>
      </div>

      <button type="button" class="btn btn-primary" id="sx-go">Export</button>

      <div id="sx-error" class="alert alert-danger mt-3" style="display: none;" role="alert"></div>
      <div id="sx-note" class="alert alert-info mt-3" style="display: none;" role="alert"></div>
    </div>
  </div>

  <h4>How this one works — and why it needs the userscript</h4>
  <p>
    The other tools here do their work on this page. This one can't, and the reason is worth stating plainly:
    the list of a document's pages exists only inside Scribd's own embed HTML, that response carries no
    <code>Access-Control-Allow-Origin</code> header, and Scribd answers requests from proxy and datacenter IPs
    with a bot challenge. So no page on this site — and no public CORS proxy — can read it. Only code running
    <em>in your browser, on scribd.com, as you</em> can.
  </p>
  <p>
    That's what the userscript is. The box above doesn't download anything itself: it opens the document's embed
    view in a new tab and asks the userscript to export it there. The file lands in your normal download folder.
    Once the userscript is installed you can also skip this page entirely and use the buttons it adds to any
    Scribd document.
  </p>

  <h4>Install the userscript (once)</h4>
  <ol>
    <li>
      Install a userscript manager —
      <a href="https://www.tampermonkey.net/" target="_blank" rel="noopener">Tampermonkey</a>
      (Chrome, Edge, Firefox, Safari) or
      <a href="https://violentmonkey.github.io/" target="_blank" rel="noopener">Violentmonkey</a>.
    </li>
    <li>
      Click the button below and confirm the install screen. It also fetches and caches three libraries —
      <a href="https://html2canvas.hertzen.com/" target="_blank" rel="noopener">html2canvas</a> to render each
      page, <a href="https://github.com/parallax/jsPDF" target="_blank" rel="noopener">jsPDF</a> for the PDF,
      and <a href="https://stuk.github.io/jszip/" target="_blank" rel="noopener">JSZip</a> for the zip.
    </li>
    <li>
      On Chrome and Edge you may also need to switch on <em>Developer mode</em> (Chrome) or
      <em>Allow user scripts</em> (Edge) in the extensions settings — Tampermonkey will say so if it's needed.
    </li>
  </ol>

  <p>
    <a class="btn btn-primary" href="{{ '/assets/js/scribd-page-exporter.user.js' | relative_url }}">
      Install userscript
    </a>
  </p>

  <h4>What happens after you click Export</h4>
  <ol>
    <li>A new tab opens on Scribd's embed view of the document, and the export starts on its own after a moment.</li>
    <li>
      A button in the bottom-right corner of that tab is the progress display: a <code>found/expected</code>
      counter while it scrolls the document to discover pages, then <code>current/total</code> while it renders
      them, then (for ZIP) a percentage while the archive is packed.
    </li>
    <li>
      The finished file downloads as <code>scribd-&lt;id&gt;.pdf</code> or <code>scribd-&lt;id&gt;.zip</code>,
      named with the document's id from the URL. One file per run, so the browser's "allow multiple downloads?"
      prompt never appears.
    </li>
    <li>
      A red <strong>Stop</strong> button sits above the export button during a run. Stopping saves nothing —
      a single PDF or zip can only be written once every page is in hand.
    </li>
    <li>
      If nothing happens in the new tab, the userscript isn't installed or isn't enabled for scribd.com.
    </li>
  </ol>

  <h4>Notes and limits</h4>
  <ul>
    <li>Pages are rendered at their native embed size and kept in document order, so a gap in the output is a gap Scribd didn't serve.</li>
    <li>
      In the PDF, one rendered pixel becomes one PDF point, so every page keeps the aspect ratio it was rendered
      at and mixed portrait/landscape documents stay correct. Printing to a fixed paper size scales to fit.
    </li>
    <li>
      Both outputs hold the whole document in memory before saving, so a several-hundred-page document is a
      heavy job — give it time and don't close the tab.
    </li>
    <li>
      It only exports what Scribd actually serves to your browser. Pages behind a paywall or a preview cutoff
      are never sent, so they can't be exported — the run just ends early or reports gaps in the console.
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
  (function () {
    // ---- link handoff -------------------------------------------------------
    // This page can't fetch the document itself (see the explanation above), so it
    // resolves the pasted link to a document id and asks the userscript to do the
    // export in a tab on scribd.com, via an #export= hash it knows how to read.
    var input = document.getElementById('sx-url');
    var button = document.getElementById('sx-go');
    var error = document.getElementById('sx-error');
    var note = document.getElementById('sx-note');

    function documentId(value) {
      var text = (value || '').trim();
      if (/^\d+$/.test(text)) return text;

      var match = text.match(/\/(?:document|doc|presentation|book)\/(\d+)/i)
        || text.match(/\/embeds\/(\d+)/i);

      return match ? match[1] : null;
    }

    function show(element, message) {
      error.style.display = 'none';
      note.style.display = 'none';
      element.textContent = message;
      element.style.display = 'block';
    }

    function exportDocument() {
      var id = documentId(input.value);

      if (!id) {
        show(error, 'That does not look like a Scribd document link. Paste a link like '
          + 'https://www.scribd.com/document/123456789/title, or just the number.');
        return;
      }

      var mode = document.querySelector('input[name="sx-mode"]:checked').value;
      window.open('https://www.scribd.com/embeds/' + id + '/content#export=' + mode, '_blank', 'noopener');

      show(note, 'Opened document ' + id + ' in a new tab. The ' + mode.toUpperCase() + ' export starts there '
        + 'by itself and downloads as scribd-' + id + '.' + mode + ' when it finishes. If nothing happens in '
        + 'that tab, the userscript is not installed or not enabled for scribd.com.');
    }

    button.addEventListener('click', exportDocument);
    input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') exportDocument();
    });

    // ---- source listing -----------------------------------------------------
    // Fetched from the served file rather than pasted in, so it can never drift from
    // what the install button hands your userscript manager. The site-wide copy button
    // (assets/js/copy_code.js) reads the block at click time, so it needs no wiring here.
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
