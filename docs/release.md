# Release guide

This is the operator's checklist for cutting a real signed release. The release workflow at `.github/workflows/release.yml` runs on every `v*.*.*` tag push; this doc covers what secrets to set so it actually produces signed artifacts.

> Until these secrets are configured, releases produce **unsigned** binaries. macOS will Gatekeeper-block them on first launch and Windows SmartScreen will warn users. The app still works once the user right-clicks → Open (mac) or clicks "Run anyway" (Windows), but it's a poor first-impression experience.

## What gets built on a tag push

| Artifact    | Path in Release                                    | Source              |
| ----------- | -------------------------------------------------- | ------------------- |
| macOS arm64 | `claude-twin-<ver>-arm64.dmg`                      | `desktop/dist/`     |
| macOS x64   | `claude-twin-<ver>.dmg`                            | `desktop/dist/`     |
| Windows x64 | `claude-twin-<ver>-setup.exe`                      | `desktop/dist/`     |
| Linux x64   | `claude-twin-<ver>.AppImage`                       | `desktop/dist/`     |
| Update feed | `latest-mac.yml`, `latest.yml`, `latest-linux.yml` | electron-updater    |
| Extension   | `claude-twin-extension-v<ver>.zip`                 | `extension/` zipped |
| MCP server  | `@claude-twin/mcp-server@<ver>` on npm             | `mcp-server/`       |

## Required secrets

Set in **Settings → Secrets and variables → Actions** on the repo.

### macOS code signing + notarization

| Secret                        | What it is                                                           | How to get it                                                             |
| ----------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `MAC_CSC_LINK`                | Base64-encoded `.p12` of your "Developer ID Application" certificate | See "Get a Developer ID cert" below                                       |
| `MAC_CSC_KEY_PASSWORD`        | Password for the .p12                                                | You set it during export                                                  |
| `APPLE_ID`                    | The Apple ID email tied to your developer account                    | from `id.apple.com`                                                       |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password for that Apple ID                              | https://appleid.apple.com → Sign-In and Security → App-Specific Passwords |
| `APPLE_TEAM_ID`               | Your developer team's 10-character team id                           | https://developer.apple.com/account → Membership                          |

#### Get a Developer ID cert

1. Sign in to [developer.apple.com](https://developer.apple.com/account) — needs a paid Developer Program membership (US$99/yr).
2. Certificates → `+` → **Developer ID Application**.
3. Generate a CSR with Keychain Access → Certificate Assistant → "Request a Certificate from a Certificate Authority" (saved to disk, no email).
4. Upload the CSR; download the resulting `.cer`.
5. Double-click to install in Keychain Access.
6. In Keychain Access, find "Developer ID Application: Your Name (TEAMID)", expand it, right-click the private key, **Export**. Choose `.p12`, set a password.
7. Base64-encode for GitHub: `base64 -i developer-id.p12 -o cert.p12.base64` → contents go into `MAC_CSC_LINK`.

### Windows code signing

| Secret                 | What it is                                             |
| ---------------------- | ------------------------------------------------------ |
| `WIN_CSC_LINK`         | Base64-encoded `.pfx` of your code-signing certificate |
| `WIN_CSC_KEY_PASSWORD` | Password for the .pfx                                  |

Buy a code-signing certificate from a trusted CA — DigiCert, Sectigo, SSL.com all sell EV certs ($300-500/yr) which avoid the SmartScreen "publisher unknown" warning. Standard OV certs ($75-150/yr) work but Microsoft will warn until enough installs accumulate reputation.

The cert vendor will deliver a `.pfx`. Encode like macOS: `base64 -i cert.pfx -o cert.pfx.base64` → contents go into `WIN_CSC_LINK`.

### npm publish

| Secret      | What it is                                                        |
| ----------- | ----------------------------------------------------------------- |
| `NPM_TOKEN` | Automation token with publish access to `@claude-twin/mcp-server` |

1. https://npmjs.com → your profile → Access Tokens → "Generate New Token" → **Automation** type.
2. The release workflow uses npm provenance, so make sure your repo allows it: `npm publish --provenance` requires the workflow runs on a `pull_request` or `push` event with proper OIDC scopes (already configured in our workflow).

## Cutting a release (once secrets are set)

```sh
# 1. Bump versions in lockstep
for f in package.json desktop/package.json extension/package.json mcp-server/package.json plugin/package.json plugin/.claude-plugin/plugin.json vscode-extension/package.json; do
  # use jq or your editor of choice; node will reject mismatched workspace deps
  echo "bump $f"
done

# 2. Update CHANGELOG.md — promote `[Unreleased]` to `[<version>]`
$EDITOR CHANGELOG.md

# 3. Commit + tag + push
git commit -am "chore: release v0.1.0"
git tag v0.1.0
git push origin main
git push origin v0.1.0
```

The workflow takes ~25 minutes (mac-14 build is the slowest leg; cross-arch dmg + notarization).

## After publish

- Verify the GitHub Release page has all six artifacts attached.
- Verify electron-updater feed is reachable: `curl -L https://github.com/fadymondy/claude-twin/releases/latest/download/latest-mac.yml`.
- Verify npm: `npm view @claude-twin/mcp-server version` returns the new version.
- Verify auto-update flow: install the previous version, launch, wait for the update prompt.

## Failure modes

- **Notarization fails (`Apple service error: ITMS-90000`)**: Apple ID password rotated, or app-specific password expired. Regenerate at appleid.apple.com.
- **Windows SmartScreen still warns despite signing**: standard OV cert needs to build reputation. Either wait for ~50 successful installs, or upgrade to EV.
- **`Cannot compute electron version from installed node modules`**: `electron` dep in `desktop/package.json` is using a range (`^33.x.y`). Pin to an exact version.
- **`@claude-twin/mcp-server` publish fails with 403**: NPM_TOKEN doesn't have publish access, or 2FA isn't auto-token type.
