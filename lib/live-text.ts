// Strip Discord role/user/everyone/here mentions, preserving email addresses.
export function removePings(value: string) {
  return value.replace(/\r\n?/g, "\n").split("\n").flatMap(line => {
    const cleaned = line.replace(/<@(?:[!&])?\d+>|(?<![\w.+-])@(?:everyone|here|role)\b/gi, "").trimEnd();
    if (cleaned !== line && /^\s*(?:-#)?\s*$/.test(cleaned)) return [];
    return [cleaned];
  }).join("\n").trim();
}

// Live feed display always removes pings; Discord sends opt in separately.
export const liveMessageText = removePings;
