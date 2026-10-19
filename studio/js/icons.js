// @ts-check
// Line icons (24×24, stroke = currentColor). Drawn for this UI; no external icon font.

/** @type {Record<string, string>} */
const P = {
  home: 'M3 11.5 12 4l9 7.5M5.5 9.5V20h13V9.5M10 20v-5.5h4V20',
  camera: 'M4 8h3.2l1.6-2.5h6.4L16.8 8H20v11H4zM12 17a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2',
  focus: 'M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
  film: 'M4 5h16v14H4zM8 5v14M16 5v14M4 9.5h4M4 14.5h4M16 9.5h4M16 14.5h4',
  motion: 'M13.5 4.5a1.7 1.7 0 1 0 0 .1M11 8l-3 4 3 1.5-1.5 6M11 8l3.5 1.5 2 3.5M12.5 13.5l3 2.5v4',
  stage: 'M12 3 20 7.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12 4 7.5M12 12v9',
  render: 'M4 6h16v10H4zM9 20h6M12 16v4M10.5 9v4l3.5-2z',
  folder: 'M3.5 6.5h6l2 2h9v10h-17z',
  sphere: 'M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16M4 12c2.5 2 13.5 2 16 0M12 4c-2.6 2.6-2.6 13.4 0 16',
  music: 'M9 18V6l10-2v12M9 18a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0M19 16a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0',
  image: 'M4 5h16v14H4zM4 16l4.5-4.5 4 4 2.5-2.5L20 18M15.5 9.5a1.5 1.5 0 1 0 0-.1',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4.5 20c.8-3.6 3.8-6 7.5-6s6.7 2.4 7.5 6',
  bone: 'M7.5 4.5a2 2 0 0 0-3 2.6 2 2 0 0 0 2.4 2.4l7.6 7.6a2 2 0 0 0 2.4 2.4 2 2 0 0 0 2.6-3 2 2 0 0 0-2.4-2.4L9.5 6.5a2 2 0 0 0-2-2',
  path: 'M5 19c0-6 4-6 7-7s7-1 7-7M5 19a1.5 1.5 0 1 0 0-.1M19 5a1.5 1.5 0 1 0 0-.1',
  swap: 'M5 8h13l-3-3M19 16H6l3 3',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  layers: 'M12 4 3 8.5l9 4.5 9-4.5zM3 12.5l9 4.5 9-4.5M3 16.5 12 21l9-4.5',
  history: 'M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4M12 8v4.5l3 1.8',
  plug: 'M9 3v5M15 3v5M6.5 8h11v3a5.5 5.5 0 0 1-11 0zM12 16.5V21',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2L14.3 3h-4.6l-.3 2.7a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2 1.2l.3 2.7h4.6l.3-2.7a7 7 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2',
  palette: 'M12 20a8 8 0 1 1 8-8c0 2-1.5 3-3.2 3H15a1.8 1.8 0 0 0-1.3 3.1c.6.6.2 1.9-1.7 1.9M7.5 12a1 1 0 1 0 0-.1M10 8a1 1 0 1 0 0-.1M14.5 8a1 1 0 1 0 0-.1',
  template: 'M4 4h16v5H4zM4 12h7v8H4zM14 12h6v8h-6z',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  pulse: 'M3 12h4l2.5-6 4 12 2.5-6H21',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17h.01',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14M20 20l-4-4',
  heart: 'M12 19.5s-7.5-4.4-7.5-10A4.3 4.3 0 0 1 12 6.8a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10-7.5 10',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  play: 'M7 4.5v15L19.5 12z',
  plus: 'M12 5v14M5 12h14',
  upload: 'M12 16V4M7 9l5-5 5 5M4 16v4h16v-4',
  tag: 'M3.5 12.5V4h8.5l8.5 8.5-8.5 8.5zM8 8.5a.5.5 0 1 0 0-.1',
  filter: 'M4 5h16l-6 7.5V19l-4-2v-4.5z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  pause: 'M8 5v14M16 5v14',
  close: 'M6 6l12 12M18 6 6 18',
  expand: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5',
  star: 'M12 3.8l2.5 5.2 5.7.8-4.1 4 1 5.6-5.1-2.7-5.1 2.7 1-5.6-4.1-4 5.7-.8z',
  bell: 'M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20.5h4',
  cursor: 'M5 4l13 6-5.5 1.8L10.7 18z',
  move: 'M12 3v18M3 12h18M12 3l-2.5 2.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5',
  rotate: 'M20 12a8 8 0 1 1-2.4-5.7M20 4v4.5h-4.5',
  scale: 'M4 20 20 4M14 4h6v6M10 20H4v-6',
  orbit: 'M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4M3 12c0-2.2 4-4 9-4s9 1.8 9 4-4 4-9 4-9-1.8-9-4',
  dolly: 'M4 15h16M7 15l2-6h6l2 6M8 19a1.5 1.5 0 1 0 0-.1M16 19a1.5 1.5 0 1 0 0-.1',
  cloud: 'M7 18h10.5a4 4 0 0 0 .5-8 6 6 0 0 0-11.5 1.5A3.3 3.3 0 0 0 7 18',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7v5l3 2',
  sparkle: 'M12 3.5 13.8 10l6.7 2-6.7 2L12 20.5 10.2 14l-6.7-2 6.7-2z',
};

/** Screen id → icon name (sidebar). */
export const SCREEN_ICON = /** @type {Record<string, string>} */ ({
  '01': 'home', '02': 'camera', '03': 'focus', '04': 'film', '05': 'motion', '06': 'stage', '07': 'render', '08': 'folder', '09': 'sphere',
  '10': 'music', '11': 'image', '12': 'user', '13': 'bone', '14': 'path', '15': 'swap', '16': 'grid', '17': 'layers', '18': 'history',
  '19': 'plug', '20': 'gear', '21': 'palette', '22': 'template', '23': 'link', '24': 'pulse', '25': 'help',
});

/** @param {string} name @param {number} [size] @returns {SVGSVGElement} */
export function icon(name, size = 18) {
  const ns = 'http://www.w3.org/2000/svg';
  const el = /** @type {SVGSVGElement} */ (document.createElementNS(ns, 'svg'));
  el.setAttribute('viewBox', '0 0 24 24');
  el.setAttribute('width', String(size));
  el.setAttribute('height', String(size));
  el.setAttribute('aria-hidden', 'true');
  el.setAttribute('class', 'ico');
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', P[name] || P.more);
  el.append(p);
  return el;
}
