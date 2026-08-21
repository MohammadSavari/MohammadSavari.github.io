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
    document back as a single file — every page, in order, at Scribd's own image quality. Nothing to install:
    the whole thing runs on a bookmark you drag to your bookmarks bar once.
  </p>

  <div class="card">
    <div class="card-body">

      <p class="mb-3">
        <strong>Step 1 — once, ever.</strong> Drag this button to your bookmarks bar:
      </p>
      <p class="mb-1">
        <a id="sx-bookmarklet" class="btn btn-secondary" href="#" draggable="true"
           title="Drag me to the bookmarks bar">&#128229; Scribd Export</a>
        <button type="button" class="btn btn-sm btn-link" id="sx-copy-bm">or copy it</button>
      </p>
      <small class="form-text text-muted mb-4">
        No bookmarks bar? Press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>B</kbd> (<kbd>&#8984;</kbd>+<kbd>Shift</kbd>+<kbd>B</kbd> on a Mac) to show it.
        Clicking it here does nothing — it only works on a Scribd page.
      </small>

      <hr>

      <p class="mb-3"><strong>Step 2 — for each document.</strong></p>
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

      <button type="button" class="btn btn-primary" id="sx-go">Open document</button>

      <div id="sx-error" class="alert alert-danger mt-3" style="display: none;" role="alert"></div>
      <div id="sx-note" class="alert alert-info mt-3" style="display: none;" role="alert"></div>
    </div>
  </div>

  <p>
    The document opens in a new tab. Click your <strong>Scribd Export</strong> bookmark there and the export
    starts immediately in the format you picked — no second click, no panel to fiddle with. The file lands in
    your normal download folder as <code>scribd-&lt;id&gt;.pdf</code> or <code>scribd-&lt;id&gt;.zip</code>.
  </p>
  <p>
    You can also skip this page entirely: open any Scribd document and click the bookmark, and a small panel
    appears in the corner with PDF and ZIP buttons.
  </p>

  <h4>Why a bookmark, and not just this page</h4>
  <p>
    I tried to make this page do the whole job, and it can't — not for want of effort. The list of a document's
    pages exists only inside Scribd's own HTML; that response carries no <code>Access-Control-Allow-Origin</code>
    header, so no other website is permitted to read it. Routing it through a proxy doesn't help either: Scribd
    answers proxy and datacenter IPs with a bot challenge, which is what every public CORS proxy I tested came
    back with.
  </p>
  <p>
    What <em>does</em> work is code running inside the Scribd tab itself, where that same read is same-origin and
    comes from your own connection. A bookmarklet is the smallest possible way to do that — one bookmark, no
    extension, no permissions, no account, works in any browser. Everything after that step is ordinary: Scribd's
    image host serves the pages with <code>Access-Control-Allow-Origin: *</code>, so they can be fetched and
    assembled directly.
  </p>

  <h4>What you get</h4>
  <ul>
    <li>
      <strong>PDF</strong> — one file, one page per page, in order. Scribd's original page JPEGs are embedded
      as-is, with no re-encoding, so the PDF is the same quality as the source and only a few percent larger
      than the images it contains.
    </li>
    <li>
      <strong>ZIP</strong> — the same original images as <code>page-001.jpg</code>, <code>page-002.jpg</code>, …
      stored without recompression, since JPEGs don't get smaller by zipping them.
    </li>
    <li>
      Each page keeps its own size, so mixed portrait/landscape documents come out right. In the PDF one image
      pixel becomes one point; printing to a fixed paper size scales to fit.
    </li>
  </ul>

  <h4>Notes and limits</h4>
  <ul>
    <li>
      Most Scribd documents are one image per page, and those are copied across untouched. Older documents that
      lay real text over a partial image are detected and rendered instead, which is slower and less exact.
    </li>
    <li>
      It only exports what Scribd serves to your browser. Pages behind a paywall or a preview cutoff are never
      sent, so they can't be exported — the run reports what it found and the console lists any gaps.
    </li>
    <li>
      A long document is a big job: the file is assembled in memory before it saves, so give a 700-page document
      time and don't close the tab. A <strong>Stop</strong> button is there during a run; stopping saves nothing,
      since a single PDF or zip can only be written once every page is in hand.
    </li>
    <li>Scribd changes its markup from time to time; if the panel finds no pages, the script needs updating.</li>
    <li>Use it for documents you have the right to download, and respect Scribd's terms and the author's copyright.</li>
  </ul>

  <h4>Source</h4>
  <p>
    <a href="{{ '/assets/js/scribd-export.js' | relative_url }}">scribd-export.js</a>
    — the whole engine, which is exactly what the bookmark loads.
  </p>

  <pre id="sx-source" style="max-height: 28rem; overflow: auto;"><code>Loading source…</code></pre>

</div>

<script>
  (function () {
    var engine = '{{ "/assets/js/scribd-export.js" | absolute_url }}';
    var error = document.getElementById('sx-error');
    var note = document.getElementById('sx-note');

    // ---- the bookmarklet ----------------------------------------------------
    // Built here rather than written as a literal href so the HTML minifier never
    // sees a javascript: URL, and so it always points at this site's own engine.
    var code = "javascript:(function(){var s=document.createElement('script');"
      + "s.src='" + engine + "?v='+Date.now();document.body.appendChild(s);})();";

    var bookmarklet = document.getElementById('sx-bookmarklet');
    bookmarklet.href = code;
    bookmarklet.addEventListener('click', function (event) {
      event.preventDefault();
      show(note, 'Drag this button to your bookmarks bar instead of clicking it — it only does something '
        + 'once you click it while a Scribd document is open.');
    });

    document.getElementById('sx-copy-bm').addEventListener('click', function () {
      var button = this;
      navigator.clipboard.writeText(code).then(function () {
        button.textContent = 'copied — paste it as a bookmark URL';
        setTimeout(function () { button.textContent = 'or copy it'; }, 4000);
      });
    });

    // ---- the link box -------------------------------------------------------
    // Resolves the pasted link to a document id and opens it with the requested
    // format in the hash, which the engine reads to start straight away.
    var input = document.getElementById('sx-url');

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

    function openDocument() {
      var id = documentId(input.value);

      if (!id) {
        show(error, 'That does not look like a Scribd document link. Paste a link like '
          + 'https://www.scribd.com/document/123456789/title, or just the number.');
        return;
      }

      var mode = document.querySelector('input[name="sx-mode"]:checked').value;
      window.open('https://www.scribd.com/embeds/' + id + '/content#export=' + mode, '_blank', 'noopener');

      show(note, 'Opened document ' + id + ' in a new tab. Click your Scribd Export bookmark there and the '
        + mode.toUpperCase() + ' export starts on its own, saving as scribd-' + id + '.' + mode + '.');
    }

    document.getElementById('sx-go').addEventListener('click', openDocument);
    input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') openDocument();
    });

    // ---- source listing -----------------------------------------------------
    // Fetched from the served file, so it can never drift from what the bookmark
    // loads. The site-wide copy button (assets/js/copy_code.js) reads the block at
    // click time, so it needs no wiring here.
    var block = document.querySelector('#sx-source code');

    fetch('{{ "/assets/js/scribd-export.js" | relative_url }}')
      .then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.text();
      })
      .then(function (text) { block.textContent = text; })
      .catch(function () {
        block.textContent = 'Could not load the source here — open the link above instead.';
      });
  })();
</script>
