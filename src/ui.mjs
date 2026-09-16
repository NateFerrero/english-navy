// Tiny DOM helpers. No framework, no dependencies.

// Create an element from a tag, attributes, and children.
// Attributes: `class`, `text`, `html`, data-*, on* handlers, and everything else
// is set as an attribute.
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === "class") {
      node.className = value;
    } else if (key === "text") {
      node.textContent = value;
    } else if (key === "html") {
      node.innerHTML = value;
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

export function isValidEmail(value) {
  // Deliberately simple, front-end-only sanity check.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim());
}
