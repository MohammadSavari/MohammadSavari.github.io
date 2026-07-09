---
layout: page
title: CEED
permalink: /projects/ceed/
description: Accessibility design projects I have managed as Project Manager at the University of Ottawa's Centre for Entrepreneurship and Engineering Design (CEED).
nav: false
---

<!-- markdownlint-disable MD033 -->
<!-- pages/ceed.md -->
<div class="projects">
  {%- assign sorted_projects = site.projects | where: "category", "ceed" | sort: "importance" -%}
  <div class="container">
    <div class="row row-cols-1 row-cols-md-2 row-cols-lg-3">
      {%- for project in sorted_projects -%}
        {% include project_card.html %}
      {%- endfor %}
    </div>
  </div>
</div>
