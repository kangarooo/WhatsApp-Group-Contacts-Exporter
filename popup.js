// WhatsApp Group Contact Extractor - Popup Script

"use strict";

// ─── DOM refs ─────────────────────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);

const btnExtract  = $("btn-extract");
const btnExport   = $("btn-export");
const btnVcf      = $("btn-vcf");
const btnGoogle   = $("btn-google");
const btnCopy     = $("btn-copy");
const btnClear    = $("btn-clear");
const statusDot   = $("status-dot");
const statusText  = $("status-text");
const cntTotal    = $("cnt-total");
const cntGroups   = $("cnt-groups");
const cntPast     = $("cnt-past");
const contactList = $("contact-list");
const listWrap    = $("list-wrap");
const filterBar   = $("filter-bar");
const filterInput = $("filter-input");
const filterSource= $("filter-source");
const footerCount = $("footer-count");
const footerGroup = $("footer-group");
const instructions= $("instructions");
const toast       = $("toast");
const progressWrap  = $("progress-wrap");
const progressLabel = $("progress-label");
const progressFill  = $("progress-fill");

// ─── Progress bar helpers ─────────────────────────────────────────────────────

function showProgress(msg) {
  progressWrap.style.display = "block";
  progressLabel.textContent  = msg;
  progressFill.classList.add("running");
}

function updateProgress(msg) {
  progressLabel.textContent = msg;
  // Parse "X members found" to show a fill estimate
  const m = msg.match(/(\d+) members/);
  if (m) {
    const n = parseInt(m[1]);
    // fill up to 80% during scroll phase (we don't know the total)
    const pct = Math.min(80, 10 + n / 2);
    progressFill.classList.remove("running");
    progressFill.style.width = pct + "%";
  }
}

function finishProgress(msg) {
  progressLabel.textContent = msg;
  progressFill.classList.remove("running");
  progressFill.style.width = "100%";
  setTimeout(() => {
    progressWrap.style.display = "none";
    progressFill.style.width   = "0%";
  }, 1800);
}

// Listen for progress messages sent by the content script
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === "progress") {
    if (msg.msg && msg.msg.startsWith("Done")) {
      finishProgress(msg.msg);
      setStatus("green", msg.msg);
    } else {
      updateProgress(msg.msg);
      setStatus("yellow", msg.msg);
    }
  }
});

// ─── State ───────────────────────────────────────────────────────────────────

let allContacts = [];
let currentGroup = "";
let isConnected = false;

// ─── Init ────────────────────────────────────────────────────────────────────

async function init() {
  await checkConnection();
  await loadStoredContacts();
}

// ─── Connection check ────────────────────────────────────────────────────────

async function checkConnection() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url || !tab.url.includes("web.whatsapp.com")) {
      setStatus("red", "Open WhatsApp Web first");
      return;
    }
    // Ping the content script
    chrome.tabs.sendMessage(tab.id, { action: "ping" }, (resp) => {
      if (chrome.runtime.lastError || !resp || !resp.ok) {
        setStatus("yellow", "Reload WhatsApp Web tab (F5)");
        btnExtract.disabled = true;
      } else {
        setStatus("green", "Connected to WhatsApp Web ✓");
        isConnected = true;
        btnExtract.disabled = false;
      }
    });
  } catch (e) {
    setStatus("red", "Error: " + e.message);
  }
}

function setStatus(color, text) {
  statusDot.className = "status-dot " + color;
  statusText.textContent = text;
}

// ─── Load stored contacts ────────────────────────────────────────────────────

async function loadStoredContacts() {
  chrome.runtime.sendMessage({ action: "get_contacts" }, (resp) => {
    allContacts = resp?.contacts || [];
    renderAll();
  });
}

// ─── Extract ─────────────────────────────────────────────────────────────────

btnExtract.addEventListener("click", async () => {
  if (!isConnected) { showToast("Not connected to WhatsApp Web"); return; }

  btnExtract.disabled = true;
  $("extract-icon").innerHTML = '<span class="spinner"></span>';
  $("extract-label").textContent = "Auto-scrolling…";
  setStatus("yellow", "Locating members panel…");
  showProgress("Starting auto-scroll…");

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.tabs.sendMessage(tab.id, { action: "extract_current" }, (resp) => {
      if (chrome.runtime.lastError || !resp || !resp.ok) {
        setStatus("red", "Could not read group — open Group Info first");
        showToast("❌ Open the group info panel, click View All, then try again");
        progressWrap.style.display = "none";
        resetExtractBtn();
        return;
      }

      currentGroup = resp.groupName;
      const newContacts = resp.contacts || [];

      if (newContacts.length === 0) {
        setStatus("yellow", "No contacts found — open View All members first");
        showToast("⚠️ No contacts found. Open Group Info → View All, then try again.");
        progressWrap.style.display = "none";
        resetExtractBtn();
        return;
      }

      // Save to background
      chrome.runtime.sendMessage(
        { action: "save_contacts", contacts: newContacts },
        (saveResp) => {
          loadStoredContacts();
          setStatus("green", `Extracted ${newContacts.length} contacts from "${currentGroup}"`);
          showToast(`✅ ${newContacts.length} contacts from "${currentGroup}"`);
          footerGroup.textContent = currentGroup;
          resetExtractBtn();
        }
      );
    });
  } catch (e) {
    setStatus("red", "Error: " + e.message);
    resetExtractBtn();
  }
});

function resetExtractBtn() {
  btnExtract.disabled = false;
  $("extract-icon").textContent = "📥";
  $("extract-label").textContent = "Extract Current Group";
}

// ─── Render ───────────────────────────────────────────────────────────────────

function renderAll() {
  const q = (filterInput.value || "").toLowerCase();
  const src = filterSource.value;

  let filtered = allContacts.filter((c) => {
    const matchQ = !q ||
      c.name.toLowerCase().includes(q) ||
      (c.group || "").toLowerCase().includes(q) ||
      (c.phone || "").includes(q);
    let matchSrc = true;
    if (src === "saved")        matchSrc = c.saved === true;
    else if (src === "unsaved") matchSrc = c.saved === false;
    else if (src === "nophone") matchSrc = !c.hasPhone;
    else if (src)               matchSrc = c.source === src;
    return matchQ && matchSrc;
  });

  // Stats
  const groups = new Set(allContacts.map((c) => c.group)).size;
  const past  = allContacts.filter((c) => ["past","left","added"].includes(c.source)).length;
  const saved = allContacts.filter((c) => c.saved).length;

  cntTotal.textContent = allContacts.length;
  cntGroups.textContent = groups;
  cntPast.textContent = past;
  $("cnt-saved").textContent = saved;

  // Toggle UI sections
  const hasContacts = allContacts.length > 0;
  instructions.style.display = hasContacts ? "none" : "block";
  listWrap.style.display = hasContacts ? "block" : "none";
  filterBar.style.display = hasContacts ? "flex" : "none";

  btnExport.disabled = !hasContacts;
  btnVcf.disabled    = !hasContacts;
  btnGoogle.disabled = !hasContacts;
  btnCopy.disabled   = !hasContacts;
  btnClear.disabled  = !hasContacts;

  // Render list
  if (filtered.length === 0) {
    contactList.innerHTML = `<div class="empty-state">
      <div class="icon">🔍</div>
      <p>No contacts match your filter.</p>
    </div>`;
  } else {
    contactList.innerHTML = filtered
      .map((c, i) => contactRow(c, i))
      .join("");
  }

  footerCount.textContent = hasContacts
    ? `${filtered.length} of ${allContacts.length} contacts`
    : "No contacts loaded";
}

function contactRow(c) {
  const initials = (c.name || "?")
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0] || "")
    .join("")
    .toUpperCase();

  const badgeClass = {
    admin:  "badge-admin",
    past:   "badge-past",
    left:   "badge-left",
    added:  "badge-added",
    member: "badge-member",
  }[c.role] || "badge-member";

  // Saved indicator: ★ prefix on name if saved in contacts
  const savedMark = c.saved ? "★ " : "";
  const displayName = `${c.year} ${savedMark}${c.name} [${c.group}]`;

  // Phone pill: green if has phone, red/dim if missing
  const phonePill = c.hasPhone
    ? `<span class="phone-pill has-phone" title="${escHtml(c.phone)}">📞 ${escHtml(c.phone)}</span>`
    : `<span class="phone-pill no-phone" title="Phone not visible">No phone</span>`;

  // Saved badge
  const savedBadge = c.saved
    ? `<span class="badge badge-saved" title="You have this contact saved">★ Saved</span>`
    : `<span class="badge badge-unsaved" title="Not in your contacts">Unsaved</span>`;

  return `<div class="contact-item">
    <div class="avatar ${c.saved ? 'avatar-saved' : ''}">${initials}</div>
    <div class="contact-info">
      <div class="contact-name" title="${escHtml(displayName)}">${escHtml(c.year + " " + (c.saved ? "★ " : "") + c.name)}</div>
      <div class="contact-meta">${escHtml(c.group)}</div>
      <div class="contact-phone-row">${phonePill}</div>
    </div>
    <div class="badges-col">
      ${savedBadge}
      <span class="badge ${badgeClass}">${escHtml(c.role)}</span>
    </div>
  </div>`;
}

function escHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── Filters ──────────────────────────────────────────────────────────────────

filterInput.addEventListener("input", renderAll);
filterSource.addEventListener("change", renderAll);

// ─── Export CSV ───────────────────────────────────────────────────────────────

btnExport.addEventListener("click", () => {
  if (!allContacts.length) return;

  const headers = ["Full Name", "Group", "Phone", "Year", "Role", "Source", "Saved In Contacts", "Has Phone"];
  const rows = allContacts.map((c) => [
    csvCell(`${c.year} ${c.saved ? "★ " : ""}${c.name} [${c.group}]`),
    csvCell(c.group),
    csvCell(c.phone),
    csvCell(c.year),
    csvCell(c.role),
    csvCell(c.source),
    csvCell(c.saved ? "Yes" : "No"),
    csvCell(c.hasPhone ? "Yes" : "No"),
  ]);

  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  downloadFile(csv, "wa_contacts.csv", "text/csv");
  showToast("📄 CSV downloaded");
});

function csvCell(v) {
  const s = String(v ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// ─── Export VCF ──────────────────────────────────────────────────────────────

btnVcf.addEventListener("click", () => {
  if (!allContacts.length) return;

  const vcards = allContacts.map((c) => {
    const savedTag = c.saved ? "★ " : "";
    const fn = `${c.year} ${savedTag}${c.name} [${c.group}]`;
    const tel = c.phone ? `TEL:${c.phone}` : "";
    const note = `NOTE:Group: ${c.group} | Role: ${c.role} | Source: ${c.source} | Year: ${c.year} | Saved: ${c.saved ? "Yes" : "No"} | HasPhone: ${c.hasPhone ? "Yes" : "No"}`;
    return [
      "BEGIN:VCARD",
      "VERSION:3.0",
      `FN:${fn}`,
      `N:${c.name};;;${c.year} [${c.group}];`,
      tel,
      `ORG:${c.group}`,
      note,
      "END:VCARD",
    ]
      .filter(Boolean)
      .join("\n");
  });

  downloadFile(vcards.join("\n\n"), "wa_contacts.vcf", "text/vcard");
  showToast("📇 VCF downloaded");
});

// ─── Export Google Contacts CSV ───────────────────────────────────────────────
// Format: https://support.google.com/contacts/answer/1069522
// Required cols: Name, Given Name, Family Name, Phone 1 - Type, Phone 1 - Value,
//                Notes, Group Membership

btnGoogle.addEventListener("click", () => {
  if (!allContacts.length) return;

  // Google Contacts official import headers
  const headers = [
    "Name",
    "Given Name",
    "Family Name",
    "Phone 1 - Type",
    "Phone 1 - Value",
    "Notes",
    "Group Membership",
    "Labels",
  ];

  const rows = allContacts.map((c) => {
    // Full name shown in Google Contacts:
    // year + ★ (if saved) + original name + [group] — exactly as in WA
    const savedMark = c.saved ? "★ " : "";
    const fullName  = `${c.year} ${savedMark}${c.name} [${c.group}]`;

    // Split name into given/family best-effort (last word = family)
    const parts = c.name.trim().split(/\s+/);
    const givenName  = parts.slice(0, -1).join(" ") || c.name;
    const familyName = parts.length > 1 ? parts[parts.length - 1] : "";

    // Notes carry full context
    const notes = [
      `WA Group: ${c.group}`,
      `Year extracted: ${c.year}`,
      `Role: ${c.role}`,
      `Status: ${c.source}`,
      `Saved in WA: ${c.saved ? "Yes" : "No"}`,
    ].join(" | ");

    // Group Membership — Google uses "* myContacts ::: Label" syntax
    const groupMembership = `* myContacts ::: WA - ${c.group}`;

    // Labels for filtering inside Google Contacts
    const labels = [
      c.saved ? "WA-Saved" : "WA-Unsaved",
      `WA-${c.group.replace(/\s+/g, "-").slice(0, 30)}`,
      c.year.toString(),
    ].join(" ::: ");

    return [
      csvCell(fullName),
      csvCell(givenName),
      csvCell(familyName),
      csvCell(c.phone ? "Mobile" : ""),
      csvCell(c.phone || ""),
      csvCell(notes),
      csvCell(groupMembership),
      csvCell(labels),
    ];
  });

  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  downloadFile(csv, "wa_google_contacts.csv", "text/csv;charset=utf-8;");
  showToast("🟢 Google Contacts CSV downloaded");
});

btnCopy.addEventListener("click", () => {
  if (!allContacts.length) return;
  const lines = allContacts.map(
    (c) =>
      `${c.year} ${c.saved ? "★ " : ""}${c.name} [${c.group}]` +
      (c.phone ? ` | ${c.phone}` : " | no phone") +
      ` | ${c.role}` +
      (c.saved ? " | saved" : " | unsaved")
  );
  navigator.clipboard.writeText(lines.join("\n")).then(() => {
    showToast("📋 Copied to clipboard");
  });
});

// ─── Clear ───────────────────────────────────────────────────────────────────

btnClear.addEventListener("click", () => {
  if (!confirm("Clear all extracted contacts?")) return;
  chrome.runtime.sendMessage({ action: "clear_contacts" }, () => {
    allContacts = [];
    renderAll();
    showToast("🗑 Cleared");
  });
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function downloadFile(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

let toastTimer;
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2800);
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

init();
