# Zotero WakaTime

![Zotero target](https://img.shields.io/badge/Zotero-7-green?style=flat-square&logo=zotero&logoColor=CC2936)
![License](https://img.shields.io/badge/license-AGPL--3.0--or--later-blue?style=flat-square)
[![Using Zotero Plugin Template](https://img.shields.io/badge/Using-Zotero%20Plugin%20Template-blue?style=flat-square&logo=github)](https://github.com/windingwind/zotero-plugin-template)
[![Coding time tracker](https://wakatime.com/badge/github/xinxzk/zotero-wakatime.svg)](https://wakatime.com)

Zotero WakaTime tracks time spent reading PDFs in Zotero and sends reading
heartbeats to WakaTime.

## Features

- Sends WakaTime heartbeats while a Zotero reader tab is active.
- Reads the API key from `~/.wakatime.cfg`, with a Zotero preference fallback.
- Uses the first collection name as the WakaTime project when available.
- Supports a configurable fallback project name and heartbeat interval.
- Can send either item titles or anonymized Zotero item IDs as entities.

## Development

Install dependencies:

```sh
npm install
```

Start Zotero with the development build loaded:

```sh
npm run start
```

Build the plugin:

```sh
npm run build
```

The development runner uses `.env` for the Zotero binary and profile paths.
Using a separate Zotero development profile is recommended.

## Configuration

In Zotero, open the Zotero WakaTime preferences pane to configure:

- Enable or disable tracking.
- API key fallback.
- Default project name.
- Heartbeat interval.
- Whether to include item titles in WakaTime entities.
