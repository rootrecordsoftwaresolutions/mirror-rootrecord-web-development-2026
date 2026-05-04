# Solana Tools site — canonical GitHub (read this before pushing)

**Production app repo (Vercel / `solana.rootrecord.info`):**  
https://github.com/RootRecord/solana-rootrecord-site  

**This monorepo (`Web-Development-2026`)** carries the app under `Web/solana/solana-rootrecord-site/`. **Pushing only `origin/main` here does not update production** until the same tree is pushed to **`RootRecord/solana-rootrecord-site`** (see subtree commands below — that is the only repo Vercel should use).

## Folder name in this monorepo

The Next app should live at:

`Web/solana/solana-rootrecord-site/`

If your checkout still has the old name `Web/solana/solanasite/`, **rename it** so paths match the real repo name and agents stop confusing the two:

1. Close terminals, dev servers, and anything using that folder (Cursor indexing can lock files on Windows).
2. From PowerShell in `Web/solana/`:

   ```powershell
   .\rename-solanasite-folder.ps1
   ```

3. From the `Web` git root:

   ```bash
   git add -A
   git status   # expect rename solanasite -> solana-rootrecord-site
   git commit -m "chore: rename solanasite folder to solana-rootrecord-site"
   ```

## After editing the Next app here

Push to **both** as needed:

1. `Web-Development-2026` (monorepo) — team / backup history  
2. **`RootRecord/solana-rootrecord-site`** — what actually deploys the public Solana Tools site  

Until (2) is done, **solana.rootrecord.info does not get your changes** (Vercel is wired to the public repo, not the monorepo).

### Publish — `git subtree push` from this monorepo

**Do not** create extra “sync” directories under `Development`, second working trees, or robocopy mirrors unless **you** choose that workflow. Agents default to **only** this path: **`Web` git root → `solana-rootrecord-site` on GitHub.**

From the **`Web`** git root (`Web-Development-2026`), after committing the monorepo:

**One-time** — add remote (skip if `solana-site` already exists):

```bash
git remote add solana-site https://github.com/RootRecord/solana-rootrecord-site.git
```

**Every publish** — push monorepo, then push the app subtree to **`main`** on the public repo:

```bash
git push origin main
git subtree push --prefix=solana/solana-rootrecord-site solana-site main
```

`subtree push` can take a while. If Git rejects the push (remote has commits you do not have), **stop** — do not scaffold new clones in this workspace; reconcile `solana-rootrecord-site` history with the monorepo subtree or fix the remote, then retry.

### Agents / automation

Do **not** search the codebase for “how to upload” the Solana site — use this file. Minimum bar: **`git push origin main`** then **`git subtree push … solana-site main`** until the second command succeeds. Do not invent alternate deploy folders.
