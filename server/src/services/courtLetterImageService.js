// Renders a court letter as a real PNG document.
//
// The letter is described once, as structured data, in escalationService. This
// module turns that data into two things: plain text (for SMS bodies and the
// portal's accessible copy) and a formal, court-styled PNG (for MMS and for
// display on the customer's page).
//
// resvg rasterises the SVG in-process. It is the only sane option here: sharp
// and node-canvas both need native toolchains that break on Windows and on
// Render's build image, and a headless browser is far too heavy for one letter.

const fs = require('fs');
const crypto = require('crypto');

let Resvg = null;
try {
  ({ Resvg } = require('@resvg/resvg-js'));
} catch (err) {
  console.warn('[COURT LETTER IMAGE] Renderer not installed — letters will be delivered as text only.');
}

// ============================================================
//  Fonts
// ============================================================
// resvg resolves fonts through fontconfig, so a fontless container renders
// every glyph as nothing and produces a silently blank page. Search the usual
// locations for both Linux (Render) and Windows, allow an explicit override, and
// verify ink actually landed on the bitmap before anyone sends the image.
const FONT_FILE_ENV = process.env.COURT_LETTER_FONT_FILE || '';
const SERIF_FONT_CANDIDATES = [
  'C:/Windows/Fonts/times.ttf',
  'C:/Windows/Fonts/georgia.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf',
  '/usr/share/fonts/TTF/DejaVuSerif.ttf',
  '/usr/share/fonts/dejavu/DejaVuSerif.ttf',
  '/Library/Fonts/Times New Roman.ttf',
  '/System/Library/Fonts/Supplemental/Times New Roman.ttf'
];
const SANS_FONT_CANDIDATES = [
  'C:/Windows/Fonts/arial.ttf',
  'C:/Windows/Fonts/segoeui.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
  '/usr/share/fonts/TTF/DejaVuSans.ttf',
  '/System/Library/Fonts/Supplemental/Arial.ttf'
];

let cachedFonts = null;

function resolveFonts() {
  if (cachedFonts) return cachedFonts;

  const pick = (explicit, candidates) => {
    if (explicit && fs.existsSync(explicit)) return explicit;
    return candidates.find((p) => fs.existsSync(p)) || null;
  };

  cachedFonts = {
    serif: pick(FONT_FILE_ENV, SERIF_FONT_CANDIDATES),
    sans: pick(process.env.COURT_LETTER_SANS_FONT_FILE || '', SANS_FONT_CANDIDATES)
  };

  if (!cachedFonts.serif) {
    console.warn('[COURT LETTER IMAGE] No serif font found. Install fonts-dejavu-core on the host, or set COURT_LETTER_FONT_FILE.');
  }

  return cachedFonts;
}

// ============================================================
//  Text measurement
// ============================================================
// resvg gives no text-measurement API, so wrapping uses an approximate advance
// width per character. Values are expressed as a fraction of the font size,
// tuned for Times/DejaVu Serif. Wrapping only has to be close enough to look
// right; resvg draws the glyphs, not these numbers.
const NARROW_CHARS = "iljtfIr.,:;'!|()[]{}/\\ ";
const WIDE_CHARS = 'mwMW@%';

function charWidth(ch, fontSize) {
  if (NARROW_CHARS.includes(ch)) return fontSize * 0.28;
  if (WIDE_CHARS.includes(ch)) return fontSize * 0.82;
  if (ch >= 'A' && ch <= 'Z') return fontSize * 0.68;
  return fontSize * 0.5;
}

function measure(text, fontSize) {
  let total = 0;
  for (const ch of String(text)) total += charWidth(ch, fontSize);
  return total;
}

// Greedy word wrap. Honours explicit \n so the caller controls paragraph breaks.
function wrapText(text, fontSize, maxWidth) {
  const lines = [];
  for (const paragraph of String(text).split('\n')) {
    if (paragraph.trim() === '') {
      lines.push('');
      continue;
    }
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate, fontSize) <= maxWidth) {
        line = candidate;
      } else {
        if (line) lines.push(line);
        // A single word wider than the column has to be broken by character.
        if (measure(word, fontSize) > maxWidth) {
          let chunk = '';
          for (const ch of word) {
            if (measure(chunk + ch, fontSize) > maxWidth) {
              lines.push(chunk);
              chunk = ch;
            } else {
              chunk += ch;
            }
          }
          line = chunk;
        } else {
          line = word;
        }
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

// ============================================================
//  SVG building blocks
// ============================================================
// A4 at 150 DPI, which is what a phone camera or a printer expects and keeps the
// text legible once Twilio and the carrier downscale an MMS.
const PAGE_W = 1240;
const PAGE_H = 1754;
const MARGIN = 118;
const CONTENT_W = PAGE_W - MARGIN * 2;

const INK = '#14181f';
const MUTED = '#5a6472';
const RULE = '#c9d1dc';
const ACCENT = '#8c1d24';

function escapeXml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * A wax-seal style roundel. Purely decorative, and deliberately carries the
 * creditor's initials rather than any state or judicial emblem.
 */
function sealSvg(cx, cy, r, initials) {
  const rings = [
    { rr: r, fill: 'none', stroke: ACCENT, width: 3 },
    { rr: r - 9, fill: 'none', stroke: ACCENT, width: 1.2 },
    { rr: r - 20, fill: '#fdf6f5', stroke: ACCENT, width: 1 }
  ]
    .map((c) => `<circle cx="${cx}" cy="${cy}" r="${c.rr}" fill="${c.fill}" stroke="${c.stroke}" stroke-width="${c.width}"/>`)
    .join('');

  const size = Math.round(r * 0.78);
  const glyphs = escapeXml(initials).slice(0, 3);
  return `<g>${rings}
    <text x="${cx}" y="${cy + size * 0.36}" text-anchor="middle"
      font-family="Georgia, 'Times New Roman', 'DejaVu Serif', serif" font-weight="bold"
      font-size="${size}" fill="${ACCENT}" letter-spacing="1">${glyphs}</text>
  </g>`;
}

function initialsOf(name) {
  const parts = String(name || '')
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'SD';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/**
 * Build the SVG for a court letter document.
 * `doc` is the structured object produced by escalationService.
 */
function buildLetterSvg(doc) {
  // Single quotes only: these stacks are interpolated into double-quoted XML
  // attributes, and a bare double quote in a font name would end the attribute.
  const serif = "Georgia, 'Times New Roman', 'DejaVu Serif', 'Liberation Serif', serif";
  const sans = "'Segoe UI', Arial, 'DejaVu Sans', 'Liberation Sans', sans-serif";

  const parts = [];
  let y = 0;

  // ---- Page background and frame
  parts.push(`<rect x="0" y="0" width="${PAGE_W}" height="${PAGE_H}" fill="#ffffff"/>`);
  parts.push(`<rect x="26" y="26" width="${PAGE_W - 52}" height="${PAGE_H - 52}" fill="none" stroke="${RULE}" stroke-width="2"/>`);
  parts.push(`<rect x="34" y="34" width="${PAGE_W - 68}" height="${PAGE_H - 68}" fill="none" stroke="${RULE}" stroke-width="0.75"/>`);

  y = 128;

  // ---- Letterhead: creditor identity on the left, seal on the right
  parts.push(`<text x="${MARGIN}" y="${y}" font-family="${sans}" font-size="34" font-weight="bold" fill="${INK}">${escapeXml(doc.creditor.storeName)}</text>`);
  y += 32;
  if (doc.creditor.address) {
    parts.push(`<text x="${MARGIN}" y="${y}" font-family="${sans}" font-size="17" fill="${MUTED}">${escapeXml(doc.creditor.address)}</text>`);
    y += 24;
  }
  if (doc.creditor.license) {
    parts.push(`<text x="${MARGIN}" y="${y}" font-family="${sans}" font-size="17" fill="${MUTED}">Business licence: ${escapeXml(doc.creditor.license)}</text>`);
    y += 24;
  }

  const sealR = 62;
  parts.push(sealSvg(PAGE_W - MARGIN - sealR, 118, sealR, initialsOf(doc.creditor.storeName)));
  y += 22;

  // ---- Double rule under the letterhead
  parts.push(`<line x1="${MARGIN}" y1="${y}" x2="${PAGE_W - MARGIN}" y2="${y}" stroke="${INK}" stroke-width="2.5"/>`);
  parts.push(`<line x1="${MARGIN}" y1="${y + 6}" x2="${PAGE_W - MARGIN}" y2="${y + 6}" stroke="${INK}" stroke-width="1"/>`);
  y += 58;

  // ---- Title
  const titleLines = wrapText(doc.title, 30, CONTENT_W);
  for (const line of titleLines) {
    parts.push(`<text x="${MARGIN}" y="${y}" font-family="${serif}" font-size="30" font-weight="bold" fill="${ACCENT}" letter-spacing="0.5">${escapeXml(line)}</text>`);
    y += 38;
  }
  y += 6;

  // ---- Reference and issue date, right aligned like a formal reference block
  parts.push(`<text x="${MARGIN}" y="${y}" font-family="${sans}" font-size="16" fill="${MUTED}">Reference</text>`);
  parts.push(`<text x="${PAGE_W - MARGIN}" y="${y}" text-anchor="end" font-family="${sans}" font-size="17" font-weight="bold" fill="${INK}">${escapeXml(doc.letterRef)}</text>`);
  y += 26;
  parts.push(`<text x="${MARGIN}" y="${y}" font-family="${sans}" font-size="16" fill="${MUTED}">Date of issue</text>`);
  parts.push(`<text x="${PAGE_W - MARGIN}" y="${y}" text-anchor="end" font-family="${sans}" font-size="17" fill="${INK}">${escapeXml(doc.issuedOnHuman)}</text>`);
  y += 34;
  parts.push(`<line x1="${MARGIN}" y1="${y}" x2="${PAGE_W - MARGIN}" y2="${y}" stroke="${RULE}" stroke-width="1"/>`);
  y += 44;

  // ---- Addressee block
  parts.push(`<text x="${MARGIN}" y="${y}" font-family="${sans}" font-size="15" font-weight="bold" fill="${MUTED}" letter-spacing="1.5">TO</text>`);
  y += 30;
  parts.push(`<text x="${MARGIN}" y="${y}" font-family="${serif}" font-size="25" font-weight="bold" fill="${INK}">${escapeXml(doc.customer.name)}</text>`);
  y += 30;
  if (doc.customer.faydaId) {
    parts.push(`<text x="${MARGIN}" y="${y}" font-family="${sans}" font-size="17" fill="${MUTED}">Fayda ID: ${escapeXml(doc.customer.faydaId)}</text>`);
    y += 30;
  }
  parts.push(`<text x="${MARGIN}" y="${y}" font-family="${sans}" font-size="17" fill="${MUTED}">Telephone: ${escapeXml(doc.customer.phone || 'not recorded')}</text>`);
  y += 48;

  // ---- Subject line
  parts.push(`<rect x="${MARGIN}" y="${y - 24}" width="${CONTENT_W}" height="44" fill="#f4f6f9"/>`);
  parts.push(`<rect x="${MARGIN}" y="${y - 24}" width="5" height="44" fill="${ACCENT}"/>`);
  parts.push(`<text x="${MARGIN + 20}" y="${y + 6}" font-family="${sans}" font-size="19" font-weight="bold" fill="${INK}">Re: ${escapeXml(doc.subject)}</text>`);
  y += 66;

  // ---- Clauses
  const bodySize = 19.5;
  const lineHeight = 30;

  doc.clauses.forEach((clause) => {
    const heading = `${clause.number}. ${clause.heading.toUpperCase()}`;
    for (const line of wrapText(heading, 18, CONTENT_W - 34)) {
      parts.push(`<text x="${MARGIN}" y="${y}" font-family="${sans}" font-size="18" font-weight="bold" fill="${INK}">${escapeXml(line)}</text>`);
      y += 25;
    }
    y += 6;

    for (const paragraph of clause.body) {
      if (paragraph.trim() === '') {
        y += 8;
        continue;
      }
      for (const line of wrapText(paragraph, bodySize, CONTENT_W)) {
        parts.push(`<text x="${MARGIN}" y="${y}" font-family="${serif}" font-size="${bodySize}" fill="${INK}">${escapeXml(line)}</text>`);
        y += lineHeight;
      }
      y += 8;
    }
    y += 12;
  });

  // ---- Amount summary box
  y += 6;
  const boxH = 96;
  parts.push(`<rect x="${MARGIN}" y="${y}" width="${CONTENT_W}" height="${boxH}" fill="#fdf6f5" stroke="${ACCENT}" stroke-width="1.25"/>`);
  parts.push(`<text x="${MARGIN + 24}" y="${y + 34}" font-family="${sans}" font-size="16" fill="${MUTED}" letter-spacing="1">TOTAL AMOUNT OUTSTANDING</text>`);
  parts.push(`<text x="${MARGIN + 24}" y="${y + 70}" font-family="${serif}" font-size="34" font-weight="bold" fill="${ACCENT}">${escapeXml(doc.amountText)}</text>`);
  parts.push(`<text x="${PAGE_W - MARGIN - 24}" y="${y + 34}" text-anchor="end" font-family="${sans}" font-size="16" fill="${MUTED}">Original due date</text>`);
  parts.push(`<text x="${PAGE_W - MARGIN - 24}" y="${y + 70}" text-anchor="end" font-family="${sans}" font-size="19" fill="${INK}">${escapeXml(doc.dueDateHuman)}</text>`);
  y += boxH + 44;

  // ---- Signature block
  parts.push(`<text x="${MARGIN}" y="${y}" font-family="${serif}" font-size="19" fill="${INK}">Yours faithfully,</text>`);
  y += 30;
  parts.push(`<line x1="${MARGIN}" y1="${y + 34}" x2="${MARGIN + 300}" y2="${y + 34}" stroke="${INK}" stroke-width="1"/>`);
  parts.push(`<text x="${MARGIN}" y="${y + 26}" font-family="${serif}" font-size="22" font-weight="bold" fill="${INK}">${escapeXml(doc.creditor.storeName)}</text>`);
  parts.push(`<text x="${MARGIN}" y="${y + 58}" font-family="${sans}" font-size="16" fill="${MUTED}">The creditor</text>`);
  y += 104;

  // ---- Issuance note. Kept explicit so the document can never be mistaken for
  //      something a court itself issued.
  const noteLines = wrapText(doc.issuerNote, 15.5, CONTENT_W - 30);
  const noteH = noteLines.length * 23 + 26;
  if (y + noteH > PAGE_H - MARGIN) y = PAGE_H - MARGIN - noteH;
  parts.push(`<rect x="${MARGIN}" y="${y}" width="${CONTENT_W}" height="${noteH}" fill="#f4f6f9" stroke="${RULE}" stroke-width="1"/>`);
  let noteY = y + 24;
  for (const line of noteLines) {
    parts.push(`<text x="${MARGIN + 16}" y="${noteY}" font-family="${sans}" font-size="15.5" fill="${MUTED}">${escapeXml(line)}</text>`);
    noteY += 23;
  }

  // ---- Footer
  parts.push(`<text x="${MARGIN}" y="${PAGE_H - 58}" font-family="${sans}" font-size="14" fill="${MUTED}">${escapeXml(doc.letterRef)}</text>`);
  parts.push(`<text x="${PAGE_W / 2}" y="${PAGE_H - 58}" text-anchor="middle" font-family="${sans}" font-size="14" fill="${MUTED}">Issued via Smart Dube</text>`);
  parts.push(`<text x="${PAGE_W - MARGIN}" y="${PAGE_H - 58}" text-anchor="end" font-family="${sans}" font-size="14" fill="${MUTED}">Page 1 of 1</text>`);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_W}" height="${PAGE_H}" viewBox="0 0 ${PAGE_W} ${PAGE_H}">${parts.join('')}</svg>`;
}

// A blank page and a page of text differ enormously in ink. If this comes back
// zero the font never resolved and the image must not be sent to a customer.
function countInk(pixels) {
  let ink = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i] < 200 || pixels[i + 1] < 200 || pixels[i + 2] < 200) ink++;
  }
  return ink;
}

// ============================================================
//  Render cache
// ============================================================
// An issued court letter is immutable, and rasterising one costs a few hundred
// milliseconds. Customers open the letter repeatedly and Twilio re-fetches the
// MMS on retries, so identical renders are memoised by a hash of the document.
// Bounded so a long-lived process cannot grow without limit.
const RENDER_CACHE_LIMIT = 24;
const renderCache = new Map();

function cacheKeyFor(doc) {
  return crypto.createHash('sha256').update(JSON.stringify(doc)).digest('hex');
}

/**
 * Render a court letter document to a PNG buffer.
 * Throws if the renderer is unavailable or the output has no ink on it.
 */
function renderCourtLetterPng(doc) {
  if (!Resvg) {
    throw new Error('Court letter image renderer is not installed.');
  }

  const key = cacheKeyFor(doc);
  const cached = renderCache.get(key);
  if (cached) {
    // Refresh recency for the LRU.
    renderCache.delete(key);
    renderCache.set(key, cached);
    return cached;
  }

  const fonts = resolveFonts();
  const explicitFonts = [fonts.serif, fonts.sans].filter(Boolean);

  const fontOptions = explicitFonts.length > 0
    // Explicit files only. Letting resvg scan the system font directory costs
    // roughly 850ms per render on Windows; skipping it drops that to ~250ms.
    ? { loadSystemFonts: false, fontFiles: explicitFonts, defaultFontFamily: fonts.serif || 'serif' }
    // Nothing was found on disk, so fall back to whatever fontconfig reports.
    : { loadSystemFonts: true, defaultFontFamily: 'serif' };

  const rendered = new Resvg(Buffer.from(buildLetterSvg(doc), 'utf8'), {
    font: fontOptions,
    fitTo: { mode: 'original' }
  }).render();

  const ink = countInk(rendered.pixels);

  // A page with any text at all clears this by a wide margin; a blank one is 0.
  if (ink < 2000) {
    throw new Error(
      `Court letter image rendered blank (ink=${ink}). No usable font was found. ` +
      'Install fonts-dejavu-core on the host or set COURT_LETTER_FONT_FILE.'
    );
  }

  const png = rendered.asPng();

  renderCache.set(key, png);
  if (renderCache.size > RENDER_CACHE_LIMIT) {
    renderCache.delete(renderCache.keys().next().value);
  }

  return png;
}

function isImageRenderingAvailable() {
  return !!Resvg && !!resolveFonts().serif;
}

module.exports = {
  renderCourtLetterPng,
  isImageRenderingAvailable,
  buildLetterSvg,
  wrapText,
  measure,
  resolveFonts,
  PAGE_W,
  PAGE_H
};
