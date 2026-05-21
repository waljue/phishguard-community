// AitM Block – Professional Edition Background Script
// Handles: tab scanning, webhook POSTs, screenshot capture for reporting

const _ext = typeof browser !== "undefined" ? browser : chrome;

const _pending = new Set();
const _retries = new Map();
const MAX_RETRIES = 5;

const PRO_DEFAULTS = {
    language:            "en",
    whitelistDomains:    [],
    webhookEnabled:      false,
    webhookUrl:          "",
    webhookApiKey:       "",
    trustedBadgeEnabled: false,
    customColors:        {},
    customLogoUrl:       "",
    customWarningText:   "",
    accentColor:         "",
    backgroundColor:     "",
    textColor:           "",
};

// ── Tab management ────────────────────────────────────────────────────────────
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

// ── Message router ────────────────────────────────────────────────────────────
_ext.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "content_ready" && sender.tab?.id) {
        if (_pending.has(sender.tab.id)) triggerScan(sender.tab.id);
        return false;
    }

    if (msg.action === "pro_webhook_event" && msg.payload) {
        _sendWebhook(msg.payload).catch(console.warn);
        return false;
    }

    if (msg.action === "pro_report_phishing" && msg.payload) {
        _handleReport(msg.payload, sender.tab?.id)
            .then(() => sendResponse({ ok: true }))
            .catch(err => { console.warn("[PhishGuard Pro] report failed", err); sendResponse({ ok: false }); });
        return true;
    }

    if (msg.action === "pro_manual_report" && msg.payload) {
        _handleManualReport(msg.payload)
            .then(() => sendResponse({ ok: true }))
            .catch(err => { console.warn("[PhishGuard Pro] manual report failed", err); sendResponse({ ok: false, error: err.message }); });
        return true;
    }

    return false;
});

// ── Settings helper ───────────────────────────────────────────────────────────
async function _getSettings() {
    const local = await _ext.storage.local.get(PRO_DEFAULTS);
    if (!_ext.storage?.managed) return { ...PRO_DEFAULTS, ...local };
    const managed = await _ext.storage.managed.get(PRO_DEFAULTS).catch(() => ({}));
    const hasMgd = managed && (
        managed.webhookEnabled || managed.webhookUrl ||
        managed.webhookApiKey || managed.language ||
        (Array.isArray(managed.whitelistDomains) && managed.whitelistDomains.length > 0) ||
        managed.showSignalDetails !== undefined ||
        managed.accentColor || managed.backgroundColor || managed.textColor ||
        managed.customLogoUrl || managed.customWarningText
    );
    return hasMgd
        ? { ...PRO_DEFAULTS, ...local, ...managed }
        : { ...PRO_DEFAULTS, ...local };
}

// ── Webhook POST ──────────────────────────────────────────────────────────────
async function _sendWebhook(payload) {
    const settings = await _getSettings();
    if (!settings.webhookEnabled) return;
    if (!settings.webhookUrl)     { console.warn("[PhishGuard Pro] webhookUrl missing"); return; }

    const body = {
        source:  "aitm-block-pro",
        version: _ext.runtime.getManifest().version,
        ...payload,
    };

    const headers = { "Content-Type": "application/json" };
    if (settings.webhookApiKey) headers["x-api-key"] = settings.webhookApiKey;

    const res = await fetch(settings.webhookUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
    });
    console.info("[PhishGuard Pro] webhook response", res.status, res.ok);
}

// ── Report phishing (with screenshot) ────────────────────────────────────────
async function _handleReport(payload, tabId) {
    const settings = await _getSettings();
    if (!settings.webhookEnabled || !settings.webhookUrl) return;

    let screenshotBase64 = null;
    if (tabId != null) {
        try {
            // captureVisibleTab requires the tab to be active and the extension to have activeTab
            screenshotBase64 = await _ext.tabs.captureVisibleTab(null, { format: "jpeg", quality: 75 });
        } catch (e) {
            console.warn("[PhishGuard Pro] screenshot failed:", e.message);
        }
    }

    const body = {
        source:     "aitm-block-pro",
        version:    _ext.runtime.getManifest().version,
        type:       "user_report",
        screenshot: screenshotBase64 ?? null,
        ...payload,
    };

    const headers = { "Content-Type": "application/json" };
    if (settings.webhookApiKey) headers["x-api-key"] = settings.webhookApiKey;

    const res = await fetch(settings.webhookUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    console.info("[PhishGuard Pro] report sent", res.status);
}

// ── Manual report from popup (any page, user-initiated) ───────────────────────
async function _handleManualReport(payload) {
    const settings = await _getSettings();
    if (!settings.webhookEnabled || !settings.webhookUrl) throw new Error("Webhook not configured");

    // Screenshot captured by popup before sending — extract and forward
    const { screenshot = null, ...rest } = payload;

    const body = {
        source:     "aitm-block-pro",
        version:    _ext.runtime.getManifest().version,
        type:       "manual_report",
        screenshot,
        ...rest,
    };

    const headers = { "Content-Type": "application/json" };
    if (settings.webhookApiKey) headers["x-api-key"] = settings.webhookApiKey;

    const res = await fetch(settings.webhookUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    console.info("[PhishGuard Pro] manual report sent", res.status);
}
