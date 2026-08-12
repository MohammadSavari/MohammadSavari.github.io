---
layout: page
title: DownGit
permalink: /tools/downgit/
description: Download a single folder or file from a public GitHub repository as a zip, without cloning the whole repo.
nav: false
---

<!-- markdownlint-disable MD033 -->
<!-- pages/tools-downgit.md -->
<div class="post">

  <p>
    Originally created by <a href="https://github.com/MinhasKamal" target="_blank" rel="noopener">Minhas Kamal</a>
    as <a href="https://github.com/MinhasKamal/DownGit" target="_blank" rel="noopener">DownGit</a>
    (<a href="https://github.com/MinhasKamal/DownGit/blob/master/LICENSE" target="_blank" rel="noopener">MIT licensed</a>).
    This version has been rewritten and modified by me — the underlying idea (paste a GitHub folder or file link,
    get a zip back, all client-side) is the same, but the implementation is new and fixes a few issues in the
    original:
  </p>
  <ul>
    <li>Branch names containing a "/" no longer break the link parser.</li>
    <li>Large directories are no longer capped at 1,000 files.</li>
    <li>No dependency on a third-party CDN that has since gone offline.</li>
    <li>Rate-limit errors are shown clearly instead of failing silently.</li>
    <li>Downloads use a bounded number of parallel requests, so one failed file no longer hangs or corrupts the whole zip.</li>
  </ul>

  <div class="card">
    <div class="card-body">
      <div class="form-group">
        <label for="ghd-url">GitHub folder or file URL</label>
        <input type="url" class="form-control" id="ghd-url"
               placeholder="https://github.com/owner/repo/tree/branch/path/to/folder">
        <small class="form-text text-muted">
          Works with a folder link (<code>/tree/...</code>), a single file link (<code>/blob/...</code>), or a bare repo link.
        </small>
      </div>
      <button type="button" class="btn btn-primary" id="ghd-download-btn">Download</button>

      <div id="ghd-progress" class="progress mt-3" style="display: none; height: 1.5rem;">
        <div id="ghd-progress-bar" class="progress-bar" role="progressbar" style="width: 0%;"></div>
      </div>
      <div id="ghd-progress-text" class="small text-muted mt-1"></div>

      <div id="ghd-error" class="alert alert-danger mt-3" style="display: none;" role="alert"></div>
      <div id="ghd-warning" class="alert alert-warning mt-3" style="display: none;" role="alert"></div>
    </div>
  </div>

</div>

<script src="{{ '/assets/js/lib/jszip.min.js' | relative_url }}"></script>
<script src="{{ '/assets/js/lib/FileSaver.min.js' | relative_url }}"></script>
<script src="{{ '/assets/js/github-folder-downloader.js' | relative_url }}"></script>
