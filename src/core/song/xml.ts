/**
 * A small non-validating XML reader and writer, enough for MusicXML. It runs the same in the
 * browser and in Node (no DOMParser needed), handles comments, CDATA, processing instructions,
 * a DOCTYPE with an internal subset, and the predefined and numeric entities.
 */

/** An element: name, attributes and children (elements and text). */
export interface XmlElement {
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
}

/** A node: an element or a run of text. */
export type XmlNode = XmlElement | string;

const ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

function decode(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : all;
    }
    return ENTITIES[e] ?? all;
  });
}

/** Parse an XML document; returns its root element. Throws a RangeError on broken markup. */
export function parseXml(text: string): XmlElement {
  const root: XmlElement = { name: '#document', attrs: {}, children: [] };
  const stack: XmlElement[] = [root];
  let i = 0;
  const n = text.length;
  while (i < n) {
    const lt = text.indexOf('<', i);
    if (lt < 0) {
      pushText(text.slice(i));
      break;
    }
    if (lt > i) pushText(text.slice(i, lt));
    if (text.startsWith('<!--', lt)) {
      const end = text.indexOf('-->', lt + 4);
      if (end < 0) throw new RangeError('Unclosed XML comment.');
      i = end + 3;
    } else if (text.startsWith('<![CDATA[', lt)) {
      const end = text.indexOf(']]>', lt + 9);
      if (end < 0) throw new RangeError('Unclosed CDATA section.');
      stack[stack.length - 1].children.push(text.slice(lt + 9, end));
      i = end + 3;
    } else if (text.startsWith('<?', lt)) {
      const end = text.indexOf('?>', lt + 2);
      if (end < 0) throw new RangeError('Unclosed processing instruction.');
      i = end + 2;
    } else if (text.startsWith('<!', lt)) {
      // DOCTYPE, possibly with an internal subset in brackets.
      let j = lt + 2;
      let depth = 0;
      while (j < n) {
        const c = text[j];
        if (c === '[') depth++;
        else if (c === ']') depth--;
        else if (c === '>' && depth <= 0) break;
        j++;
      }
      i = j + 1;
    } else if (text[lt + 1] === '/') {
      const end = text.indexOf('>', lt);
      if (end < 0) throw new RangeError('Unclosed end tag.');
      const name = text.slice(lt + 2, end).trim();
      const open = stack.pop();
      if (!open || open.name !== name) throw new RangeError(`Mismatched XML end tag </${name}>${open ? ` (open: <${open.name}>)` : ''}.`);
      i = end + 1;
    } else {
      // Start tag: find its end outside quoted attribute values.
      let j = lt + 1;
      let quote = '';
      while (j < n) {
        const c = text[j];
        if (quote) {
          if (c === quote) quote = '';
        } else if (c === '"' || c === "'") quote = c;
        else if (c === '>') break;
        j++;
      }
      if (j >= n) throw new RangeError('Unclosed start tag.');
      let inner = text.slice(lt + 1, j);
      const selfClosing = inner.endsWith('/');
      if (selfClosing) inner = inner.slice(0, -1);
      const nameMatch = /^[^\s/>]+/.exec(inner);
      if (!nameMatch) throw new RangeError('A start tag without a name.');
      const el: XmlElement = { name: nameMatch[0], attrs: {}, children: [] };
      const attrRe = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
      let m: RegExpExecArray | null;
      const rest = inner.slice(nameMatch[0].length);
      while ((m = attrRe.exec(rest))) el.attrs[m[1]] = decode(m[3] ?? m[4] ?? '');
      stack[stack.length - 1].children.push(el);
      if (!selfClosing) stack.push(el);
      i = j + 1;
    }
  }
  if (stack.length > 1) throw new RangeError(`Unclosed XML element <${stack[stack.length - 1].name}>.`);
  const top = root.children.find((c): c is XmlElement => typeof c !== 'string');
  if (!top) throw new RangeError('The text has no XML element.');
  return top;

  function pushText(t: string): void {
    if (stack.length === 1) return;
    if (!t.trim()) return;
    stack[stack.length - 1].children.push(decode(t));
  }
}

/** Child elements, optionally only those with a name. */
export function kids(el: XmlElement | undefined, name?: string): XmlElement[] {
  if (!el) return [];
  return el.children.filter((c): c is XmlElement => typeof c !== 'string' && (!name || c.name === name));
}

/** The first child element with a name. */
export function kid(el: XmlElement | undefined, name: string): XmlElement | undefined {
  return el?.children.find((c): c is XmlElement => typeof c !== 'string' && c.name === name);
}

/** Text content of an element (or of its first child with a name), trimmed. */
export function textOf(el: XmlElement | undefined, name?: string): string {
  const target = name ? kid(el, name) : el;
  if (!target) return '';
  return target.children.map((c) => (typeof c === 'string' ? c : textOf(c))).join('').trim();
}

/** Number content of a child (NaN when missing). */
export function numOf(el: XmlElement | undefined, name: string): number {
  const t = textOf(el, name);
  return t === '' ? NaN : Number(t);
}

/** Escape text for XML content and attribute values. */
export function xmlEscape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Build an element string: tag(name, attrs, ...children) where children are strings already escaped or built. */
export function tag(name: string, attrs: Record<string, string | number | undefined> | null, ...children: Array<string | false | null | undefined>): string {
  const a = attrs ? Object.entries(attrs).filter(([, v]) => v !== undefined).map(([k, v]) => ` ${k}="${xmlEscape(String(v))}"`).join('') : '';
  const body = children.filter((c): c is string => typeof c === 'string' && c !== '').join('');
  return body ? `<${name}${a}>${body}</${name}>` : `<${name}${a}/>`;
}

/** A text element: `<step>C</step>`. */
export function leaf(name: string, value: string | number, attrs?: Record<string, string | number | undefined>): string {
  return tag(name, attrs ?? null, xmlEscape(String(value)));
}
