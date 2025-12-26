(() => {
  const y = document.getElementById("y");
  if (y) y.textContent = new Date().getFullYear();

  const contactForm = document.getElementById("contactForm");
  if (contactForm) {
    contactForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const note = document.getElementById("contactNote");
      if (note) {
        note.textContent = "Submitted (demo). For GitHub Pages, connect this to Formspree/Google Forms/backend later.";
      }
      contactForm.reset();
    });
  }
})();
