"use client";

import { Fragment, type ReactNode } from "react";

const escapedCharacters: Record<string, string> = {
  "\\": "\uE000", _: "\uE001", "*": "\uE002", "|": "\uE003", "`": "\uE004", "#": "\uE005", "-": "\uE006", "~": "\uE007", ">": "\uE008", "[": "\uE009", "]": "\uE00A", "(": "\uE00B", ")": "\uE00C",
};

function protectEscapes(text: string) {
  return text.replace(/\\([\\_*|`#~>\[\]()\-])/g, (_, character: string) => escapedCharacters[character]);
}

function restoreEscapes(text: string) {
  return Object.entries(escapedCharacters).reduce((result, [character, placeholder]) => result.replaceAll(placeholder, character), text);
}

function safeLink(value: string) {
  try {
    const url = new URL(restoreEscapes(value));
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

function timestampLabel(seconds: string, style = "f") {
  const date = new Date(Number(seconds) * 1000);
  if (Number.isNaN(date.getTime())) return "timestamp";
  if (style === "R") return date.toLocaleDateString();
  if (style === "t") return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (style === "T") return date.toLocaleTimeString();
  if (style === "d") return date.toLocaleDateString([], { dateStyle: "short" });
  if (style === "D") return date.toLocaleDateString([], { dateStyle: "long" });
  return date.toLocaleString([], { dateStyle: style === "F" ? "full" : "long", timeStyle: "short" });
}

function renderInline(text: string, keyPrefix = "inline"): ReactNode[] {
  const tokenPattern = /(`[^`\n]+`|\[[^\]\n]+\]\(https?:\/\/[^\s)]+\)|\|\|.+?\|\||__\*\*\*.+?\*\*\*__|__\*\*.+?\*\*__|__\*.+?\*__|\*\*\*.+?\*\*\*|~~.+?~~|\*\*.+?\*\*|__.+?__|\*[^*\n]+?\*|_[^_\n]+?_|<@&?\d+>|<#\d+>|<\/[^:>]+:\d+>|<t:\d+(?::[tTdDfFsSR])?>|<a?:[a-zA-Z0-9_]+:\d+>|https?:\/\/[^\s]+)/g;
  return text.split(tokenPattern).map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    if (/^`[^`\n]+`$/.test(part)) return <code key={key}>{restoreEscapes(part.slice(1, -1))}</code>;
    const link = part.match(/^\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)$/);
    if (link) {
      const href = safeLink(link[2]);
      return href ? <a className="discord-link" href={href} target="_blank" rel="noreferrer" key={key}>{renderInline(link[1], `${key}-link`)}</a> : <Fragment key={key}>{restoreEscapes(part)}</Fragment>;
    }
    if (/^\|\|.+\|\|$/.test(part)) return <span className="spoiler" tabIndex={0} key={key}>{renderInline(part.slice(2, -2), `${key}-spoiler`)}</span>;
    if (/^__\*\*\*.+\*\*\*__$/.test(part)) return <u key={key}><strong><em>{renderInline(part.slice(5, -5), `${key}-ubi`)}</em></strong></u>;
    if (/^__\*\*.+\*\*__$/.test(part)) return <u key={key}><strong>{renderInline(part.slice(4, -4), `${key}-ub`)}</strong></u>;
    if (/^__\*.+\*__$/.test(part)) return <u key={key}><em>{renderInline(part.slice(3, -3), `${key}-ui`)}</em></u>;
    if (/^\*\*\*.+\*\*\*$/.test(part)) return <strong key={key}><em>{renderInline(part.slice(3, -3), `${key}-bi`)}</em></strong>;
    if (/^~~.+~~$/.test(part)) return <s key={key}>{renderInline(part.slice(2, -2), `${key}-strike`)}</s>;
    if (/^\*\*.+\*\*$/.test(part)) return <strong key={key}>{renderInline(part.slice(2, -2), `${key}-bold`)}</strong>;
    if (/^__.+__$/.test(part)) return <u key={key}>{renderInline(part.slice(2, -2), `${key}-underline`)}</u>;
    if (/^\*[^*]+\*$/.test(part) || /^_[^_]+_$/.test(part)) return <em key={key}>{renderInline(part.slice(1, -1), `${key}-italic`)}</em>;
    if (/^<@&?\d+>$/.test(part)) return <span className="role-mention" key={key}>{part.startsWith("<@&") ? "@role" : "@user"}</span>;
    if (/^<#\d+>$/.test(part)) return <span className="role-mention" key={key}>#channel</span>;
    const command = part.match(/^<\/([^:>]+):\d+>$/);
    if (command) return <span className="role-mention" key={key}>/{command[1]}</span>;
    const timestamp = part.match(/^<t:(\d+)(?::([tTdDfFsSR]))?>$/);
    if (timestamp) return <span className="timestamp" key={key}>{timestampLabel(timestamp[1], timestamp[2])}</span>;
    const customEmoji = part.match(/^<(a?):([a-zA-Z0-9_]+):(\d+)>$/);
    if (customEmoji) return <img className="custom-emoji" src={`https://cdn.discordapp.com/emojis/${customEmoji[3]}.${customEmoji[1] ? "gif" : "webp"}?size=32&quality=lossless`} alt={`:${customEmoji[2]}:`} key={key} />;
    if (/^https?:\/\//.test(part)) {
      const href = safeLink(part);
      if (href) return <a className="discord-link" href={href} target="_blank" rel="noreferrer" key={key}>{restoreEscapes(part)}</a>;
    }
    return <Fragment key={key}>{restoreEscapes(part)}</Fragment>;
  });
}

export function DiscordMarkdown({ value }: { value: string }) {
  const blocks = protectEscapes(value).split(/(```(?:[^\n`]*)\n?[\s\S]*?```)/g);
  let multilineQuote = false;
  return blocks.flatMap((block, blockIndex) => {
    if (block.startsWith("```") && block.endsWith("```")) {
      const inner = restoreEscapes(block.slice(3, -3));
      const newline = inner.indexOf("\n");
      const firstLine = newline >= 0 ? inner.slice(0, newline) : "";
      const hasLanguage = /^[a-zA-Z0-9_+-]+$/.test(firstLine.trim());
      return <pre key={`code-${blockIndex}`}><code>{hasLanguage ? inner.slice(newline + 1) : inner}</code></pre>;
    }
    return block.split("\n").map((line, lineIndex) => {
      const heading = line.match(/^(#{1,3})\s+(.+)$/);
      const subtext = line.match(/^-#\s+(.+)$/);
      const quote = line.match(/^\s*(>>>|>)\s?(.*)$/);
      const bullet = line.match(/^(\s*)[-*]\s+(.+)$/);
      const numbered = line.match(/^(\s*)\d+[.)]\s+(.+)$/);
      const key = `${blockIndex}-${lineIndex}`;
      if (heading) return <div className={`discord-heading h${heading[1].length}`} key={key}>{renderInline(heading[2], key)}</div>;
      if (subtext) return <div className="discord-subtext" key={key}>{renderInline(subtext[1], key)}</div>;
      if (quote) {
        if (quote[1] === ">>>") multilineQuote = true;
        return <div className="discord-quote" key={key}>{renderInline(quote[2], key)}</div>;
      }
      if (multilineQuote) return <div className="discord-quote" key={key}>{line ? renderInline(line, key) : <br />}</div>;
      if (bullet) return <div className="discord-bullet" style={{ paddingLeft: `${0.75 + bullet[1].length * 0.35}rem` }} key={key}>• {renderInline(bullet[2], key)}</div>;
      if (numbered) return <div className="discord-bullet" style={{ paddingLeft: `${0.75 + numbered[1].length * 0.35}rem` }} key={key}>1. {renderInline(numbered[2], key)}</div>;
      return <div className="discord-line" key={key}>{line ? renderInline(line, key) : <br />}</div>;
    });
  });
}
