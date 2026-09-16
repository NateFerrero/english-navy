const SW_URL = "/sw.mjs";

function canRegister() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    (window.isSecureContext || location.hostname === "localhost" || location.hostname === "127.0.0.1")
  );
}

async function register() {
  if (!canRegister()) return;

  try {
    const registration = await navigator.serviceWorker.register(SW_URL);

    // Ensure we activate updates quickly without needing the user to close all tabs.
    registration.addEventListener("updatefound", () => {
      const worker = registration.installing;
      if (!worker) return;

      worker.addEventListener("statechange", () => {
        if (worker.state !== "installed") return;
        if (!navigator.serviceWorker.controller) return;
        registration.waiting?.postMessage({ type: "SKIP_WAITING" });
      });
    });

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      // Reload once on takeover so the newest assets are used.
      window.location.reload();
    });
  } catch {
    // PWA is optional; ignore registration failures.
  }
}

register();
