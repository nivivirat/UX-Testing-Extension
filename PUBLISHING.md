# Sharing the extension with other testers

Only the extension is distributed. Every tester's issues stay on their own computer.

## Build the package

```
node scripts/package.mjs
```

This creates `dist/khda-visual-qa-<version>.zip`. Raise `version` in `extension/manifest.json`
before each new upload.

## Options

| Option | Cost | Install for testers | Updates | Review |
|---|---|---|---|---|
| **Chrome Web Store — Unlisted** (recommended) | US$5 one-time developer fee | One click from a private link | Automatic | 1–3 days for each version |
| **Microsoft Edge Add-ons — Hidden** | Free | One click from a private link (Edge only) | Automatic | Up to about 7 days |
| **IT-managed (Intune / Group Policy)** | Free | Installed automatically on KHDA laptops | Automatic | Uses the store listing above |
| **GitHub release ZIP** | Free | Unzip → `chrome://extensions` → Developer mode → Load unpacked | Manual | None |

### Chrome Web Store (Unlisted)
1. Register at the Chrome Web Store Developer Dashboard (one-time US$5).
2. **New item** → upload `dist/khda-visual-qa-<version>.zip`.
3. Set **Visibility: Unlisted**: only people with the link can install it, and it doesn't appear in search.
4. Privacy tab:
   - **Single purpose:** "Report visual UI issues on web pages and export them for developers."
   - **Permission reasons:**
     - `scripting`/host access: "inspect and screenshot the page the tester is testing";
     - `downloads`: "save the exported report";
     - `storage`: "remember the toolbar per tab".
   - **Data:** stored locally only, not sold or transferred. Link to `PRIVACY.md` on GitHub.
5. Submit. After approval, share the item link with testers.

**Faster review:** in `manifest.json`, replace `"<all_urls>"` with your KHDA hosts **and your
Redmine host**, for example `"https://*.khda.gov.ae/*", "https://tracker.example.com/*"`. A narrower site access list gets reviewed faster, and testers see a
milder permission warning.

### GitHub release ZIP (free, no review)
Push a version tag and GitHub builds the ZIP for you:

```
git tag v1.5.0
git push origin v1.5.0
```

The ZIP appears under **Releases** in the repository. Testers install it with *Load unpacked*.
They need to repeat that for every new version.

## Moving testers' issues to the published version

The store version has a different extension ID from a *Load unpacked* copy, so it starts empty.
Before switching, each tester should:
1. In the old version: **Issues → ⚙ → Download backup**.
2. Install the published version.
3. In the new version: **⚙ → Restore backup**.
4. Remove the old unpacked copy.
