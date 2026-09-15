// Display-only cleanup: the stored Discord message is never changed.
export function liveMessageText(value: string) {
  return value.replace(/\r\n?/g, "\n").split("\n").flatMap(line => {
    const cleaned = line.replace(/<@&\d+>|@(?:everyone|here|role)\b/gi, "").trimEnd();
    if (cleaned !== line && /^\s*(?:-#)?\s*$/.test(cleaned)) return [];
    return [cleaned];
  }).join("\n").trim();
}
