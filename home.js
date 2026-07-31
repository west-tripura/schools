// ====== SERVICE WORKER REGISTRATION ======
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').catch(function (err) {
      console.warn('Service worker registration failed:', err);
    });
  });
}

// ====== INSTALL PROMPT (Add to Home Screen) ======
let deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', function (event) {
  event.preventDefault();
  deferredInstallPrompt = event;
  const btn = document.getElementById('installBtn');
  if (btn) btn.style.display = 'inline-block';
});

document.addEventListener('DOMContentLoaded', function () {
  const btn = document.getElementById('installBtn');
  if (!btn) return;
  btn.addEventListener('click', function () {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    deferredInstallPrompt.userChoice.finally(function () {
      deferredInstallPrompt = null;
      btn.style.display = 'none';
    });
  });
});

window.addEventListener('appinstalled', function () {
  const btn = document.getElementById('installBtn');
  if (btn) btn.style.display = 'none';
});
