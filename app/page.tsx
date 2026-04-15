export default function Home() {
  return (
    <main className="page">
      <section className="card">
        <p className="eyebrow">Next.js on GitHub Pages</p>
        <h1>Static export is ready.</h1>
        <p className="lead">
          This app builds to plain files in <code>out/</code> so GitHub Pages
          can host it directly.
        </p>
        <div className="actions">
          <a
            href="https://nextjs.org/docs/app/building-your-application/deploying/static-exports"
            target="_blank"
            rel="noreferrer"
          >
            Static export docs
          </a>
          <a
            href="https://pages.github.com/"
            target="_blank"
            rel="noreferrer"
          >
            GitHub Pages docs
          </a>
        </div>
      </section>
    </main>
  );
}

