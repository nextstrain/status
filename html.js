/**
 * Safe-by-construction HTML strings via [template literals]{@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals#tagged_templates}.
 *
 * Interpolations in the template literal are automatically HTML-escaped.
 *
 * @module html
 */

class LiteralHTML extends String {}

export default function html(literalParts, ...exprParts) {
  /* The tagged template literal is given to us as two lists: the literal parts
   * and the interpolated expression values (i.e. the evaluation of … inside
   * ${…}).  We zip and concatenate the two lists together while HTML-escaping
   * the interpolated values.
   *
   * There is always one more literal part than expression part—though it may
   * be the empty string—and the whole template literal starts with the first
   * literal part.
   *   -trs, 4 May 2023
   */
  return literalParts.slice(1).reduce(
    (str, literalPart, idx) => new LiteralHTML(`${str}${htmlEscape(exprParts[idx])}${literalPart}`),
    literalParts[0]
  );
}

function htmlEscape(value) {
  if (Array.isArray(value)) {
    return value.map(htmlEscape).join("");
  }
  return value instanceof LiteralHTML
    ? value
    : String(value).replace(/[&<>"']/g, x => `&#${x.charCodeAt(0)};`)
}
