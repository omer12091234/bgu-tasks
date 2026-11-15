// Quick links: the row of link buttons, and the editor for the user's own links.

import { el } from './ui.js';
import { DEFAULT_LINKS, MAX_CUSTOM_LINKS } from './links.js';

function linkButton(link) {
  return el('a', { class: 'btn link-chip', href: link.url, target: '_blank', rel: 'noopener', text: link.name });
}

/**
 * The row of quick links (built-in ones first, then the user's own).
 * @param {{ name: string, url: string }[]} custom
 * @param {Node[]} [extra] more buttons for the end of the row
 */
export function linksBar(custom, extra = []) {
  return el('nav', { class: 'quick-links', 'aria-label': 'קישורים מהירים' }, [
    ...[...DEFAULT_LINKS, ...custom].map(linkButton),
    ...extra,
  ]);
}

/** Settings panel: the user's own links, with remove buttons and an "add" form. */
export function linksEditor({ custom, error, onAdd, onRemove }) {
  const name = el('input', { type: 'text', name: 'name', maxlength: '30', required: true, placeholder: 'למשל: אתר הקורס' });
  const url = el('input', { type: 'text', name: 'url', inputmode: 'url', dir: 'ltr', required: true, placeholder: 'example.com' });
  const full = custom.length >= MAX_CUSTOM_LINKS;

  return el('section', { class: 'panel' }, [
    el('h2', { text: 'קישורים חשובים' }),
    el('p', { text: 'קישורים שתוסיף כאן יופיעו לצד הקישורים הקבועים. הם נשמרים במכשיר הזה בלבד.' }),
    custom.length > 0 && el('ul', { class: 'link-rows' }, custom.map((link) => el('li', {}, [
      el('a', { href: link.url, target: '_blank', rel: 'noopener', text: link.name }),
      el('button', {
        class: 'btn btn-danger', type: 'button', text: 'הסר', 'aria-label': `הסר את ${link.name}`, onclick: () => onRemove(link.url),
      }),
    ]))),
    el('form', {
      class: 'link-form',
      onsubmit: (event) => {
        event.preventDefault();
        onAdd({ name: name.value, url: url.value });
      },
    }, [
      el('label', { class: 'field' }, [document.createTextNode('שם'), name]),
      el('label', { class: 'field' }, [document.createTextNode('כתובת'), url]),
      error && el('p', { class: 'error', role: 'alert', text: error }),
      el('button', { class: 'btn', type: 'submit', disabled: full, text: full ? 'הגעת למספר הקישורים המרבי' : 'הוסף קישור' }),
    ]),
  ]);
}
