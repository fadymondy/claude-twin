# Manual release tasks

A few release-time tasks need a human in the loop — they require account / billing access we can't automate from CI. Tracked here so they don't get forgotten between releases.

## 1. Cut the v0.1.0 tag (#75)

```sh
# In a clean clone, on main with everything you want in the release.
$EDITOR CHANGELOG.md   # promote [Unreleased] → [0.1.0]

# Bump every package.json + plugin.json to 0.1.0.
node -e '
const fs = require("fs");
const files = [
  "package.json",
  "desktop/package.json",
  "extension/package.json",
  "extension/manifest.json",
  "mcp-server/package.json",
  "plugin/package.json",
  "plugin/.claude-plugin/plugin.json",
  "vscode-extension/package.json",
];
for (const f of files) {
  const j = JSON.parse(fs.readFileSync(f, "utf8"));
  j.version = "0.1.0";
  fs.writeFileSync(f, JSON.stringify(j, null, 2) + "\n");
  console.log("bumped", f);
}
'

git commit -am "chore: release v0.1.0"
git tag v0.1.0
git push origin main
git push origin v0.1.0
```

The tag push triggers `.github/workflows/release.yml`. Wait ~25 min, then verify everything per [docs/release.md](release.md).

## 2. Submit Chrome extension to the Chrome Web Store (#76)

A signed `.crx` from a paid CWS developer account. One-time setup; subsequent releases auto-publish via the workflow.

### Initial submission

1. https://chrome.google.com/webstore/devconsole — pay the one-time $5 USD developer registration fee.
2. **Add new item** → upload `claude-twin-extension-v0.1.0.zip` (downloaded from the GitHub Release page after step 1).
3. Fill out the **Store listing**:
   - Description (use `extension/README.md` content)
   - Screenshots (1280×800 or 640×400) — capture popup tabs + a real platform observing flow
   - Promo tile (440×280) and small promo tile (920×680)
   - Category: `Developer Tools`
   - Language: English
4. **Privacy practices**: declare what we collect — none, locally-only.
5. **Distribution**: public, all regions.
6. Submit for review. Google's review typically takes 1–3 business days.

### Recurring publishes

Once accepted, set repo secrets:

| Secret              | Source                                                                           |
| ------------------- | -------------------------------------------------------------------------------- |
| `CWS_EXTENSION_ID`  | the URL slug from the dashboard `https://chrome.google.com/webstore/detail/<id>` |
| `CWS_CLIENT_ID`     | OAuth 2 client id (Google Cloud Console → Credentials → OAuth client)            |
| `CWS_CLIENT_SECRET` | matching secret                                                                  |
| `CWS_REFRESH_TOKEN` | run `npx chrome-webstore-upload-cli init` once locally                           |

Then update `.github/workflows/release.yml` `publish-extension` step to run `chrome-webstore-upload-cli upload --auto-publish`. Subsequent tag pushes will auto-publish.

## 3. Register the Claude Code plugin in the official marketplace (#82)

The `claude plugin install fadymondy/claude-twin` command resolves through Anthropic's plugin marketplace.

### Prerequisites

- The plugin manifest at `plugin/.claude-plugin/plugin.json` is valid (already done).
- Repo is public and has at least one tagged release (do step 1 first).

### Submit

1. Navigate to https://claude.com/claude-code/plugins (Anthropic plugin directory).
2. Click "Submit a plugin" — the form asks for the GitHub repo URL.
3. Anthropic reviews the manifest + readme + example commands. Review window varies (days–weeks).
4. Once approved, the plugin is searchable at `claude plugin search claude-twin` and installable via `claude plugin install fadymondy/claude-twin`.

### Marketplace metadata file (optional)

Some marketplace listings let you ship richer metadata (categories, tags, screenshots) in `plugin/.claude-plugin/marketplace.json`. Check Anthropic's plugin docs for the current schema before submitting.

## Calendar

Set a reminder ~1 month before each release to:

- [ ] verify Apple Developer ID cert hasn't expired
- [ ] verify Windows code-signing cert hasn't expired
- [ ] re-test load-unpacked extension flow on a clean Chrome profile
- [ ] re-test the Claude Code plugin install on a clean machine
