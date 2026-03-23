# WhatsApp-Group-Contacts-Exporter
WhatsApp Group Contacts Exporter

Whatsapp group members list exporter into csv format for easy saving into google contacts


![License: Proprietary](https://img.shields.io/badge/License-Proprietary-red.svg)

## License

Copyright (c) 2026 [Jānis Ķengurs]. All rights reserved.

This software and its source code are proprietary and confidential.
Unauthorized copying, modification, distribution, sublicensing, or
commercial use of this software, in whole or in part, is strictly
prohibited without prior written permission from the copyright owner.

For licensing or partnership inquiries, contact: [kangarooo@gmail.com]

# WhatsApp Group Contact Extractor
### Chrome Extension — v1.0.0

Extract contacts from WhatsApp Web group chats into **CSV** or **VCF** files.
Each contact is prefixed with the year and group name for easy sorting.

---

## 📦 Installation

1. **Unzip** this folder somewhere permanent (e.g. `~/chrome-extensions/whatsapp-extractor`)
2. Open Chrome → **Menu → More Tools → Extensions** (or go to `chrome://extensions`)
3. Enable **Developer Mode** (top-right toggle)
4. Click **"Load unpacked"**
5. Select the unzipped `whatsapp-extractor` folder
6. The 💬 icon appears in your Chrome toolbar

---

## 🚀 How to Use

1. Open **[WhatsApp Web](https://web.whatsapp.com)** and log in
2. Open a **group chat**
3. Click the **group header** (top of the chat) to open **Group Info**
4. **Scroll down** in the Group Info panel to load ALL members
5. Click the extension icon → **Extract Current Group**
6. Repeat for each group you want
7. Click **Export CSV** or **Export VCF**

> 💡 **Tip:** For past/removed members, scroll through the chat history
> before extracting — the extension will also pick up system messages
> about who joined or left.

---

## 📊 CSV Format

| Full Name | Group | Phone | Year | Role | Source |
|-----------|-------|-------|------|------|--------|
| 2025 Alice Smith [Work Team] | Work Team | +44 7... | 2025 | admin | current |
| 2024 Bob Jones [Work Team] | Work Team | | 2024 | past member | left |

---

## ✨ Features

- **Extract current members** (admin badge detected)
- **Past & removed members** from system messages in chat history
- **Accumulate across groups** — keeps adding to your list
- **Export CSV** — opens in Excel/Sheets, ready for import
- **Export VCF** — import directly into iPhone, Android, Google Contacts
- **Copy to clipboard** — paste anywhere
- **Filter & search** by name, group, or status
- **Deduplication** — no duplicate entries across runs

---

## ⚠️ Notes

- WhatsApp Web must be **open and active** in a Chrome tab
- The extension reads the **visible DOM only** — scroll to load all members
- Phone numbers are only visible if the contact is in your phone's contacts
- This extension does **not** send any data externally — everything stays local

---

## 🔒 Privacy

All data is stored locally in Chrome's `storage.local`.
Nothing is sent to any server. Source code is fully auditable.
