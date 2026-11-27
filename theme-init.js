(function () {
  try {
    var saved = localStorage.getItem("course_studio_theme");
    if (saved === null) {
      saved = localStorage.getItem("schlossallee_theme");
      if (saved !== null) localStorage.setItem("course_studio_theme", saved);
    }
    if (saved !== "light") document.documentElement.setAttribute("data-theme", "dark");
  } catch (_) {
    document.documentElement.setAttribute("data-theme", "dark");
  }
})();
