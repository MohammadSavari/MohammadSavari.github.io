// Nav items with a dropdown (see _includes/header.html) link to a real page, but Bootstrap's
// dropdown-toggle always preventDefaults its own click to just open/close the menu. This lets
// a second click through so the toggle navigates once its dropdown is already open.
document.addEventListener('DOMContentLoaded', function () {
  var toggles = document.querySelectorAll('#navbar .dropdown-toggle');
  toggles.forEach(function (toggle) {
    toggle.addEventListener('click', function (event) {
      if (toggle.getAttribute('aria-expanded') === 'true') {
        event.stopPropagation();
      }
    });
  });
});
