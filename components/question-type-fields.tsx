"use client";

import { useState } from "react";

export function QuestionTypeFields({ initialType = "open", initialReactions = [] }: { initialType?: string; initialReactions?: string[] }) {
  const [type, setType] = useState(initialType === "reaction" ? "reaction" : "open");
  return (
    <div className="question-type-fields">
      <div>
        <label>Question type</label>
        <select name="questionType" value={type} onChange={(event) => setType(event.target.value)}>
          <option value="open">Open answer</option>
          <option value="reaction">Reaction-based</option>
        </select>
      </div>
      {type === "reaction" && <div>
        <label>Reactions</label>
        <input name="reactions" defaultValue={initialReactions.join(" ")} placeholder="👍 👎 🤷" required />
        <p className="hint">Separate 2–10 emoji with spaces. Custom emoji can use &lt;:name:id&gt;.</p>
      </div>}
    </div>
  );
}
