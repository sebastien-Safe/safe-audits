/* =========================================================
   S@FE — Bascule thème clair/sombre
   =========================================================
   Applique le thème stocké (localStorage) dès que possible pour
   éviter un flash. Par défaut : sombre (style historique inchangé).

   Placer ce script juste après core/design-system/tokens.css,
   avant le reste du CSS de l'app, pour limiter le flash au chargement.

   Utilisation : ajouter un bouton
     <button data-safe-theme-toggle>🌙</button>
   Le contenu du bouton est mis à jour automatiquement (☀️ / 🌙).
   ========================================================= */
(function (global) {
  const STORAGE_KEY = "safe-theme";
  const ICONS = { dark: "🌙", light: "☀️" };

  function getStoredTheme() {
    try { return global.localStorage.getItem(STORAGE_KEY); } catch { return null; }
  }

  function setStoredTheme(theme) {
    try { global.localStorage.setItem(STORAGE_KEY, theme); } catch { /* stockage indisponible, thème non persisté */ }
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    document.querySelectorAll("[data-safe-theme-toggle]").forEach((btn) => {
      btn.textContent = ICONS[theme];
      btn.setAttribute("aria-label", theme === "dark" ? "Passer en mode clair" : "Passer en mode sombre");
    });
  }

  function currentTheme() {
    return document.documentElement.getAttribute("data-theme") || "dark";
  }

  function toggleTheme() {
    const next = currentTheme() === "dark" ? "light" : "dark";
    setStoredTheme(next);
    applyTheme(next);
    return next;
  }

  // Applique le thème stocké dès l'exécution du script (placé tôt dans <head>).
  applyTheme(getStoredTheme() || "dark");

  document.addEventListener("DOMContentLoaded", () => {
    applyTheme(currentTheme()); // met à jour l'icône des boutons présents dans le DOM
    document.querySelectorAll("[data-safe-theme-toggle]").forEach((btn) => {
      btn.addEventListener("click", toggleTheme);
    });
  });

  global.SafeCore = global.SafeCore || {};
  global.SafeCore.toggleTheme = toggleTheme;
  global.SafeCore.currentTheme = currentTheme;
})(window);
