export default function Home() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: "24px 16px",
        textAlign: "center",
      }}
    >
      <div style={{ maxWidth: 420 }}>
        <p style={{ letterSpacing: "0.2em", fontSize: 12, color: "var(--muted)", margin: 0 }}>
          CASE FILE PENDING
        </p>
        <h1 style={{ fontSize: 36, margin: "12px 0", color: "var(--accent)" }}>Secret Mission</h1>
        <p style={{ color: "var(--muted)", lineHeight: 1.5, margin: 0 }}>
          Your application is being processed. Check back closer to the party.
        </p>
      </div>
    </main>
  );
}
