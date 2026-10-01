/**
 * Benefits City — embeddable live badge (SVG). Anyone can embed it; every embed is a contextual backlink.
 * Text is XML-escaped; width is derived from the text so nothing is clipped.
 */
import { xmlEscape } from "./changelog.js";

export function badgeSvg(count: number, checked: string | null): string {
  const label = "Benefits City";
  const value = `${count} offers${checked ? ` · updated ${checked}` : ""}`;
  const lw = Math.round(label.length * 6.6 + 18);
  const vw = Math.round(value.length * 6.2 + 18);
  const w = lw + vw;
  const t = `${xmlEscape(label)}: ${xmlEscape(value)}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="22" role="img" aria-label="${t}">
<title>${t}</title>
<rect width="${lw}" height="22" rx="4" fill="#3730a3"/>
<rect x="${lw}" width="${vw}" height="22" rx="4" fill="#0f766e"/>
<rect x="${lw - 4}" width="8" height="22" fill="#3730a3"/>
<rect x="${lw}" width="4" height="22" fill="#0f766e"/>
<g fill="#fff" font-family="Verdana,DejaVu Sans,sans-serif" font-size="11" text-anchor="middle">
<text x="${Math.round(lw / 2)}" y="15">${xmlEscape(label)}</text>
<text x="${lw + Math.round(vw / 2)}" y="15">${xmlEscape(value)}</text>
</g>
</svg>
`;
}
