// GitHub folder/file downloader. Inspired by DownGit (github.com/MinhasKamal/DownGit, MIT),
// rewritten to use the Git Trees API, a branch-aware URL parser, bounded-concurrency fetches,
// and visible rate-limit/failure reporting instead of DownGit's known failure modes there.
(function () {
  'use strict';

  var API_ROOT = 'https://api.github.com';
  var CONCURRENCY = 6;

  var els = {};

  function initEls() {
    els.url = document.getElementById('ghd-url');
    els.btn = document.getElementById('ghd-download-btn');
    els.progressWrap = document.getElementById('ghd-progress');
    els.progressBar = document.getElementById('ghd-progress-bar');
    els.progressText = document.getElementById('ghd-progress-text');
    els.error = document.getElementById('ghd-error');
    els.warning = document.getElementById('ghd-warning');
  }

  function resetUI() {
    els.error.style.display = 'none';
    els.error.textContent = '';
    els.warning.style.display = 'none';
    els.warning.innerHTML = '';
    els.progressWrap.style.display = 'none';
    els.progressBar.style.width = '0%';
    els.progressText.textContent = '';
  }

  function renderError(message) {
    els.error.textContent = message;
    els.error.style.display = 'block';
  }

  function renderWarning(message) {
    var line = document.createElement('div');
    line.textContent = message;
    els.warning.appendChild(line);
    els.warning.style.display = 'block';
  }

  function renderProgress(done, total) {
    els.progressWrap.style.display = 'block';
    var pct = total > 0 ? Math.round((done / total) * 100) : 0;
    els.progressBar.style.width = pct + '%';
    els.progressText.textContent = done + ' of ' + total + ' files';
  }

  function setBusy(isBusy) {
    els.btn.disabled = isBusy;
    els.btn.textContent = isBusy ? 'Downloading…' : 'Download';
  }

  // ---- URL parsing ----

  function parseGitHubUrl(rawUrl) {
    var url;
    try {
      url = new URL(String(rawUrl).trim());
    } catch (e) {
      throw new Error('That doesn\'t look like a valid URL.');
    }
    if (!/(^|\.)github\.com$/.test(url.hostname)) {
      throw new Error('Please paste a github.com URL.');
    }
    var segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    if (segments.length < 2) {
      throw new Error('URL must include a repository owner and name, e.g. github.com/owner/repo.');
    }
    var owner = segments[0];
    var repo = segments[1];

    if (segments.length === 2) {
      return { mode: 'whole-repo', owner: owner, repo: repo };
    }

    var kind = segments[2];
    if (kind !== 'tree' && kind !== 'blob') {
      throw new Error('Only "tree" (folder) and "blob" (file) GitHub links are supported.');
    }
    if (segments.length < 4) {
      throw new Error('URL is missing a branch name.');
    }
    return {
      mode: kind,
      owner: owner,
      repo: repo,
      refCandidate: segments.slice(3).join('/')
    };
  }

  // ---- GitHub API helpers ----

  function checkRateLimit(response) {
    if (response.status === 403 && response.headers.get('X-RateLimit-Remaining') === '0') {
      var resetHeader = response.headers.get('X-RateLimit-Reset');
      var resetMsg = '';
      if (resetHeader) {
        var resetDate = new Date(parseInt(resetHeader, 10) * 1000);
        resetMsg = ' It resets at ' + resetDate.toLocaleTimeString() + '.';
      }
      throw new Error(
        'GitHub API rate limit exceeded (60 requests/hour for unauthenticated users).' + resetMsg + ' Try again later.'
      );
    }
    return response;
  }

  function githubFetch(path) {
    return fetch(API_ROOT + path).then(checkRateLimit);
  }

  function fetchAllBranches(owner, repo) {
    var branches = [];
    function fetchPage(page) {
      return githubFetch('/repos/' + owner + '/' + repo + '/branches?per_page=100&page=' + page)
        .then(function (response) {
          if (!response.ok) {
            throw new Error('Could not list branches for ' + owner + '/' + repo + ' (HTTP ' + response.status + ').');
          }
          return response.json();
        })
        .then(function (pageBranches) {
          branches = branches.concat(pageBranches);
          return pageBranches.length === 100 ? fetchPage(page + 1) : branches;
        });
    }
    return fetchPage(1);
  }

  // Fixes DownGit #19 (branch names containing "/" break naive URL splitting) by resolving
  // against the repo's real branch list instead of assuming one path segment is the branch.
  function resolveBranch(owner, repo, refCandidate) {
    return fetchAllBranches(owner, repo)
      .then(function (branches) {
        var names = branches.map(function (b) { return b.name; })
          .sort(function (a, b) { return b.length - a.length; });
        for (var i = 0; i < names.length; i++) {
          var name = names[i];
          if (refCandidate === name || refCandidate.indexOf(name + '/') === 0) {
            return { branch: name, path: refCandidate.slice(name.length).replace(/^\//, '') };
          }
        }
        throw new Error('Could not find a branch matching "' + refCandidate + '" in ' + owner + '/' + repo + '.');
      })
      .catch(function (err) {
        if (err && err.message && err.message.indexOf('Could not list branches') === 0) {
          renderWarning(
            'Could not verify the branch name against ' + owner + '/' + repo +
            '\'s branch list, falling back to a best guess — this may be wrong if the branch name contains a "/".'
          );
          var parts = refCandidate.split('/');
          return { branch: parts[0], path: parts.slice(1).join('/') };
        }
        throw err;
      });
  }

  // Fixes DownGit #63 (Contents API caps at 1000 entries/directory) by using the recursive
  // Git Trees API instead, and surfaces GitHub's own truncation flag rather than hiding it.
  function listTreeRecursive(owner, repo, branch, targetPath) {
    return githubFetch('/repos/' + owner + '/' + repo + '/git/trees/' + encodeURIComponent(branch) + '?recursive=1')
      .then(function (response) {
        if (!response.ok) {
          throw new Error('Could not list files for ' + owner + '/' + repo + '@' + branch + ' (HTTP ' + response.status + ').');
        }
        return response.json();
      })
      .then(function (data) {
        if (data.truncated) {
          renderWarning(
            'This directory is too large for GitHub\'s API to list in one response (over ~100,000 files). Some files may be missing from the download.'
          );
        }
        var prefix = targetPath ? targetPath.replace(/\/$/, '') + '/' : '';
        var files = data.tree.filter(function (entry) {
          return entry.type === 'blob' && (!targetPath || entry.path === targetPath || entry.path.indexOf(prefix) === 0);
        });
        if (files.length === 0) {
          throw new Error('No files found at "' + (targetPath || '/') + '" in ' + owner + '/' + repo + '@' + branch + '.');
        }
        return files;
      });
  }

  // Fixes DownGit #55/#24/#59/#28 (unbounded parallel fetches hanging or corrupting the zip
  // on large directories, one failure aborting everything) with a bounded worker pool and
  // per-file error isolation.
  function downloadWithConcurrencyPool(owner, repo, branch, files, targetPath, onProgress) {
    var stripPrefixLen = (function () {
      var lastSlash = targetPath ? targetPath.lastIndexOf('/') : -1;
      return lastSlash === -1 ? 0 : lastSlash + 1;
    })();
    var queue = files.slice();
    var succeeded = [];
    var failed = [];
    var done = 0;
    var total = files.length;

    function fetchOne(entry) {
      var rawUrl = 'https://raw.githubusercontent.com/' + owner + '/' + repo + '/' + branch + '/' +
        entry.path.split('/').map(encodeURIComponent).join('/');
      return fetch(rawUrl)
        .then(function (response) {
          if (!response.ok) {
            throw new Error('HTTP ' + response.status);
          }
          return response.arrayBuffer();
        })
        .then(function (buffer) {
          succeeded.push({ path: entry.path.slice(stripPrefixLen), data: buffer });
        })
        .catch(function (err) {
          failed.push({ path: entry.path, error: (err && err.message) || String(err) });
        })
        .then(function () {
          done++;
          onProgress(done, total);
        });
    }

    function worker() {
      var next = queue.shift();
      return next ? fetchOne(next).then(worker) : Promise.resolve();
    }

    var workers = [];
    for (var i = 0; i < Math.min(CONCURRENCY, files.length); i++) {
      workers.push(worker());
    }
    return Promise.all(workers).then(function () {
      return { succeeded: succeeded, failed: failed };
    });
  }

  function buildZipAndSave(succeeded, failed, zipName) {
    var zip = new JSZip();
    succeeded.forEach(function (file) {
      zip.file(file.path, file.data);
    });
    return zip.generateAsync({ type: 'blob' }).then(function (blob) {
      saveAs(blob, zipName + '.zip');
      if (failed.length > 0) {
        renderWarning(
          failed.length + ' file' + (failed.length === 1 ? '' : 's') + ' failed to download and were left out of the zip: ' +
          failed.slice(0, 10).map(function (f) { return f.path; }).join(', ') + (failed.length > 10 ? ', …' : '')
        );
      }
    });
  }

  // ---- Top-level flows ----

  function handleWholeRepo(owner, repo) {
    return githubFetch('/repos/' + owner + '/' + repo)
      .then(function (response) {
        if (!response.ok) {
          throw new Error('Could not find repository ' + owner + '/' + repo + ' (HTTP ' + response.status + ').');
        }
        return response.json();
      })
      .then(function (data) {
        var branch = data.default_branch || 'main';
        window.location.href = 'https://codeload.github.com/' + owner + '/' + repo + '/zip/refs/heads/' + encodeURIComponent(branch);
      });
  }

  function handleSingleFile(owner, repo, refCandidate) {
    return resolveBranch(owner, repo, refCandidate).then(function (resolved) {
      if (!resolved.path) {
        throw new Error('No file path found in that URL.');
      }
      var rawUrl = 'https://raw.githubusercontent.com/' + owner + '/' + repo + '/' + resolved.branch + '/' +
        resolved.path.split('/').map(encodeURIComponent).join('/');
      return fetch(rawUrl)
        .then(function (response) {
          if (!response.ok) {
            throw new Error(
              'Could not download file (HTTP ' + response.status + '). It may be private, or too large for raw downloads.'
            );
          }
          return response.blob();
        })
        .then(function (blob) {
          saveAs(blob, resolved.path.split('/').pop());
        });
    });
  }

  function handleFolder(owner, repo, refCandidate) {
    return resolveBranch(owner, repo, refCandidate).then(function (resolved) {
      return listTreeRecursive(owner, repo, resolved.branch, resolved.path).then(function (files) {
        renderProgress(0, files.length);
        return downloadWithConcurrencyPool(owner, repo, resolved.branch, files, resolved.path, renderProgress)
          .then(function (result) {
            if (result.succeeded.length === 0) {
              throw new Error(
                'All ' + result.failed.length + ' file(s) failed to download.' +
                (result.failed[0] ? ' First error: ' + result.failed[0].error : '')
              );
            }
            var lastSlash = resolved.path.lastIndexOf('/');
            var zipName = lastSlash === -1 ? (resolved.path || repo) : resolved.path.slice(lastSlash + 1);
            return buildZipAndSave(result.succeeded, result.failed, zipName);
          });
      });
    });
  }

  function onDownloadClick(evt) {
    if (evt) evt.preventDefault();
    resetUI();

    var parsed;
    try {
      parsed = parseGitHubUrl(els.url.value);
    } catch (err) {
      renderError(err.message);
      return;
    }

    setBusy(true);
    var task;
    if (parsed.mode === 'whole-repo') {
      task = handleWholeRepo(parsed.owner, parsed.repo);
    } else if (parsed.mode === 'blob') {
      task = handleSingleFile(parsed.owner, parsed.repo, parsed.refCandidate);
    } else {
      task = handleFolder(parsed.owner, parsed.repo, parsed.refCandidate);
    }

    task
      .catch(function (err) {
        renderError((err && err.message) || String(err));
      })
      .then(function () {
        setBusy(false);
      });
  }

  document.addEventListener('DOMContentLoaded', function () {
    initEls();
    els.btn.addEventListener('click', onDownloadClick);
    els.url.addEventListener('keydown', function (evt) {
      if (evt.key === 'Enter') onDownloadClick(evt);
    });
  });
})();
