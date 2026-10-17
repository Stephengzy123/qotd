"use client";

import OutagePage from "./error";

export default function GlobalError() {
  return (
    <html lang="en">
      <head><title>Site temporarily unavailable | Announcements</title></head>
      <body style={{ margin: 0 }}>
        <OutagePage />
      </body>
    </html>
  );
}
