---
layout: page
title: Projects
permalink: /projects/
description: A look at my project work, including accessibility design projects managed at CEED.
nav: true
nav_order: 3
---

<!-- markdownlint-disable MD033 -->
<!-- pages/projects.md -->
<div class="projects">
  <div class="container">
    <div class="row row-cols-1 row-cols-md-2">

      {%- assign sorted_projects = site.projects | where_exp: "item", "item.category != 'ceed'" | sort: "importance" -%}
      {%- for project in sorted_projects -%}
        {% include project_card.html %}
      {%- endfor %}

      <div class="col mb-4">
        <a href="{{ '/projects/ceed/' | relative_url }}" class="project-card-link">
          <div class="card hoverable h-100">
            <div class="project-card-img">
              {% include figure.html path="assets/img/projects/ceed/13-accessible-handle-grip/1.png" alt="CEED" %}
            </div>
            <div class="card-body">
              <h3 class="card-title">CEED</h3>
              <p class="card-text">Accessibility design projects I have managed as Project Manager at the University of Ottawa's Centre for Entrepreneurship and Engineering Design.</p>
            </div>
          </div>
        </a>
      </div>

    </div>
  </div>
</div>
