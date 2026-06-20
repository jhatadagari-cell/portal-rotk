/**
 * rel-auto-img.js · Portal ROTK
 *
 * Rellena automáticamente la imagen de las burbujas de relaciones / nodos del
 * árbol genealógico que están como placeholder (carácter chino), si existe el
 * archivo `assets/img/<Nombre>/<Nombre>.webp`.
 *
 * Convención: el nombre se toma de `data-name` (parte anterior al " · ").
 * Si la imagen no existe (404), se conserva el placeholder. No requiere tocar
 * el HTML cuando se añade una imagen nueva: aparece sola al recargar.
 */
(function () {
  function nameFromNode(node) {
    const raw = node && node.dataset ? node.dataset.name || "" : "";
    // "Cao Song · 曹嵩" -> "Cao Song"
    return raw.split("·")[0].trim();
  }

  function fill(placeholder) {
    const node = placeholder.closest("[data-name]");
    const name = nameFromNode(node);
    if (!name) return;

    const src = "../img/" + name + "/" + name + ".webp";
    const probe = new Image();
    probe.onload = function () {
      placeholder.classList.remove("rel-bubble-img--placeholder");
      placeholder.textContent = "";
      const img = new Image();
      img.src = src;
      img.alt = name;
      img.loading = "lazy";
      placeholder.appendChild(img);
    };
    // onerror: no hacemos nada — se mantiene el carácter chino.
    probe.src = src;
  }

  function run() {
    document
      .querySelectorAll(".rel-bubble-img--placeholder")
      .forEach(fill);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
