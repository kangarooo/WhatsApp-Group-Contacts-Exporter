// WhatsApp Group Contact Extractor - Content Script v4
// Virtual-scroll aware: extracts at every scroll position and accumulates.

(function () {
  "use strict";

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const getYear = () => new Date().getFullYear();

  function sendProgress(msg) {
    try { chrome.runtime.sendMessage({ action: "progress", msg }); } catch (_) {}
  }

  // ─── Find the scrollable "View All Members" panel ─────────────────────────
  // WhatsApp Web opens a side drawer when you click "View all".
  // We try every plausible scrollable container and score them.

  function findMembersPanel() {
    const candidates = [];

    // Collect ALL elements that are actually scrollable
    document.querySelectorAll("*").forEach((el) => {
      if (el === document.body || el === document.documentElement) return;
      if (el.scrollHeight <= el.clientHeight + 20) return;

      const style = window.getComputedStyle(el);
      const ov    = style.overflowY + " " + style.overflow;
      if (!ov.includes("scroll") && !ov.includes("auto")) return;

      // Score by how useful it looks
      let score = 0;
      const inner = el.innerHTML;

      // Contains participant/member rows → strong signal
      if (el.querySelector('div[role="listitem"]'))                 score += 40;
      if (el.querySelector('span[data-testid="cell-frame-title"]')) score += 30;
      if (el.querySelector('[data-testid*="participant"]'))         score += 25;
      if (el.querySelector('[data-testid*="member"]'))              score += 25;

      // Known WA panel test IDs
      if (el.closest('[data-testid="contact-info"]'))               score += 20;
      if (el.closest('[data-testid="section-members"]'))            score += 30;

      // Big scrollable area = likely the list
      const ratio = el.scrollHeight / (el.clientHeight || 1);
      score += Math.min(30, ratio * 5);

      // Penalty: if it's the whole page sidebar
      if (el.clientWidth > 500) score -= 20;

      if (score > 0) candidates.push({ el, score });
    });

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0].el;
  }

  // ─── Scroll through the panel, harvesting contacts at each position ────────
  // This is the core fix: WA virtualises the list, so we grab rows at
  // every scroll stop and accumulate them in a Map keyed by contact name.

  async function scrollAndHarvestAll(container, groupName) {
    const accumulated = new Map(); // name → contact object
    const year        = getYear();

    const STEP_PX   = 200;   // small steps so we don't skip virtualised rows
    const SETTLE_MS = 350;   // wait for WA to render new rows
    const MAX_STEPS = 300;   // safety cap

    // Start at the very top
    container.scrollTop = 0;
    await sleep(400);

    let lastScrollTop = -1;
    let stuckRounds   = 0;

    for (let step = 0; step < MAX_STEPS; step++) {
      // Harvest whatever is currently in the DOM
      harvestRows(container, groupName, year, accumulated);
      sendProgress(`Scrolling… ${accumulated.size} contacts collected`);

      // Scroll down
      container.scrollTop += STEP_PX;
      await sleep(SETTLE_MS);

      const currentTop = container.scrollTop;

      // Detect if scroll is no longer moving (reached the bottom)
      if (currentTop === lastScrollTop) {
        stuckRounds++;
        if (stuckRounds >= 3) break; // truly at bottom
      } else {
        stuckRounds  = 0;
        lastScrollTop = currentTop;
      }
    }

    // One final harvest after reaching the bottom
    harvestRows(container, groupName, year, accumulated);
    return Array.from(accumulated.values());
  }

  // ─── Harvest all currently visible rows into the accumulated map ───────────

  function harvestRows(container, groupName, year, accumulated) {
    // Prefer rows inside the container; fall back to global query
    const scope = container || document;

    let rows = Array.from(scope.querySelectorAll('div[role="listitem"]'));

    // If no listitems, try cell-frame-title spans
    if (rows.length === 0) {
      scope.querySelectorAll('span[data-testid="cell-frame-title"]').forEach((nameEl) => {
        const name = (nameEl.getAttribute("title") || nameEl.textContent).trim();
        if (!name || accumulated.has(name)) return;
        const parent   = nameEl.closest("div");
        const phoneEl  = parent && parent.querySelector('span[data-testid="cell-frame-secondary"]');
        const phone    = normalizePhone(phoneEl ? phoneEl.textContent.trim() : "");
        accumulated.set(name, {
          year, group: groupName, name,
          phone, hasPhone: phone.length > 0, saved: detectSaved(name),
          role: "member", source: "current",
        });
      });
      return;
    }

    rows.forEach((row) => {
      const nameEl =
        row.querySelector('span[data-testid="cell-frame-title"]') ||
        row.querySelector("span._ao3e") ||
        row.querySelector('[class*="copyable-text"]');
      if (!nameEl) return;

      let name = (nameEl.getAttribute("title") || nameEl.textContent).trim()
                   .replace(/\s+/g, " ");
      if (!name || name.length < 2) return;

      // Only update if not already captured (keeps first-seen data)
      if (accumulated.has(name)) return;

      const phoneEl  = row.querySelector('span[data-testid="cell-frame-secondary"]') ||
                       row.querySelector("span._ao3f");
      const phone    = normalizePhone(phoneEl ? phoneEl.textContent.trim() : "");

      const isAdmin  = !!row.querySelector('span[data-testid="group-participant-admin"]') ||
                       row.textContent.includes("Group admin");

      let source = "current";
      const rt   = row.textContent;
      if (rt.includes(" left") || rt.includes("(left)") ||
          rt.includes("You removed") || rt.includes("was removed")) source = "past";

      accumulated.set(name, {
        year, group: groupName, name,
        phone, hasPhone: phone.length > 0, saved: detectSaved(name),
        role: isAdmin ? "admin" : "member", source,
      });
    });
  }

  // ─── Group name ───────────────────────────────────────────────────────────

  function getCurrentGroupName() {
    const sels = [
      'div[data-testid="contact-info"] span[title]',
      'header span[title]',
      'div[data-testid="conversation-header"] span[title]',
      '#main header span[title]',
    ];
    for (const sel of sels) {
      const el   = document.querySelector(sel);
      const name = el && (el.getAttribute("title") || el.textContent.trim());
      if (name) return name;
    }
    return "Unknown Group";
  }

  // ─── Historical members from chat system messages ─────────────────────────

  function extractHistoricalFromMessages(groupName) {
    const year     = getYear();
    const contacts = [];
    const seen     = new Set();

    const sysMsgs = document.querySelectorAll(
      'div[data-testid="msg-container"] span[data-testid="msg-text"],' +
      'div.message-system span,' +
      'div[class*="message-in"] span[class*="selectable-text"]'
    );

    const joinedRx = /(.+?) (was added|joined using|added you|added [\w\s]+)/i;
    const leftRx   = /(.+?) (left|was removed)/i;
    const yearRx   = /(\d{4})/;

    sysMsgs.forEach((el) => {
      const txt  = el.textContent.trim();
      let msgYear = year;
      const cont  = el.closest("div[data-testid='msg-container']") || el.closest(".message-system");
      if (cont) {
        const dateEl = cont.querySelector("span[data-testid='msg-time'], time");
        const m      = dateEl && dateEl.textContent.match(yearRx);
        if (m) msgYear = parseInt(m[1]);
      }

      let name = null, src = "past", m;
      m = txt.match(joinedRx);
      if (m) { name = m[1].replace(/[+\u202a\u202c\u200e\u200f]/g, "").trim(); src = "added"; }
      if (!name) {
        m = txt.match(leftRx);
        if (m) { name = m[1].replace(/[+\u202a\u202c\u200e\u200f]/g, "").trim(); src = "left"; }
      }
      if (name && name.length > 1 && !seen.has(name)) {
        seen.add(name);
        const isPhone   = /^\+?[\d\s\-()]+$/.test(name);
        const normPhone = isPhone ? normalizePhone(name) : "";
        contacts.push({
          year: msgYear, group: groupName, name,
          phone: normPhone, hasPhone: normPhone.length > 0, saved: detectSaved(name),
          role: "past member", source: src,
        });
      }
    });

    return contacts;
  }

  // ─── Utilities ────────────────────────────────────────────────────────────

  function normalizePhone(raw) {
    return raw.replace(/[^\d+\s\-()]/g, "").trim();
  }
  function looksLikePhoneNumber(name) {
    return /^\+?[\d]{6,15}$/.test(name.replace(/[\s\-().+]/g, ""));
  }
  function detectSaved(name) {
    return !looksLikePhoneNumber(name);
  }

  // ─── Message listener ────────────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {

    if (msg.action === "ping") {
      sendResponse({ ok: true });
      return;
    }

    if (msg.action === "extract_current") {
      (async () => {
        try {
          const groupName = getCurrentGroupName();
          sendProgress('Found: "' + groupName + '" — locating member list…');

          // Find the virtualised scroll container
          const container = findMembersPanel();

          let members;
          if (!container) {
            sendProgress("⚠️ No scroll panel found — extracting visible rows only");
            const snap = new Map();
            harvestRows(null, groupName, getYear(), snap);
            members = Array.from(snap.values());
          } else {
            sendProgress("Panel found — scrolling through all members…");
            members = await scrollAndHarvestAll(container, groupName);
          }

          // Merge with historical system-message contacts
          const historical = extractHistoricalFromMessages(groupName);
          const namesSeen  = new Set(members.map((c) => c.name));
          historical.forEach((h) => {
            if (!namesSeen.has(h.name)) { namesSeen.add(h.name); members.push(h); }
          });

          sendProgress("Done — " + members.length + " contacts extracted");
          sendResponse({ ok: true, groupName, contacts: members, count: members.length });
        } catch (err) {
          sendResponse({ ok: false, error: err.message });
        }
      })();
      return true;
    }

    if (msg.action === "get_groups_list") {
      const groups = [];
      document.querySelectorAll('div[data-testid="cell-frame-container"]').forEach((item) => {
        const title = item.querySelector('span[data-testid="cell-frame-title"]');
        if (title && title.textContent.trim()) groups.push(title.textContent.trim());
      });
      sendResponse({ ok: true, groups });
      return true;
    }
  });

  console.log("[WA Extractor] Content script v4 (virtual-scroll aware) loaded");
})();
