(function () {
  'use strict';

  // ── Scroll reveal ──────────────────────────────────────────────────────
  const panels = document.querySelectorAll('.story-panel');
  if (!panels.length) return;

  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('in-view');
        obs.unobserve(e.target);
      }
    });
  }, { threshold: 0.18 });

  panels.forEach(p => obs.observe(p));

  // ── Parallax en panel 2 (imagen) ──────────────────────────────────────
  const landPanel = document.getElementById('story-land');
  if (!landPanel) return;
  const landImg = landPanel.querySelector('.story-img');
  if (!landImg) return;

  let rafPending = false;

  function updateParallax() {
    const rect = landPanel.getBoundingClientRect();
    // progress: 0.5 cuando el panel está centrado en pantalla
    const progress = (rect.top + rect.height / 2) / window.innerHeight - 0.5;
    landImg.style.setProperty('--story-py', (progress * 48) + 'px');
    rafPending = false;
  }

  window.addEventListener('scroll', () => {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(updateParallax);
  }, { passive: true });

  // Inicializar posición sin esperar al primer scroll
  updateParallax();
})();
