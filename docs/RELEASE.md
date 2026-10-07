# Manual Release Checklist

Adobe MCP intentionally has no CI/GitHub Actions. Releases are manual and evidence-based.

## 1. Code gate

Run from a clean checkout:

```bash
npm install
npm run check
npm run release:check
npm run doctor
```

`release:check` validates the repository contract, adapter sources, UXP manifests, no-CI requirement, checklist state and packaging prerequisites. It treats real-host acceptance and Adobe UXP packaging as external gates rather than pretending they happened.

## 2. Install local adapters

Windows:

```powershell
npm run install:windows
npm run photoshop:dev:windows
```

macOS:

```bash
npm run install:macos
npm run photoshop:dev:macos
```

Load the Photoshop and Media Encoder manifests in Adobe UXP Developer Tool. Restart a host once after first installation; later MCP restarts do not require host restarts.

## 3. Real-host acceptance

Use an expendable Premiere project copy and a real AME preset.

```bash
npm run accept:premiere -- --scenario D:/path/to/acceptance.json
```

Start with `docs/acceptance-premiere.example.json`.

The run is not creatively accepted until a vision-capable reviewer inspects the generated review artifacts and records explicit criterion verdicts.

Also execute the host smoke tests in `docs/ACCEPTANCE.md` for the Adobe versions you intend to claim as verified.

## 4. Package UXP adapters

Adobe's supported packaging flow is external:

1. Open UXP Developer Tool with administrator privileges.
2. Add `adapters/photoshop-uxp/manifest.json`.
3. Use the plugin Actions menu > **Package** and choose the release destination.
4. Repeat separately for `adapters/media-encoder-uxp/manifest.json`.
5. Install each generated `.ccx` via Creative Cloud Desktop and verify reconnect/commands.
6. Record the tested host versions in the release notes.

Do not hand-roll a ZIP and label it a supported CCX.

## 5. npm package

```bash
npm pack
```

`prepack` runs both `npm run check` and `npm run release:check` automatically. Inspect the tarball contents before publishing.

## Release evidence

A release should retain:

- output of `npm run release:check`
- output of `npm run doctor`
- Premiere `acceptance-report.json`
- final review verdict
- tested Adobe host/version list
- generated Photoshop/Media Encoder CCX filenames when distributing those adapters
