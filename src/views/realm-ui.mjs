import { el, clear } from "../ui.mjs";

export function setAlert(container, kind, message) {
  clear(container);
  if (message) container.append(el("div", { class: `alert alert-${kind}`, text: message }));
}

export function previewText(body, limit = 160) {
  const text = String(body || "").replace(/\s+/g, " ").trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, limit).trim()}…`;
}

export function wordTitle(word) {
  if (!word) return "Word";
  return `${word.name} (${word.clarifier})`;
}

export function breadcrumb(items) {
  return el(
    "nav",
    { class: "breadcrumb", "aria-label": "Breadcrumb" },
    items.flatMap((item, index) => {
      const node = item.href
        ? el("a", { href: item.href, "data-link": "", text: item.label })
        : el("span", { text: item.label });
      if (index === 0) return [node];
      return [el("span", { class: "breadcrumb-sep", text: "/" }), node];
    })
  );
}

export function pickCountLabel(count) {
  const n = Number(count || 0);
  return `${n} pick${n === 1 ? "" : "s"}`;
}

export function definitionCard(definition, { realmId, wordId, onPick, forkHref, picked } = {}) {
  const actions = [];
  if (onPick) {
    actions.push(
      el("button", {
        type: "button",
        class: picked ? "btn btn-small btn-primary" : "btn btn-small btn-ghost",
        text: picked ? "Your pick" : "Pick",
        disabled: picked ? "" : null,
        onclick: picked ? null : onPick,
      })
    );
  }
  if (realmId && wordId && definition?.id) {
    actions.push(
      el("a", {
        class: "btn btn-small btn-ghost",
        href: `/realms/${encodeURIComponent(realmId)}/words/${encodeURIComponent(wordId)}/definitions/${encodeURIComponent(definition.id)}`,
        "data-link": "",
        text: "Arguments",
      })
    );
  }
  if (forkHref) {
    actions.push(el("a", { class: "btn btn-small btn-ghost", href: forkHref, "data-link": "", text: "Fork" }));
  }

  return el("article", { class: `definition-card${definition.current ? " current" : ""}` }, [
    definition.current ? el("span", { class: "pill", text: "Current Definition" }) : null,
    el("p", { class: "definition-body", text: definition.body }),
    el("div", { class: "definition-meta" }, [
      el("span", { class: "muted", text: pickCountLabel(definition.pickCount) }),
      definition.forkedFromId ? el("span", { class: "muted", text: "Forked" }) : null,
    ]),
    actions.length ? el("div", { class: "row-actions" }, actions) : null,
  ]);
}
