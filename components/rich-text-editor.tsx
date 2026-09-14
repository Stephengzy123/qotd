"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";
import { htmlToMarkdown, markdownToHtml } from "@/lib/discord-rich-text";

type Command = { label: string; title: string; shortcut?: string; className?: string; run: (editor: HTMLDivElement) => void };

function exec(command: string, value?: string) {
  document.execCommand(command, false, value);
}

function formatBlock(tag: string) {
  return () => {
    const current = String(document.queryCommandValue("formatBlock") || "").toLowerCase();
    exec("formatBlock", current === tag ? "div" : tag);
  };
}

function wrapSelection(build: () => HTMLElement, matches: (element: Element) => boolean) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  const anchor = range.commonAncestorContainer;
  const existing = (anchor.nodeType === Node.ELEMENT_NODE ? (anchor as Element) : anchor.parentElement)?.closest("code, .spoiler");
  if (existing && matches(existing)) {
    // Toggle off: unwrap the existing element.
    const parent = existing.parentNode;
    if (!parent) return;
    while (existing.firstChild) parent.insertBefore(existing.firstChild, existing);
    parent.removeChild(existing);
    return;
  }
  if (range.collapsed) return;
  const element = build();
  element.appendChild(range.extractContents());
  range.insertNode(element);
  selection.removeAllRanges();
  const next = document.createRange();
  next.selectNodeContents(element);
  selection.addRange(next);
}

const COMMANDS: Command[] = [
  { label: "B", title: "Bold", shortcut: "b", className: "tool-bold", run: () => exec("bold") },
  { label: "I", title: "Italic", shortcut: "i", className: "tool-italic", run: () => exec("italic") },
  { label: "U", title: "Underline", shortcut: "u", className: "tool-underline", run: () => exec("underline") },
  { label: "S", title: "Strikethrough", className: "tool-strike", run: () => exec("strikeThrough") },
  { label: "H1", title: "Large heading", run: formatBlock("h1") },
  { label: "H2", title: "Medium heading", run: formatBlock("h2") },
  { label: "H3", title: "Small heading", run: formatBlock("h3") },
  { label: "-#", title: "Subtext (small grey text)", run: formatBlock("h6") },
  { label: "❝", title: "Quote", run: formatBlock("blockquote") },
  { label: "•", title: "Bulleted list", run: () => exec("insertUnorderedList") },
  { label: "1.", title: "Numbered list", run: () => exec("insertOrderedList") },
  { label: "🔗", title: "Link", run: () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) { window.alert("Select the text you want to turn into a link first."); return; }
    const url = window.prompt("Link URL (https://…)");
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) { window.alert("Links must start with http:// or https://"); return; }
    exec("createLink", url);
  } },
  { label: "</>", title: "Inline code", run: () => wrapSelection(() => document.createElement("code"), (element) => element.tagName === "CODE") },
  { label: "||", title: "Spoiler", run: () => wrapSelection(() => { const span = document.createElement("span"); span.className = "spoiler"; return span; }, (element) => element.classList.contains("spoiler")) },
  { label: "Tx", title: "Clear formatting", run: () => { exec("removeFormat"); exec("unlink"); exec("formatBlock", "div"); } },
];

type RichTextEditorProps = { id: string; value: string; onChange: (markdown: string) => void };

// A contenteditable surface that keeps the Markdown string as its real value.
export function RichTextEditor({ id, value, onChange }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastEmitted = useRef<string | null>(null);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || value === lastEmitted.current) return;
    // Only rebuild the DOM for external changes, so typing keeps the caret.
    editor.innerHTML = markdownToHtml(value) || "<div><br></div>";
    lastEmitted.current = value;
  }, [value]);

  function emit() {
    const editor = editorRef.current;
    if (!editor) return;
    const markdown = htmlToMarkdown(editor);
    lastEmitted.current = markdown;
    onChange(markdown);
  }

  function run(command: Command) {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    exec("styleWithCSS", "false");
    command.run(editor);
    emit();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
    const command = COMMANDS.find((item) => item.shortcut === event.key.toLowerCase());
    if (!command) return;
    event.preventDefault();
    run(command);
  }

  function onPaste(event: React.ClipboardEvent<HTMLDivElement>) {
    // Paste as plain text so outside styling never leaks into the message.
    event.preventDefault();
    exec("insertText", event.clipboardData.getData("text/plain"));
    emit();
  }

  return (
    <>
      <div className="format-toolbar" role="toolbar" aria-label="Formatting">
        {COMMANDS.map((command) => <button type="button" key={command.title} className={command.className} title={command.shortcut ? `${command.title} (⌘/Ctrl+${command.shortcut.toUpperCase()})` : command.title} aria-label={command.title} onMouseDown={(event) => event.preventDefault()} onClick={() => run(command)}>{command.label}</button>)}
      </div>
      <div ref={editorRef} id={id} className="rich-editor" contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" onInput={emit} onBlur={emit} onKeyDown={onKeyDown} onPaste={onPaste} />
    </>
  );
}
