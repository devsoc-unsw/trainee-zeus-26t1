/**
 * Server Component — runs on the server (or during build).
 *
 * To call FastAPI from here (server-side):
 *   - In Docker: use process.env.INTERNAL_API_URL  (e.g. http://backend:8000)
 *   - Outside Docker: use process.env.INTERNAL_API_URL pointing to http://localhost:8000
 *
 * Example:
 *   const res = await fetch(`${process.env.INTERNAL_API_URL}/health`);
 *   const data = await res.json(); // { status: "ok" }
 *
 * See src/lib/supabase/client.js for the browser-side Supabase client.
 */

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function Home() {
  return (
    <main style={{ fontFamily: "sans-serif", padding: "2rem" }}>
      <h1>Next.js + FastAPI + Supabase Boilerplate</h1>
      <ul>
        <li>
          FastAPI health:{" "}
          <a href={`${apiUrl}/health`}>{apiUrl}/health</a>
        </li>
        <li>
          FastAPI docs:{" "}
          <a href={`${apiUrl}/docs`}>{apiUrl}/docs</a>
        </li>
        <li>
          Supabase browser client: <code>src/lib/supabase/client.js</code>
        </li>
      </ul>
    </main>
  );
}
