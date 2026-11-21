'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="error-page">
      <h1>We couldn’t load this page.</h1>
      <p>
        The service may be unavailable. Financial operations retain their original references and
        can be reconciled safely.
      </p>
      <button className="button" onClick={reset}>
        Try again
      </button>
      <a href="/login">Return to sign in</a>
    </main>
  );
}
