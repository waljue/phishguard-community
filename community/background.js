// AitM Block – Community Edition Background Script
// MV3 service worker (Chrome) / persistent background (Firefox MV2 polyfill)

const _ext = typeof browser !== "undefined" ? browser : chrome;

const _pending = new Set();
const _retries = new Map();
const MAX_RETRIES = 5;

function isRestricted(url) {
    return !url ||
        url.startsWith("chrome://") ||
        url.startsWith("edge://") ||
        url.startsWith("about:") ||
        url.startsWith("moz-extension://") ||
        url.startsWith("chrome-extension://");
}

function triggerScan(tabId) {
    _ext.tabs.sendMessage(tabId, { action: "scan_html" })
        .then(() => { _pending.delete(tabId); _retries.delete(tabId); })
        .catch(() => { _pending.add(tabId); scheduleRetry(tabId); });
}

function scheduleRetry(tabId) {
    const attempt = _retries.get(tabId) || 0;
    if (attempt >= MAX_RETRIES) return;
    _retries.set(tabId, attempt + 1);
    setTimeout(() => {
        if (_pending.has(tabId)) triggerScan(tabId);
    }, 350 * (attempt + 1));
}

_ext.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status !== "complete") return;
    if (isRestricted(tab.url)) return;
    _pending.add(tabId);
    triggerScan(tabId);
});

_ext.tabs.onRemoved.addListener(tabId => {
    _pending.delete(tabId);
    _retries.delete(tabId);
});

_ext.runtime.onMessage.addListener((msg, sender) => {
    if (msg.action === "content_ready" && sender.tab?.id) {
        if (_pending.has(sender.tab.id)) triggerScan(sender.tab.id);
    }
});
