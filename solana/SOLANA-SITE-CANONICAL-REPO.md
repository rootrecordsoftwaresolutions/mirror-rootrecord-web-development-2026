# Solana Tools site — single source of truth (read before any Solana web work)

**Repo:** https://github.com/RootRecord/solana-rootrecord-site (`main`)  
**Live:** https://solana.rootrecord.info (Vercel builds from that repo only)

## Monorepo (`Web-Development-2026`)

The Next.js app **is not** maintained under `Web/solana/` anymore. **Do not** recreate `Web/solana/solana-rootrecord-site`, subtree workflows, or “sync” folders under `Development/`. Edits to the public Solana Tools site belong **only** in **`RootRecord/solana-rootrecord-site`**.

## Local work

```bash
git clone https://github.com/RootRecord/solana-rootrecord-site.git
cd solana-rootrecord-site
pnpm install
pnpm dev
```

## Deploy (Vercel)

Push to **`main`** on **`RootRecord/solana-rootrecord-site`**. There is no second step in this monorepo.

## Env / secrets

Use **`.env.example`** in that repo (and Vercel env UI), not paths under `Web/`.
