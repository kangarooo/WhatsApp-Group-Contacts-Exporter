// WhatsApp Group Contact Extractor - Background Service Worker

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ contacts: [], sessions: [] });
  console.log("[WA Extractor] Extension installed.");
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === "save_contacts") {
    chrome.storage.local.get(["contacts"], (result) => {
      const existing = result.contacts || [];
      const incoming = msg.contacts || [];

      // Merge: deduplicate by name+group combo
      const keyOf = (c) => `${c.name}||${c.group}`;
      const existingKeys = new Set(existing.map(keyOf));
      const merged = [...existing];
      incoming.forEach((c) => {
        if (!existingKeys.has(keyOf(c))) {
          existingKeys.add(keyOf(c));
          merged.push(c);
        }
      });

      chrome.storage.local.set({ contacts: merged }, () => {
        sendResponse({ ok: true, total: merged.length });
      });
    });
    return true; // async
  }

  if (msg.action === "get_contacts") {
    chrome.storage.local.get(["contacts"], (result) => {
      sendResponse({ contacts: result.contacts || [] });
    });
    return true;
  }

  if (msg.action === "clear_contacts") {
    chrome.storage.local.set({ contacts: [] }, () => {
      sendResponse({ ok: true });
    });
    return true;
  }
});
