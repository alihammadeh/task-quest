// =====================================================
// Task Quest PWA glue (loads last)
// -----------------------------------------------------
//  - Registers the service worker (sw.js).
//  - Update flow: when a new worker is waiting, show a small
//    "Update ready" bar with a Reload button (no surprise reloads).
//  - Install affordance: captures beforeinstallprompt and shows an
//    "Install app" button in the footer.
//  - On reconnect, immediately flush the dirty queue instead of
//    waiting for sync.js's 10s retry timer.
// =====================================================

(function () {
  'use strict';

  // Service workers need a secure context (https or localhost).
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', registerSW);
  }

  let reloading = false;
  let userInitiatedReload = false; // only reload the page when the user asks

  function registerSW() {
    navigator.serviceWorker.register('sw.js').then((reg) => {
      // A new worker is already waiting (e.g. from a previous tab).
      if (reg.waiting && navigator.serviceWorker.controller) {
        showUpdateBar(reg.waiting);
      }
      reg.addEventListener('updatefound', () => {
        const installing = reg.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          // Installed + an existing controller => this is an update, not first install.
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateBar(installing);
          }
        });
      });
    }).catch((err) => {
      console.warn('[pwa] SW registration failed:', err);
    });

    // Reload once the new worker takes control — but ONLY after the user
    // clicked Reload. (controllerchange also fires on the very first install
    // when the worker calls clients.claim(); we must not reload then.)
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!userInitiatedReload || reloading) return;
      reloading = true;
      window.location.reload();
    });
  }

  function showUpdateBar(worker) {
    if (document.getElementById('pwaUpdateBar')) return;
    const bar = document.createElement('div');
    bar.id = 'pwaUpdateBar';
    bar.style.cssText =
      'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:9999;' +
      'display:flex;align-items:center;gap:12px;padding:10px 16px;border-radius:12px;' +
      'background:var(--accent-strong,#543b29);color:#fffdf8;font-size:13px;' +
      'box-shadow:0 6px 24px rgba(0,0,0,.18);font-family:inherit;';
    bar.innerHTML =
      '<span>A new version is ready.</span>' +
      '<button id="pwaReloadBtn" style="background:#fffdf8;color:#543b29;border:none;' +
      'border-radius:8px;padding:5px 12px;font-size:13px;font-weight:600;cursor:pointer;' +
      'font-family:inherit;">Reload</button>';
    document.body.appendChild(bar);
    document.getElementById('pwaReloadBtn').addEventListener('click', () => {
      userInitiatedReload = true;
      worker.postMessage('SKIP_WAITING');
    });
  }

  // ---- Install affordance ----
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // we'll prompt on our own button
    deferredPrompt = e;
    addInstallButton();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    const btn = document.getElementById('pwaInstallBtn');
    if (btn) btn.remove();
  });

  function addInstallButton() {
    if (document.getElementById('pwaInstallBtn')) return;
    const footer = document.querySelector('.footer');
    if (!footer) return;
    const btn = document.createElement('button');
    btn.id = 'pwaInstallBtn';
    btn.textContent = 'Install app';
    btn.style.cssText = 'margin-left:6px;';
    btn.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      btn.remove();
    });
    footer.appendChild(btn);
  }

  // ---- Flush the dirty queue as soon as we're back online ----
  window.addEventListener('online', () => {
    if (typeof flushDirty === 'function' && typeof dirtyQueueIsEmpty === 'function') {
      if (!dirtyQueueIsEmpty()) flushDirty();
    }
  });
})();
