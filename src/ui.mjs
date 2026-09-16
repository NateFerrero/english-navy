// Tiny DOM helpers. No framework, no dependencies.

// Create an element from a tag, attributes, and children.
// Attributes: `class`, `text`, data-*, on* handlers, and everything else is set
// as an attribute.
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === "class") {
      node.className = value;
    } else if (key === "text") {
      node.textContent = value;
    } else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else {
      node.setAttribute(key, value);
    }
  }

  const kids = Array.isArray(children) ? children : [children];
  for (const kid of kids) {
    if (kid == null || kid === false) continue;
    node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }

  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

// A small inline SVG crest so we have branding without any external asset.
export function crest(size = 34) {
  const wrap = document.createElement("span");
  wrap.innerHTML = `
<svg viewBox="0 0 64 64" width="${size}" height="${size}" role="img" aria-label="English Navy crest">
  <defs>
    <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#13315c"/>
      <stop offset="1" stop-color="#0b2545"/>
    </linearGradient>
  </defs>
  <path d="M32 2 58 12v20c0 16-11 26-26 30C17 58 6 48 6 32V12z" fill="url(#sea)" stroke="#c9a227" stroke-width="2"/>
  <path d="M32 16v28M22 24h20M20 44c4 4 20 4 24 0" fill="none" stroke="#c9a227" stroke-width="2.4" stroke-linecap="round"/>
  <circle cx="32" cy="13" r="2.4" fill="#c9a227"/>
</svg>`;
  return wrap.firstElementChild;
}

export function icon(name, size = 20) {
  const paths = {
    sun: `
      <circle cx="12" cy="12" r="4"/>
      <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42"/>
    `,
    moon: `
      <path d="M21 13.2A7.5 7.5 0 0 1 10.8 3 8.7 8.7 0 1 0 21 13.2Z"/>
    `,
    auto: `
      <path d="M4 12a8 8 0 0 1 13.66-5.66"/>
      <path d="M17 3v4h-4"/>
      <path d="M20 12a8 8 0 0 1-13.66 5.66"/>
      <path d="M7 21v-4h4"/>
      <path d="M12 8l-3 8M15 16l-3-8M10 13h4"/>
    `,
    copy: `
      <rect x="8" y="8" width="11" height="11" rx="2"/>
      <path d="M5 15H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1"/>
    `,
    x: `
      <path d="M18 6 6 18M6 6l12 12"/>
    `,
    "caret-down": `
      <path d="m6 9 6 6 6-6"/>
    `,
    bell: `
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/>
      <path d="M10 21h4"/>
    `,
  };

  const wrap = document.createElement("span");
  wrap.innerHTML = `
<svg class="icon icon-${name}" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" focusable="false">
  <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">
    ${paths[name] || ""}
  </g>
</svg>`;
  return wrap.firstElementChild;
}

export function isValidEmail(value) {
  // Deliberately simple, front-end-only sanity check.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim());
}
