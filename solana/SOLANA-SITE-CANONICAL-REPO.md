# Solana Tools site — canonical GitHub (read this before pushing)

**Production app repo (Vercel / `solana.rootrecord.info`):**  
https://github.com/RootRecord/solana-rootrecord-site  

**This monorepo (`Web-Development-2026`)** may carry a copy under `Web/solana/` for local work. **Pushing only `origin/main` on Web-Development-2026 does not update that production site** unless you also sync this tree to `solana-rootrecord-site` (subtree, manual copy, or work directly in that clone).

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

Example (separate clone of the public repo):

```bash
git clone https://github.com/RootRecord/solana-rootrecord-site.git
cd solana-rootrecord-site
# copy or cherry-pick changes from Web/solana/solana-rootrecord-site, then:
git push origin main
```
