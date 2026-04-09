import type { Character } from '../../types/adrastea.types';

export const COLOR_TEXT_PRIMARY = '#e0e0e0';
export const COLOR_TEXT_MUTED = '#707070';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** {ラベル名} を選択中キャラの statuses/parameters の value で置換 */
export function resolveTemplateVars(text: string, character: Character | null): string {
  if (!character) return text;
  return text.replace(/\{([^}]+)\}/g, (match, label: string) => {
    const key = label.trim();
    if (key === 'name') return character.name;
    const status = character.statuses.find((s) => s.label === key);
    if (status) return String(status.value);
    const param = character.parameters.find((p) => p.label === key);
    if (param) return String(param.value);
    return match; // 該当なしならそのまま残す
  });
}

function parseInlineHtml(text: string): string {
  const markupRegex = /(<color=#[a-fA-F0-9]{6}>.*?<\/color>|\*\*.*?\*\*|~~.*?~~|(?<!\*)\*(?!\*).*?(?<!\*)\*(?!\*))/g;
  let result = '';
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = markupRegex.exec(text)) !== null) {
    const before = text.slice(lastIndex, match.index);
    if (before) result += esc(before);

    const m = match[0];
    if (m.startsWith('<color=')) {
      const cm = m.match(/<color=(#[a-fA-F0-9]{6})>(.*?)<\/color>/);
      if (cm) {
        const [, color, inner] = cm;
        result += `<span style="color:${COLOR_TEXT_MUTED}">&lt;color=${color}&gt;</span>`
          + `<span style="color:${color}">${esc(inner)}</span>`
          + `<span style="color:${COLOR_TEXT_MUTED}">&lt;/color&gt;</span>`;
      }
    } else if (m.startsWith('**') && m.endsWith('**')) {
      const inner = m.slice(2, -2);
      result += `<span style="color:${COLOR_TEXT_MUTED}">**</span>`
        + `<strong style="color:${COLOR_TEXT_PRIMARY}">${esc(inner)}</strong>`
        + `<span style="color:${COLOR_TEXT_MUTED}">**</span>`;
    } else if (m.startsWith('~~') && m.endsWith('~~')) {
      const inner = m.slice(2, -2);
      result += `<span style="color:${COLOR_TEXT_MUTED}">~~</span>`
        + `<span style="text-decoration:line-through;color:${COLOR_TEXT_PRIMARY}">${esc(inner)}</span>`
        + `<span style="color:${COLOR_TEXT_MUTED}">~~</span>`;
    } else if (m.startsWith('*') && m.endsWith('*')) {
      const inner = m.slice(1, -1);
      result += `<span style="color:${COLOR_TEXT_MUTED}">*</span>`
        + `<em style="color:${COLOR_TEXT_PRIMARY}">${esc(inner)}</em>`
        + `<span style="color:${COLOR_TEXT_MUTED}">*</span>`;
    }
    lastIndex = match.index + m.length;
  }

  const trailing = text.slice(lastIndex);
  if (trailing) result += esc(trailing);
  return result;
}

export function highlightMarkup(code: string): string {
  const lines = code.split('\n');
  let html = lines.map((line) => {
    let hashCount = 0;
    while (hashCount < line.length && line[hashCount] === '#') hashCount++;
    const isHeading = hashCount > 0 && (line[hashCount] === ' ' || line.length === hashCount);

    if (isHeading) {
      const marker = line.slice(0, hashCount + 1);
      const content = line.slice(hashCount + 1);
      let fontSize = '13px';
      if (hashCount === 1) fontSize = '18px';
      else if (hashCount === 2) fontSize = '15px';
      return `<span style="color:${COLOR_TEXT_MUTED};font-size:${fontSize}">${esc(marker)}</span>`
        + `<span style="font-size:${fontSize}">${parseInlineHtml(content)}</span>`;
    }

    return parseInlineHtml(line);
  }).join('<br>');

  // 末尾が改行で終わる場合、sentinel <br> を追加
  // これがないと contentEditable の innerText が末尾の改行を吸収してしまう
  if (code.endsWith('\n')) {
    html += '<br>';
  }

  return html;
}

// 選択範囲の start と end のオフセットを取得
export function getSelectionOffsets(el: HTMLElement): { start: number; end: number } | null {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  const range = sel.getRangeAt(0);
  if (!el.contains(range.startContainer) || !el.contains(range.endContainer)) return null;

  function calcOffset(container: Node, containerOffset: number): number {
    let offset = 0;
    let found = false;

    function countAll(node: Node) {
      if (node.nodeType === Node.TEXT_NODE) {
        offset += node.textContent?.length ?? 0;
      } else if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName === 'BR') {
        offset += 1;
      } else {
        for (let i = 0; i < node.childNodes.length; i++) countAll(node.childNodes[i]);
      }
    }

    function walk(node: Node): boolean {
      if (found) return true;
      if (node === container) {
        if (node.nodeType === Node.TEXT_NODE) {
          offset += containerOffset;
        } else {
          for (let i = 0; i < containerOffset; i++) {
            const child = node.childNodes[i];
            if (child) countAll(child);
          }
        }
        found = true;
        return true;
      }
      if (node.nodeType === Node.TEXT_NODE) {
        offset += node.textContent?.length ?? 0;
      } else if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName === 'BR') {
        offset += 1;
      } else {
        for (let i = 0; i < node.childNodes.length; i++) {
          if (walk(node.childNodes[i])) return true;
        }
      }
      return false;
    }

    walk(el);
    return offset;
  }

  const start = calcOffset(range.startContainer, range.startOffset);
  const end = calcOffset(range.endContainer, range.endOffset);
  return { start, end };
}

// カーソル位置を文字オフセットとして取得
export function getCursorOffset(el: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return 0;
  const range = sel.getRangeAt(0);
  if (!el.contains(range.endContainer)) return 0;

  let offset = 0;
  let found = false;

  function countAll(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      offset += node.textContent?.length ?? 0;
    } else if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName === 'BR') {
      offset += 1;
    } else {
      for (let i = 0; i < node.childNodes.length; i++) {
        countAll(node.childNodes[i]);
      }
    }
  }

  function walk(node: Node): boolean {
    if (found) return true;
    if (node === range.endContainer) {
      if (node.nodeType === Node.TEXT_NODE) {
        offset += range.endOffset;
      } else {
        // element node: endOffset は childNodes のインデックス
        for (let i = 0; i < range.endOffset; i++) {
          const child = node.childNodes[i];
          if (child) countAll(child);
        }
      }
      found = true;
      return true;
    }

    if (node.nodeType === Node.TEXT_NODE) {
      offset += node.textContent?.length ?? 0;
    } else if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName === 'BR') {
      offset += 1;
    } else {
      for (let i = 0; i < node.childNodes.length; i++) {
        if (walk(node.childNodes[i])) return true;
      }
    }
    return false;
  }

  walk(el);
  return offset;
}

// 文字オフセットにカーソルを復元
export function setCursorOffset(el: HTMLElement, offset: number) {
  const sel = window.getSelection();
  if (!sel) return;

  let remaining = offset;

  function walk(node: Node): boolean {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = node.textContent?.length ?? 0;
      if (remaining <= len) {
        const r = document.createRange();
        r.setStart(node, remaining);
        r.collapse(true);
        sel!.removeAllRanges();
        sel!.addRange(r);
        return true;
      }
      remaining -= len;
    } else if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName === 'BR') {
      if (remaining === 0) {
        const r = document.createRange();
        r.setStartBefore(node);
        r.collapse(true);
        sel!.removeAllRanges();
        sel!.addRange(r);
        return true;
      }
      remaining -= 1;
    } else {
      for (let i = 0; i < node.childNodes.length; i++) {
        if (walk(node.childNodes[i])) return true;
      }
    }
    return false;
  }

  if (!walk(el)) {
    // 末尾に設定
    const r = document.createRange();
    r.selectNodeContents(el);
    r.collapse(false);
    sel.removeAllRanges();
    sel.addRange(r);
  }

  // span 内テキストノードの末尾にカーソルがある場合、span の外に移動する
  // Chrome は span 末尾にカーソルがあると次の入力を span 外の新テキストノードに
  // 追加するため、getCursorOffset が正しいオフセットを返せなくなる
  const cur = sel.getRangeAt(0);
  if (
    cur.startContainer.nodeType === Node.TEXT_NODE &&
    cur.startOffset === (cur.startContainer.textContent?.length ?? 0) &&
    cur.startContainer.parentElement &&
    cur.startContainer.parentElement !== el
  ) {
    const parent = cur.startContainer.parentElement;
    const r = document.createRange();
    r.setStartAfter(parent);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
  }
}
