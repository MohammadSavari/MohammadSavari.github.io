---
layout: page
title: Tools
permalink: /tools/
description: Small standalone utilities I've built and host here.
nav: true
nav_order: 6
dropdown: true
children:
  - title: DownGit
    permalink: /tools/downgit/
  - title: Bingo
    permalink: /assets/tools/bingo/
---

<!-- markdownlint-disable MD033 -->
<!-- pages/tools.md -->
<div class="projects">
  <div class="container">
    <div class="row row-cols-1 row-cols-md-2">

      <div class="col mb-4">
        <a href="{{ '/tools/downgit/' | relative_url }}" class="project-card-link">
          <div class="card hoverable h-100">
            <div class="card-body">
              <h3 class="card-title">DownGit</h3>
              <p class="card-text">Download any single folder or file from a public GitHub repository as a zip, directly in your browser — no cloning, no backend.</p>
            </div>
          </div>
        </a>
      </div>

      <div class="col mb-4">
        <a href="{{ '/assets/tools/bingo/' | relative_url }}" class="project-card-link">
          <div class="card hoverable h-100">
            <div class="card-body">
              <h3 class="card-title">Bingo</h3>
              <p class="card-text">A customizable N×N bingo grid — pick a size from 2 to 7, cross off numbers, and score a bingo for every completed row, column, or diagonal.</p>
            </div>
          </div>
        </a>
      </div>

    </div>
  </div>
</div>
