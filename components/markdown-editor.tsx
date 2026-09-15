"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { RichTextEditor } from "@/components/rich-text-editor";

type EditorMode = "regular" | "discord";
const MODE_STORAGE_KEY = "announcement-editor-mode";

type Wrap = { kind: "wrap"; before: string; after?: string; placeholder: string };
type LinePrefix = { kind: "line"; prefix: string; placeholder: string; numbered?: boolean };
type Tool = { label: string; title: string; shortcut?: string; className?: string; action: Wrap | LinePrefix };

const TOOLS: Tool[] = [
  { label: "B", title: "Bold", shortcut: "b", className: "tool-bold", action: { kind: "wrap", before: "**", placeholder: "bold text" } },
  { label: "I", title: "Italic", shortcut: "i", className: "tool-italic", action: { kind: "wrap", before: "*", placeholder: "italic text" } },
  { label: "U", title: "Underline", shortcut: "u", className: "tool-underline", action: { kind: "wrap", before: "__", placeholder: "underlined text" } },
  { label: "S", title: "Strikethrough", className: "tool-strike", action: { kind: "wrap", before: "~~", placeholder: "struck text" } },
  { label: "H1", title: "Large heading", action: { kind: "line", prefix: "# ", placeholder: "Heading" } },
  { label: "H2", title: "Medium heading", action: { kind: "line", prefix: "## ", placeholder: "Heading" } },
  { label: "H3", title: "Small heading", action: { kind: "line", prefix: "### ", placeholder: "Heading" } },
  { label: "-#", title: "Subtext (small grey text)", action: { kind: "line", prefix: "-# ", placeholder: "subtext" } },
  { label: "❝", title: "Quote", action: { kind: "line", prefix: "> ", placeholder: "quote" } },
  { label: "•", title: "Bulleted list", action: { kind: "line", prefix: "- ", placeholder: "list item" } },
  { label: "1.", title: "Numbered list", action: { kind: "line", prefix: "1. ", placeholder: "list item", numbered: true } },
  { label: "🔗", title: "Link", action: { kind: "wrap", before: "[", after: "](https://example.com)", placeholder: "link text" } },
  { label: "</>", title: "Inline code", action: { kind: "wrap", before: "`", placeholder: "code" } },
  { label: "||", title: "Spoiler", action: { kind: "wrap", before: "||", placeholder: "hidden text" } },
];

type MarkdownEditorProps = {
  id: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  minLength?: number;
  maxLength?: number;
  required?: boolean;
  label?: ReactNode;
  heading?: ReactNode;
};

function applyTool(tool: Tool, value: string, start: number, end: number) {
  const action = tool.action;
  if (action.kind === "wrap") {
    const after = action.after ?? action.before;
    const selected = value.slice(start, end);
    const inner = selected || action.placeholder;
    // Toggle off when the selection is already wrapped with this marker.
    if (selected && value.slice(start - action.before.length, start) === action.before && value.slice(end, end + after.length) === after) {
      return { value: value.slice(0, start - action.before.length) + selected + value.slice(end + after.length), start: start - action.before.length, end: end - action.before.length };
    }
    const next = value.slice(0, start) + action.before + inner + after + value.slice(end);
    return { value: next, start: start + action.before.length, end: start + action.before.length + inner.length };
  }
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const lineEndIndex = value.indexOf("\n", end);
  const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
  const lines = value.slice(lineStart, lineEnd).split("\n");
  const prefixPattern = action.numbered ? /^\d+\. / : null;
  const allPrefixed = lines.every((line) => (prefixPattern ? prefixPattern.test(line) : line.startsWith(action.prefix)));
  const updated = lines.map((line, index) => {
    if (allPrefixed) return prefixPattern ? line.replace(prefixPattern, "") : line.slice(action.prefix.length);
    const prefix = action.numbered ? `${index + 1}. ` : action.prefix;
    return prefix + (line || (lines.length === 1 ? action.placeholder : ""));
  }).join("\n");
  const next = value.slice(0, lineStart) + updated + value.slice(lineEnd);
  return { value: next, start: lineStart, end: lineStart + updated.length };
}

export function MarkdownEditor({ id, name, value, onChange, rows = 10, minLength, maxLength, required, label = "Announcement", heading }: MarkdownEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [mode, setMode] = useState<EditorMode>("regular");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(MODE_STORAGE_KEY);
      if (saved === "discord" || saved === "regular") setMode(saved);
    } catch {
      // Private browsing or blocked storage keeps the default mode.
    }
  }, []);

  function switchMode(next: EditorMode) {
    setMode(next);
    try { window.localStorage.setItem(MODE_STORAGE_KEY, next); } catch { /* ignore */ }
  }

  function run(tool: Tool) {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const result = applyTool(tool, value, textarea.selectionStart, textarea.selectionEnd);
    onChange(result.value);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(result.start, result.end);
    });
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
    const tool = TOOLS.find((item) => item.shortcut === event.key.toLowerCase());
    if (!tool) return;
    event.preventDefault();
    run(tool);
  }

  return (
    <div className="markdown-editor">
      <div className="editor-heading">
        {heading ?? <label htmlFor={id}>{label}</label>}
        <div className="mode-switch" role="tablist" aria-label="Editor mode">
          <button type="button" role="tab" aria-selected={mode === "regular"} className={mode === "regular" ? "active" : undefined} onClick={() => switchMode("regular")}>Regular writing</button>
          <button type="button" role="tab" aria-selected={mode === "discord"} className={mode === "discord" ? "active" : undefined} onClick={() => switchMode("discord")}>Discord markup</button>
        </div>
      </div>
      {mode === "regular" ? <>
        <RichTextEditor id={id} label={typeof label === "string" ? label : "Message"} value={value} onChange={onChange} />
        {/* The form always submits Markdown, whichever mode is active. */}
        <textarea name={name} value={value} readOnly className="mirror-field" minLength={minLength} maxLength={maxLength} required={required} tabIndex={-1} aria-hidden="true" />
        <p className="hint">Formatting is converted to Discord markup automatically. Switch to Discord markup to see or edit the raw text.</p>
      </> : <>
        <div className="format-toolbar" role="toolbar" aria-label="Formatting">
          {TOOLS.map((tool) => <button type="button" key={tool.title} className={tool.className} title={tool.shortcut ? `${tool.title} (⌘/Ctrl+${tool.shortcut.toUpperCase()})` : tool.title} aria-label={tool.title} onMouseDown={(event) => event.preventDefault()} onClick={() => run(tool)}>{tool.label}</button>)}
        </div>
        <textarea ref={textareaRef} id={id} name={name} rows={rows} minLength={minLength} maxLength={maxLength} required={required} value={value} onChange={(event) => onChange(event.target.value)} onKeyDown={onKeyDown} />
      </>}
      <details className="format-help">
        <summary>Discord formatting</summary>
        <p>Select text and use the toolbar, or type the markers directly in Discord markup mode. <code>⌘/Ctrl+B</code> bold · <code>⌘/Ctrl+I</code> italic · <code>⌘/Ctrl+U</code> underline.</p>
        <p><code>#</code> heading · <code>##</code> smaller heading · <code>###</code> smallest heading · <code>-#</code> subtext</p>
        <p><code>**bold**</code> · <code>*italic*</code> · <code>__underline__</code> · <code>~~strikethrough~~</code> · <code>||spoiler||</code></p>
        <p><code>[text](https://example.com)</code> link · <code>&gt;</code> quote · <code>-</code> list · <code>1.</code> numbered list</p>
        <p><code>&gt;&gt;&gt;</code> multiline quote · <code>`code`</code> · <code>```md code block ```</code> · formatting can be combined</p>
        <p>Discord mentions, custom emoji, slash commands, channels, timestamps, and regular URLs are also previewed.</p>
        <p>Use a backslash to cancel formatting. Press Enter for a newline.</p>
      </details>
    </div>
  );
}
