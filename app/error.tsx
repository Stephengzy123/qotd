"use client";

export default function OutagePage() {
  return (
    <main
      style={{
        minHeight: "100svh",
        boxSizing: "border-box",
        display: "grid",
        placeItems: "center",
        padding: "32px 24px",
        background: "#181a1f",
        color: "#f4f4f5",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <section aria-labelledby="outage-title" style={{ width: "100%", maxWidth: 520 }}>
        <p style={{ margin: "0 0 16px", color: "#b8bdc9", fontSize: 14 }}>
          Announcements
        </p>
        <h1 id="outage-title" style={{ margin: "0 0 20px", fontSize: "clamp(28px, 6vw, 40px)", lineHeight: 1.15, color: "#f4f4f5" }}>
          The site is down right now.
        </h1>
        <p style={{ margin: "0 0 16px", fontSize: 17, lineHeight: 1.7 }}>
          DM <code style={{ fontFamily: "monospace", color: "#ffffff" }}>_q88_</code> on Discord to report this or get additional information.
        </p>
        <p style={{ margin: "0 0 28px", fontSize: 17, lineHeight: 1.7 }}>
          Join the Discord server <a href="https://discord.gg/4vFxtnHGaG" style={{ color: "#b9c7ff", textDecoration: "underline" }}>here</a> for manual announcements until the site is back up.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{ padding: "12px 20px", border: "1px solid #b8bdc9", borderRadius: 6, background: "#f4f4f5", color: "#181a1f", font: "inherit", fontWeight: 600, cursor: "pointer" }}
        >
          Try again
        </button>
      </section>
    </main>
  );
}
