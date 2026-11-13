import Link from "next/link";

export default function NotFound() {
  return (
    <main className="page" style={{ minHeight: "100dvh", alignContent: "center", textAlign: "center" }}>
      <p className="eyebrow">Application not found</p>
      <h1>That link doesn&apos;t work</h1>
      <p className="muted">Check you opened your full personal link, or ask Afam.</p>
      <Link href="/">Go to the start</Link>
    </main>
  );
}
