// Converts between Discord Markdown and the HTML used by the rich text editor.
// The Markdown string stays the source of truth; HTML exists only while editing.

const ESCAPABLE = /[\\*_~`|]/g;

function escapeHtml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function safeHref(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

const placeholders: Record<string, string> = {
  "\\": "", _: "", "*": "", "|": "", "`": "", "#": "", "-": "", "~": "", ">": "", "[": "", "]": "", "(": "", ")": "",
};

function protect(text: string) {
  return text.replace(/\\([\\_*|`#~>\[\]()\-])/g, (_, character: string) => placeholders[character]);
}

function restore(text: string) {
  return Object.entries(placeholders).reduce((result, [character, placeholder]) => result.replaceAll(placeholder, character), text);
}

const INLINE_PATTERN = /(`[^`\n]+`|\[[^\]\n]+\]\(https?:\/\/[^\s)]+\)|\|\|.+?\|\||__\*\*\*.+?\*\*\*__|__\*\*.+?\*\*__|__\*.+?\*__|\*\*\*.+?\*\*\*|~~.+?~~|\*\*.+?\*\*|__.+?__|\*[^*\n]+?\*|_[^_\n]+?_)/g;

function inlineToHtml(text: string): string {
  return text.split(INLINE_PATTERN).map((part) => {
    if (!part) return "";
    if (/^`[^`\n]+`$/.test(part)) return `<code>${escapeHtml(restore(part.slice(1, -1)))}</code>`;
    const link = part.match(/^\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)$/);
    if (link) {
      const href = safeHref(restore(link[2]));
      return href ? `<a href="${escapeHtml(href)}">${inlineToHtml(link[1])}</a>` : escapeHtml(restore(part));
    }
    if (/^\|\|.+\|\|$/.test(part)) return `<span class="spoiler">${inlineToHtml(part.slice(2, -2))}</span>`;
    if (/^__\*\*\*.+\*\*\*__$/.test(part)) return `<u><strong><em>${inlineToHtml(part.slice(5, -5))}</em></strong></u>`;
    if (/^__\*\*.+\*\*__$/.test(part)) return `<u><strong>${inlineToHtml(part.slice(4, -4))}</strong></u>`;
    if (/^__\*.+\*__$/.test(part)) return `<u><em>${inlineToHtml(part.slice(3, -3))}</em></u>`;
    if (/^\*\*\*.+\*\*\*$/.test(part)) return `<strong><em>${inlineToHtml(part.slice(3, -3))}</em></strong>`;
    if (/^~~.+~~$/.test(part)) return `<s>${inlineToHtml(part.slice(2, -2))}</s>`;
    if (/^\*\*.+\*\*$/.test(part)) return `<strong>${inlineToHtml(part.slice(2, -2))}</strong>`;
    if (/^__.+__$/.test(part)) return `<u>${inlineToHtml(part.slice(2, -2))}</u>`;
    if (/^\*[^*]+\*$/.test(part) || /^_[^_]+_$/.test(part)) return `<em>${inlineToHtml(part.slice(1, -1))}</em>`;
    return escapeHtml(restore(part));
  }).join("");
}

export function markdownToHtml(markdown: string) {
  const normalized = markdown.replace(/\r\n?/g, "\n");
  const blocks = protect(normalized).split(/(```(?:[^\n`]*)\n?[\s\S]*?```)/g);
  const html: string[] = [];
  let listTag: "ul" | "ol" | null = null;
  const closeList = () => { if (listTag) { html.push(`</${listTag}>`); listTag = null; } };
  blocks.forEach((block, blockIndex) => {
    if (block.startsWith("```") && block.endsWith("```")) {
      closeList();
      const raw = restore(block.slice(3, -3));
      const language = raw.match(/^([a-zA-Z0-9_+-]+)\n/);
      const inner = (language ? raw.slice(language[0].length) : raw).replace(/^\n/, "").replace(/\n$/, "");
      html.push(`<pre${language ? ` data-lang="${escapeHtml(language[1])}"` : ""}>${escapeHtml(inner)}</pre>`);
      return;
    }
    const lines = block.split("\n");
    // A code block boundary splits a line in two; skip the empty remainder.
    if (blockIndex > 0 && lines[0] === "") lines.shift();
    if (blockIndex < blocks.length - 1 && lines[lines.length - 1] === "") lines.pop();
    for (const line of lines) {
      const heading = line.match(/^(#{1,3})\s+(.+)$/);
      const subtext = line.match(/^-#\s+(.+)$/);
      const quote = line.match(/^>\s?(.*)$/);
      const bullet = line.match(/^\s*[-*]\s+(.+)$/);
      const numbered = line.match(/^\s*\d+[.)]\s+(.+)$/);
      const item = bullet || numbered;
      if (item) {
        const tag = bullet ? "ul" : "ol";
        if (listTag !== tag) { closeList(); listTag = tag; html.push(`<${tag}>`); }
        html.push(`<li>${inlineToHtml(item[1])}</li>`);
        continue;
      }
      closeList();
      if (heading) html.push(`<h${heading[1].length}>${inlineToHtml(heading[2])}</h${heading[1].length}>`);
      else if (subtext) html.push(`<h6>${inlineToHtml(subtext[1])}</h6>`);
      else if (quote) html.push(`<blockquote>${quote[1] ? inlineToHtml(quote[1]) : "<br>"}</blockquote>`);
      else html.push(`<div>${line ? inlineToHtml(line) : "<br>"}</div>`);
    }
  });
  closeList();
  return html.join("");
}

function escapeText(text: string) {
  return text.replace(ESCAPABLE, (character) => `\\${character}`);
}

// Line-leading characters that Discord would treat as block syntax.
function escapeLineStart(line: string) {
  return line.replace(/^(\s*)([#>-])/, "$1\\$2");
}

const BLOCK_TAGS = /^(div|p|h[1-6]|ul|ol|blockquote|pre)$/i;

function serializeInline(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return escapeText((node.textContent || "").replace(/\n/g, " "));
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const element = node as HTMLElement;
  const tag = element.tagName.toLowerCase();
  const inner = () => Array.from(element.childNodes).map(serializeInline).join("");
  if (tag === "br") return "\n";
  if (tag === "code") return `\`${(element.textContent || "").replace(/`/g, "")}\``;
  if (tag === "a") {
    const href = safeHref(element.getAttribute("href") || "");
    return href ? `[${inner()}](${href})` : inner();
  }
  if (element.classList.contains("spoiler")) return `||${inner()}||`;
  const style = element.style;
  let text = inner();
  if (!text) return "";
  const decoration = `${style.textDecoration} ${style.textDecorationLine}`;
  const bold = tag === "b" || tag === "strong" || style.fontWeight === "bold" || Number(style.fontWeight) >= 600;
  const italic = tag === "i" || tag === "em" || style.fontStyle === "italic";
  const underline = tag === "u" || decoration.includes("underline");
  const strike = tag === "s" || tag === "strike" || tag === "del" || decoration.includes("line-through");
  // Keep whitespace outside the markers; Discord ignores "** bold **".
  const leading = text.match(/^\s*/)![0];
  const trailing = text.match(/\s*$/)![0];
  text = text.trim();
  if (!text) return leading;
  if (bold) text = `**${text}**`;
  if (italic) text = `*${text}*`;
  if (strike) text = `~~${text}~~`;
  if (underline) text = `__${text}__`;
  return leading + text + trailing;
}

function serializeBlock(node: Node, lines: string[]) {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = serializeInline(node);
    if (text.trim()) lines.push(escapeLineStart(text));
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const element = node as HTMLElement;
  const tag = element.tagName.toLowerCase();
  const inlineText = () => Array.from(element.childNodes).map(serializeInline).join("");
  if (tag === "pre") { lines.push(`\`\`\`${element.dataset.lang || ""}`, ...(element.textContent || "").replace(/\n$/, "").split("\n"), "```"); return; }
  if (/^h[1-3]$/.test(tag)) { lines.push(`${"#".repeat(Number(tag[1]))} ${inlineText().trim()}`); return; }
  if (/^h[4-6]$/.test(tag)) { lines.push(`-# ${inlineText().trim()}`); return; }
  if (tag === "blockquote") { for (const line of inlineText().split("\n")) lines.push(`> ${line}`); return; }
  if (tag === "ul" || tag === "ol") {
    let index = 0;
    for (const child of Array.from(element.children)) {
      if (child.tagName.toLowerCase() !== "li") continue;
      index += 1;
      const nested: string[] = [];
      const inlineParts: string[] = [];
      for (const grand of Array.from(child.childNodes)) {
        if (grand.nodeType === Node.ELEMENT_NODE && /^(ul|ol)$/i.test((grand as HTMLElement).tagName)) serializeBlock(grand, nested);
        else inlineParts.push(serializeInline(grand));
      }
      lines.push(`${tag === "ul" ? "-" : `${index}.`} ${inlineParts.join("").trim()}`);
      for (const line of nested) lines.push(`  ${line}`);
    }
    return;
  }
  if (tag === "div" || tag === "p" || tag === "li") {
    const hasBlockChildren = Array.from(element.children).some((child) => BLOCK_TAGS.test(child.tagName));
    if (hasBlockChildren) {
      for (const child of Array.from(element.childNodes)) serializeBlock(child, lines);
      return;
    }
    for (const line of inlineText().split("\n")) lines.push(escapeLineStart(line));
    return;
  }
  // Inline element at the top level (Firefox sometimes skips wrapper divs).
  for (const line of serializeInline(element).split("\n")) lines.push(escapeLineStart(line));
}

export function htmlToMarkdown(root: HTMLElement) {
  const lines: string[] = [];
  let pending = "";
  for (const child of Array.from(root.childNodes)) {
    const isElement = child.nodeType === Node.ELEMENT_NODE;
    const isInline = child.nodeType === Node.TEXT_NODE || (isElement && !BLOCK_TAGS.test((child as HTMLElement).tagName));
    if (isInline) {
      if (isElement && (child as HTMLElement).tagName === "BR") { lines.push(escapeLineStart(pending)); pending = ""; }
      else pending += serializeInline(child);
      continue;
    }
    if (pending) { lines.push(escapeLineStart(pending)); pending = ""; }
    serializeBlock(child, lines);
  }
  if (pending) lines.push(escapeLineStart(pending));
  return lines.join("\n").replace(/ /g, " ").replace(/\n{3,}/g, "\n\n").replace(/\s+$/, "");
}
