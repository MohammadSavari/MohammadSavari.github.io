// Nav items with a dropdown (see _includes/header.html) link to a real page: first click should
// open the menu, second click (while already open) should navigate. Bootstrap's own dropdown JS
// always preventDefaults toggle clicks regardless of open state, so it can never let that second
// click through — this manages the open/closed state itself instead, with no dependency on
// Bootstrap's dropdown component at all (note header.html deliberately omits data-toggle="dropdown").
document.addEventListener('DOMContentLoaded', function () {
  var dropdowns = document.querySelectorAll('#navbar .nav-item.dropdown');

  function closeAll() {
    dropdowns.forEach(function (dropdown) {
      var menu = dropdown.querySelector('.dropdown-menu');
      var toggle = dropdown.querySelector('.dropdown-toggle');
      if (menu) menu.classList.remove('show');
      dropdown.classList.remove('show');
      if (toggle) toggle.setAttribute('aria-expanded', 'false');
    });
  }

  dropdowns.forEach(function (dropdown) {
    var toggle = dropdown.querySelector('.dropdown-toggle');
    var menu = dropdown.querySelector('.dropdown-menu');
    if (!toggle || !menu) return;

    toggle.addEventListener('click', function (event) {
      if (menu.classList.contains('show')) {
        return; // already open: let the browser follow the link
      }
      event.preventDefault();
      closeAll();
      menu.classList.add('show');
      dropdown.classList.add('show');
      toggle.setAttribute('aria-expanded', 'true');
    });
  });

  document.addEventListener('click', function (event) {
    if (!event.target.closest('#navbar .nav-item.dropdown')) {
      closeAll();
    }
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      closeAll();
    }
  });
});
