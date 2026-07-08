---
layout: page
title: Projects
permalink: /projects/
description: Accessibility design projects I have managed as Project Manager at the University of Ottawa's Centre for Entrepreneurship and Engineering Design.
nav: true
nav_order: 3
---

<!-- markdownlint-disable MD033 -->
<!-- pages/projects.md -->
<div class="projects">
  {%- assign sorted_projects = site.projects | sort: "importance" -%}
  <div class="container">
    <div class="row row-cols-1 row-cols-md-2 row-cols-lg-3">
      {%- for project in sorted_projects -%}
        {% include project_card.html %}
      {%- endfor %}
    </div>
  </div>
</div>
