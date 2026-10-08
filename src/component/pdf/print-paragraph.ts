import type { MdNode } from './print-markdown';

/** About three lines of Japanese body text. This is a reading target, not a clipping limit. */
const PARAGRAPH_TARGET = 120;
const OPEN_PAIRS: Record<string, string> = { '「': '」', '『': '』', '（': '）', '(': ')', '【': '】', '“': '”' };

function charsOf(node: MdNode, cache: Map<MdNode, string[]>): string[] {
  const cached = cache.get(node);
  if (cached) return cached;
  const chars =
    node.type === 'break'
      ? ['\n']
      : (node.children?.flatMap((child) => charsOf(child, cache)) ?? [...(node.value ?? '')]);
  cache.set(node, chars);
  return chars;
}

/** Links, code and raw HTML stay intact, including punctuation inside them. */
function protectedRanges(
  nodes: MdNode[],
  cache: Map<MdNode, string[]>,
  offset = 0,
  out: [number, number][] = [],
): [number, number][] {
  let at = offset;
  for (const node of nodes) {
    const length = charsOf(node, cache).length;
    if (['link', 'inlineCode', 'html'].includes(node.type)) out.push([at, at + length]);
    else if (node.children) protectedRanges(node.children, cache, at, out);
    at += length;
  }
  return out;
}

/** Slice inline nodes by Unicode code points; retain the enclosing formatting and link metadata. */
function sliceNodes(
  nodes: MdNode[],
  start: number,
  end: number,
  cache: Map<MdNode, string[]>,
  offsetsCache: Map<MdNode[], number[]>,
): MdNode[] {
  const out: MdNode[] = [];
  let offsets = offsetsCache.get(nodes);
  if (!offsets) {
    offsets = [0];
    for (const node of nodes) offsets.push(offsets[offsets.length - 1] + charsOf(node, cache).length);
    offsetsCache.set(nodes, offsets);
  }
  // A field containing many inline nodes must not rescan every earlier node for every paragraph.
  let low = 0;
  let high = nodes.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (offsets[middle + 1] <= start) low = middle + 1;
    else high = middle;
  }
  let at = offsets[low];
  for (let index = low; index < nodes.length && at < end; index += 1) {
    const node = nodes[index];
    const chars = charsOf(node, cache);
    const length = chars.length;
    const from = Math.max(0, start - at);
    const to = Math.min(length, end - at);
    if (from < to) {
      if (from === 0 && to === length) out.push(node);
      else if (node.children) out.push({ ...node, children: sliceNodes(node.children, from, to, cache, offsetsCache) });
      else out.push({ ...node, value: chars.slice(from, to).join('') });
    }
    at += length;
  }
  return out;
}

/**
 * Add breathing room to long prose at existing sentence endings. Never invent a sentence,
 * cut an unpunctuated sentence, split a quotation, or change the persisted Markdown.
 */
export function readableParagraphs(node: MdNode): MdNode[] {
  if (node.type !== 'paragraph' || !node.children) return [node];
  // A long field can produce hundreds of paragraphs. Decode each inline node once,
  // rather than expanding the whole original string again for every slice.
  const cache = new Map<MdNode, string[]>();
  const offsetsCache = new Map<MdNode[], number[]>();
  const chars = charsOf(node, cache);
  if (chars.length <= PARAGRAPH_TARGET) return [node];
  // Existing authored line breaks already express the reading structure. Splitting just
  // before one would introduce a blank leading line and make measured pagination unmatchable.
  if (chars.some((char) => char === '\n' || char === '\r')) return [node];
  const protectedSpans = protectedRanges(node.children, cache);
  let protectedIndex = 0;
  const closes: string[] = [];
  const ends: number[] = [];
  for (let i = 0; i < chars.length; i += 1) {
    while (protectedIndex < protectedSpans.length && protectedSpans[protectedIndex][1] <= i) protectedIndex += 1;
    const span = protectedSpans[protectedIndex];
    if (span && i >= span[0] && i < span[1]) continue;
    const char = chars[i];
    if (OPEN_PAIRS[char]) closes.push(OPEN_PAIRS[char]);
    else if (closes.at(-1) === char) closes.pop();
    else if (closes.length === 0 && /[。！？]/u.test(char) && !/[。！？\p{Mark}\u200d]/u.test(chars[i + 1] ?? ''))
      ends.push(i + 1);
  }
  if (ends.at(-1) !== chars.length) ends.push(chars.length);

  const cuts: number[] = [];
  let start = 0;
  let previous = 0;
  for (const end of ends) {
    if (end - start > PARAGRAPH_TARGET && previous > start) {
      cuts.push(previous);
      start = previous;
    }
    previous = end;
  }
  // Do not turn a terminal punctuation mark or a tiny tail into a paragraph of its own.
  if (
    cuts.length > 0 &&
    chars
      .slice(cuts[cuts.length - 1])
      .join('')
      .trim().length <= 2
  )
    cuts.pop();
  if (cuts.length === 0) return [node];
  cuts.push(chars.length);
  start = 0;
  return cuts.map((end) => {
    const paragraph = { ...node, children: sliceNodes(node.children ?? [], start, end, cache, offsetsCache) };
    start = end;
    return paragraph;
  });
}
