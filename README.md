# KHDA Visual QA

A Chrome extension for testing KHDA web apps. Point at anything on the screen to see its font,
colours and spacing (like Figma Dev Mode), report what is wrong with a screenshot, and send the
issues to Redmine or to the developers as a ZIP that Claude Code can fix from.

Your issues stay in your own browser. Nothing is uploaded unless you export it or connect Redmine.

<p align="center">
  <a href="https://github.com/nivivirat/UX-Testing-Extension/releases/latest/download/khda-visual-qa.zip">
    <img src="https://img.shields.io/badge/Download-KHDA%20Visual%20QA-000000?style=for-the-badge&logo=googlechrome&logoColor=white" alt="Download KHDA Visual QA" height="44">
  </a>
  <br>
  <sub>Latest version · works in Google Chrome and Microsoft Edge ·
  <a href="https://github.com/nivivirat/UX-Testing-Extension/releases">all versions</a></sub>
</p>

---

## Install (about 2 minutes)

**1. Download and unzip**

- Click the **Download** button above. You get `khda-visual-qa.zip`.
- Right-click the ZIP → **Extract All…**
- In the box, change the path to `C:\Users\<you>\Documents\khda-visual-qa` (any place you will
  **keep**) → **Extract**.
- Open the new folder. You should see `manifest.json` straight away, next to `background.js` and
  the `content`, `icons` and `lib` folders. **This is the folder you'll select in step 2.**

> ⚠️ Don't leave it in *Downloads* or delete the folder later. Chrome runs the extension from this
> folder, and your issues are linked to it.

**2. Add it to Chrome**

1. Open a new tab, type `chrome://extensions` and press Enter.
   (In Edge: `edge://extensions`.)
2. Turn on **Developer mode** (switch at the top right; in Edge it's on the left).
3. Click **Load unpacked**.
4. Go to the folder from step 1, **open it** so you can see `manifest.json` inside, then click
   **Select Folder**. (Don't select the ZIP file, or a folder that only has another folder inside.)
5. **KHDA Visual QA** now appears in the list. ✅

> 📦 **Downloaded with GitHub's green "Code → Download ZIP" button instead?** That ZIP contains
> the whole project. Select the **`extension`** folder inside it:
> `UX-Testing-Extension-main\extension`.

> ❓ **"Manifest file is missing or unreadable"?** You selected one folder too high. Windows often
> puts the files in an extra folder, like `KHDA Visual QA\khda-visual-qa\`. Click **Load unpacked**
> again and select the inner folder, the one with `manifest.json` in it.

**3. Pin it to the toolbar**

Click the puzzle-piece icon 🧩 next to the address bar → click the pin 📌 next to **KHDA Visual QA**.

---

## First-time setup

1. Open any KHDA page and click the **KHDA Visual QA** icon (or press **Alt+Shift+Q**).
   A small toolbar appears at the bottom right.
2. Click **☰** and then **⚙**. The Settings page opens in a new tab.
3. **Preferences** → enter **Your initials** (they go in your issue numbers, e.g. `CRM-NM-001`, so testers never clash).
4. **Projects** → check the project name (e.g. *KHDA CRM*) and fill in its **Site** address, so the toolbar
   picks the right project automatically.
5. **Redmine** (optional, if your team uses it):
   - **Redmine address:** `https://tracker.rapiddata.com`
   - **API key:** in Redmine, open **My account** → **API access key** → **Show**, and copy it.
   - Click **Test & save**. It should say *Connected as \<your name\>*.
   - Under **Projects**, link your project to the Redmine project, tracker (**Bug**), assignee and
     **Severity**.

> 🔒 Every person uses **their own** API key. Never share your key or paste it in chat. It stays in
> your browser only and is never exported or put in backups.

---

## How to use it

| Step | What to do |
|---|---|
| **Inspect** | Click **Inspect**, then hover anything on the page to see its size, font, colour and spacing. Click to select it. |
| **Report** | With an element selected, click **Report issue** (or 🖥 for a whole-screen issue). Describe the problem, pick **Severity** and how widely to fix it, then **Save** (Ctrl+Enter). |
| **Track** | **☰** opens your issues. Click a status to change it. ↗ takes you to the page where it was reported. |
| **Redmine** | With Redmine connected, new issues are created there automatically. Statuses always match Redmine. **Redmine ▾ → Send to Redmine…** sends older issues. |
| **Hand over** | **Export ZIP** saves a report for the developers (only open and reopened issues in full). |
| **Retest** | When developers send back `issues.json`, click **Import**. The **Retest** tab shows what to check; **Close** or **Reopen** each one. |

Full guide: [extension/README.md](extension/README.md)

---

## Updating to a new version

Your issues are kept, as long as you use the **same folder**.

1. Click **Download** above to get the latest ZIP.
2. Extract it **into the same folder as before**, and choose **Replace the files** when asked.
3. Go to `chrome://extensions` and click the ↻ (reload) icon on **KHDA Visual QA**.
4. Refresh any KHDA tabs that were open.

To see which version you have, look at `chrome://extensions` → KHDA Visual QA.

> 💾 To be extra safe before updating: **⚙ Settings → Backup → Download backup**.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| *"Manifest file is missing or unreadable"* | You picked the wrong folder. Select the folder that has `manifest.json` directly inside it, usually the inner `khda-visual-qa` folder. Not the ZIP. |
| The toolbar doesn't appear | Refresh the page, then click the icon again. It can't run on `chrome://` pages or the Chrome Web Store. |
| *"The extension needs a reload"* message | `chrome://extensions` → ↻ on KHDA Visual QA → refresh the page. |
| Chrome shows a *"Disable developer mode extensions"* pop-up | Click **Cancel** (or close it). This is normal for extensions installed this way. |
| My issues disappeared | You probably loaded it from a **different folder**. Load the old folder again, or restore a backup (**⚙ → Backup → Restore**). |
| Redmine says *"Can't reach Redmine"* | Check you're on the office network / VPN and the address is `https://tracker.rapiddata.com`. |
| Redmine says the key is wrong (401) | Copy the key again from **My account → API access key → Show**, then **Test & save**. |

---

## For developers

| Folder | What it is |
|---|---|
| [`extension/`](extension/) | The Chrome extension (Manifest V3). |
| [`developer-kit/`](developer-kit/) | What developers add to the app repo: `CLAUDE.md` rules, the `/khda-qa-fix` Claude Code skill, and a Babel plugin that stamps source file:line on elements. |
| [`EXPORT_FORMAT.md`](EXPORT_FORMAT.md) | The export format between the extension and Claude Code. |
| [`PUBLISHING.md`](PUBLISHING.md) | Other ways to share it (Chrome Web Store, Edge Add-ons, company-managed install). |
| [`PRIVACY.md`](PRIVACY.md) | What data is stored and where. |

Developers unzip a QA export into `qa/` in the app repo and run `/khda-qa-fix` in Claude Code.

**Releasing a new version:** raise `version` in `extension/manifest.json`, commit, then push a tag:

```
git tag v1.12.0
git push origin v1.12.0
```

GitHub builds the ZIP and publishes the release; the **Download** button picks it up automatically.
