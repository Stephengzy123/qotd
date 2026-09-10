"use client";

import { Fragment, useState, type ReactNode } from "react";

const escapedCharacters: Record<string, string> = {
  "\\": "\uE000",
  "_": "\uE001",
  "*": "\uE002",
  "|": "\uE003",
  "`": "\uE004",
  "#": "\uE005",
  "-": "\uE006",
};

function protectEscapes(text: string) {
  return text.replace(/\\([\\_*|`#-])/g, (_, character: string) => escapedCharacters[character]);
}

function restoreEscapes(text: string) {
  return Object.entries(escapedCharacters).reduce(
    (result, [character, placeholder]) => result.replaceAll(placeholder, character),
    text,
  );
}

function renderInline(text: string): ReactNode[] {
  const tokenPattern = /(`[^`\n]+`|\|\|.+?\|\||\*\*.+?\*\*|__.+?__|\*[^*\n]+?\*|_[^_\n]+?_|<@&\d+>)/g;
  const parts = text.split(tokenPattern);
  return parts.map((part, index) => {
    if (/^`[^`\n]+`$/.test(part)) return <code key={index}>{restoreEscapes(part.slice(1, -1))}</code>;
    if (/^\|\|.+\|\|$/.test(part)) return <span className="spoiler" tabIndex={0} key={index}>{restoreEscapes(part.slice(2, -2))}</span>;
    if (/^\*\*.+\*\*$/.test(part)) return <strong key={index}>{restoreEscapes(part.slice(2, -2))}</strong>;
    if (/^__.+__$/.test(part)) return <u key={index}>{restoreEscapes(part.slice(2, -2))}</u>;
    if (/^\*[^*]+\*$/.test(part) || /^_[^_]+_$/.test(part)) return <em key={index}>{restoreEscapes(part.slice(1, -1))}</em>;
    if (/^<@&\d+>$/.test(part)) return <span className="role-mention" key={index}>@role</span>;
    return <Fragment key={index}>{restoreEscapes(part)}</Fragment>;
  });
}

function DiscordMarkdown({ value }: { value: string }) {
  const blocks = value.split(/((?<!\\)```(?:[^\n`]*)\n?[\s\S]*?(?<!\\)```)/g);
  return blocks.map((block, blockIndex) => {
    if (block.startsWith("```") && block.endsWith("```")) {
      const inner = block.slice(3, -3);
      const newline = inner.indexOf("\n");
      const firstLine = newline >= 0 ? inner.slice(0, newline) : "";
      const hasLanguage = /^[a-zA-Z0-9_+-]+$/.test(firstLine.trim());
      const code = hasLanguage ? inner.slice(newline + 1) : inner;
      return <pre key={blockIndex}><code>{code}</code></pre>;
    }

    return block.split("\n").map((rawLine, lineIndex) => {
      const line = protectEscapes(rawLine);
      const heading = line.match(/^(#{1,3})\s+(.+)$/);
      const subtext = line.match(/^-#\s+(.+)$/);
      const bullet = line.match(/^[-*]\s+(.+)$/);
      const key = `${blockIndex}-${lineIndex}`;
      if (heading) {
        const level = heading[1].length;
        return <div className={`discord-heading h${level}`} key={key}>{renderInline(heading[2])}</div>;
      }
      if (subtext) return <div className="discord-subtext" key={key}>{renderInline(subtext[1])}</div>;
      if (bullet) return <div className="discord-bullet" key={key}>• {renderInline(bullet[1])}</div>;
      return <div className="discord-line" key={key}>{line ? renderInline(line) : <br />}</div>;
    });
  });
}

export function TemplateEditor({ initialOpenValue, initialReactionValue, initialRoleId, initialNextNumber }: { initialOpenValue: string; initialReactionValue: string; initialRoleId: string; initialNextNumber: number }) {
  const [openValue, setOpenValue] = useState(initialOpenValue);
  const [reactionValue, setReactionValue] = useState(initialReactionValue);
  const [roleId, setRoleId] = useState(initialRoleId);
  const [nextNumber, setNextNumber] = useState(String(initialNextNumber));
  const preview = (value: string, question: string) => value
      .replaceAll("{date}", "Tuesday, September 9, 2026")
      .replaceAll("{question}", question)
      .replaceAll("{number}", nextNumber || "—")
      .replaceAll("{mention-role}", roleId ? `<@&${roleId}>` : "@role");

  return (
    <>
      <div>
        <label htmlFor="roleId">Role ID for {"{mention-role}"}</label>
        <input id="roleId" name="roleId" inputMode="numeric" pattern="[0-9]{15,22}" value={roleId} onChange={(event) => setRoleId(event.target.value.replace(/\D/g, ""))} placeholder="123456789012345678" />
      </div>
      <div>
        <label htmlFor="nextNumber">Next {"{number}"}</label>
        <input id="nextNumber" name="nextNumber" type="number" min="1" max="2147483646" step="1" required value={nextNumber} onChange={(event) => setNextNumber(event.target.value)} />
        <p className="hint">The next successful send uses this number, then it increases by one.</p>
      </div>
      <div className="template-block">
        <h3>Open-answer message</h3>
        <div className="template-grid">
          <div>
            <label htmlFor="openTemplate">Format</label>
            <textarea id="openTemplate" name="openTemplate" rows={8} maxLength={1800} required value={openValue} onChange={(event) => setOpenValue(event.target.value)} />
          </div>
          <div>
            <span className="label">Preview</span>
            <div className="discord-preview"><DiscordMarkdown value={preview(openValue, "What small habit has made your life noticeably better?")} /></div>
          </div>
        </div>
      </div>
      <div className="template-block">
        <h3>Reaction-based message</h3>
        <div className="template-grid">
          <div>
            <label htmlFor="reactionTemplate">Format</label>
            <textarea id="reactionTemplate" name="reactionTemplate" rows={8} maxLength={1800} required value={reactionValue} onChange={(event) => setReactionValue(event.target.value)} />
          </div>
          <div>
            <span className="label">Preview</span>
            <div className="discord-preview"><DiscordMarkdown value={preview(reactionValue, "Which option gets your vote?")} /></div>
          </div>
        </div>
      </div>
      <div>
        <p className="hint token-help">
          <code>{"{question}"}</code> question · <code>{"{date}"}</code> Pacific date · <code>{"{number}"}</code> next successful-send number · <code>{"{mention-role}"}</code> configured role
        </p>
        <details className="format-help">
          <summary>Discord formatting</summary>
          <p><code>#</code> heading · <code>##</code> smaller heading · <code>###</code> smallest heading · <code>-#</code> subtext</p>
          <p><code>**bold**</code> · <code>__underline__</code> · <code>*italic*</code> · <code>||spoiler||</code> · <code>`code`</code> · <code>```md code block ```</code></p>
          <p>Use a backslash to cancel formatting: <code>{"\\_literal underscores\\_"}</code>. Press Enter for a newline; <code>{"\\n"}</code> stays literal.</p>
        </details>
      </div>
    </>
  );
}
