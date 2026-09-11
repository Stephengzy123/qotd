"use client";

import { Fragment, type ReactNode } from "react";

const escapedCharacters: Record<string, string> = {
  "\\": "\uE000", _: "\uE001", "*": "\uE002", "|": "\uE003", "`": "\uE004", "#": "\uE005", "-": "\uE006",
};

function protectEscapes(text: string) {
  return text.replace(/\\([\\_*|`#-])/g, (_, character: string) => escapedCharacters[character]);
}

function restoreEscapes(text: string) {
  return Object.entries(escapedCharacters).reduce((result, [character, placeholder]) => result.replaceAll(placeholder, character), text);
}

function renderInline(text: string): ReactNode[] {
  const tokenPattern = /(`[^`\n]+`|\|\|.+?\|\||\*\*.+?\*\*|__.+?__|\*[^*\n]+?\*|_[^_\n]+?_|<@&?\d+>|<a?:[a-zA-Z0-9_]+:\d+>)/g;
  return text.split(tokenPattern).map((part, index) => {
    if (/^`[^`\n]+`$/.test(part)) return <code key={index}>{restoreEscapes(part.slice(1, -1))}</code>;
    if (/^\|\|.+\|\|$/.test(part)) return <span className="spoiler" tabIndex={0} key={index}>{restoreEscapes(part.slice(2, -2))}</span>;
    if (/^\*\*.+\*\*$/.test(part)) return <strong key={index}>{restoreEscapes(part.slice(2, -2))}</strong>;
    if (/^__.+__$/.test(part)) return <u key={index}>{restoreEscapes(part.slice(2, -2))}</u>;
    if (/^\*[^*]+\*$/.test(part) || /^_[^_]+_$/.test(part)) return <em key={index}>{restoreEscapes(part.slice(1, -1))}</em>;
    if (/^<@&?\d+>$/.test(part)) return <span className="role-mention" key={index}>{part.startsWith("<@&") ? "@role" : "@user"}</span>;
    const customEmoji = part.match(/^<a?:([a-zA-Z0-9_]+):\d+>$/);
    if (customEmoji) return <span className="custom-emoji" key={index}>:{customEmoji[1]}:</span>;
    return <Fragment key={index}>{restoreEscapes(part)}</Fragment>;
  });
}

export function DiscordMarkdown({ value }: { value: string }) {
  const blocks = value.split(/((?<!\\)```(?:[^\n`]*)\n?[\s\S]*?(?<!\\)```)/g);
  return blocks.map((block, blockIndex) => {
    if (block.startsWith("```") && block.endsWith("```")) {
      const inner = block.slice(3, -3);
      const newline = inner.indexOf("\n");
      const firstLine = newline >= 0 ? inner.slice(0, newline) : "";
      const hasLanguage = /^[a-zA-Z0-9_+-]+$/.test(firstLine.trim());
      return <pre key={blockIndex}><code>{hasLanguage ? inner.slice(newline + 1) : inner}</code></pre>;
    }
    return block.split("\n").map((rawLine, lineIndex) => {
      const line = protectEscapes(rawLine);
      const heading = line.match(/^(#{1,3})\s+(.+)$/);
      const subtext = line.match(/^-#\s+(.+)$/);
      const bullet = line.match(/^[-*]\s+(.+)$/);
      const key = `${blockIndex}-${lineIndex}`;
      if (heading) return <div className={`discord-heading h${heading[1].length}`} key={key}>{renderInline(heading[2])}</div>;
      if (subtext) return <div className="discord-subtext" key={key}>{renderInline(subtext[1])}</div>;
      if (bullet) return <div className="discord-bullet" key={key}>• {renderInline(bullet[1])}</div>;
      return <div className="discord-line" key={key}>{line ? renderInline(line) : <br />}</div>;
    });
  });
}
