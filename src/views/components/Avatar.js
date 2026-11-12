import { escapeHtml, initials } from "../../utils/dom.js";

export function renderAvatar(name, image = null, size = "") {
  const cls = `avatar ${size ? `avatar--${size}` : ""}`.trim();
  if (image && /^https:\/\//i.test(image)) {
    return `<span class="${cls}"><img src="${escapeHtml(image)}" alt="" loading="lazy"></span>`;
  }
  return `<span class="${cls}" aria-hidden="true">${escapeHtml(initials(name))}</span>`;
}
