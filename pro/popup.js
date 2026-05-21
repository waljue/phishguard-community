// AitM Block Pro – Popup Script

const _ext = typeof browser !== "undefined" ? browser : chrome;

const PRO_DEFAULTS = {
    webhookEnabled: false,
    webhookUrl:     "",
    webhookApiKey:  "",
    customLogoUrl:  "",
};

const $ = id => document.getElementById(id);

async function init() {
    // Get active tab
    const [tab] = await _ext.tabs.query({ active: true, currentWindow: true });

    let host = "—";
    let tabId = null;
    let restricted = false;

    if (tab?.url) {
        try {
            const u = new URL(tab.url);
            host = u.hostname || tab.url;
            tabId = tab.id;
            restricted = ["chrome:", "edge:", "about:", "moz-extension:", "chrome-extension:"].includes(u.protocol);
        } catch {
            restricted = true;
        }
    }

    $("domainVal").textContent = host;

    // Load settings
    const local = await new Promise(res => _ext.storage.local.get(PRO_DEFAULTS, res));
    let settings = { ...PRO_DEFAULTS, ...local };

    if (_ext.storage?.managed) {
        const managed = await new Promise(res =>
            _ext.storage.managed.get(PRO_DEFAULTS, d => res(d || {}))
        );
        if (managed.webhookEnabled || managed.webhookUrl) {
            settings = { ...settings, ...managed };
        }
    }

    // Custom logo
    if (settings.customLogoUrl) {
        $("logo").src = settings.customLogoUrl;
    }
    $("logo").onerror = () => { $("logo").style.display = "none"; };

    // Settings link
    $("settingsLink").addEventListener("click", e => {
        e.preventDefault();
        _ext.runtime.openOptionsPage();
        window.close();
    });

    // Restricted page
    if (restricted) {
        $("desc").textContent = "Cannot report browser internal pages.";
        $("reportWrap").hidden = true;
        return;
    }

    // No webhook
    if (!settings.webhookEnabled || !settings.webhookUrl) {
        $("reportWrap").hidden = true;
        $("noWebhook").hidden = false;
        $("optionsLink").addEventListener("click", e => {
            e.preventDefault();
            _ext.runtime.openOptionsPage();
            window.close();
        });
        return;
    }

    // Report button — runs entirely in popup context, no background involvement
    $("reportBtn").addEventListener("click", async () => {
        const btn = $("reportBtn");
        btn.disabled = true;
        btn.textContent = "Sending…";
        _setStatus("", "");

        try {
            let screenshot = null;
            try {
                screenshot = await _ext.tabs.captureVisibleTab(null, { format: "jpeg", quality: 75 });
            } catch (e) {
                console.warn("[AitM Block Pro] screenshot failed:", e.message);
            }

            const manifest = _ext.runtime.getManifest();
            const body = {
                source:     "aitm-block-pro",
                version:    manifest.version,
                type:       "manual_report",
                timestamp:  new Date().toISOString(),
                url:        tab.url,
                host,
                screenshot,
            };

            const headers = { "Content-Type": "application/json" };
            if (settings.webhookApiKey) headers["x-api-key"] = settings.webhookApiKey;

            const res = await fetch(settings.webhookUrl, {
                method: "POST",
                headers,
                body: JSON.stringify(body),
            });

            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            btn.textContent = "Reported ✓";
            btn.style.background = "#059669";
            _setStatus("Report sent to security team.", "ok");
        } catch (e) {
            btn.disabled = false;
            btn.textContent = "Report this page as phishing";
            _setStatus("Failed to send: " + e.message, "error");
        }
    });
}

function _setStatus(msg, type) {
    const el = $("status");
    el.textContent = msg;
    el.className = "status" + (type ? " " + type : "");
}

init().catch(e => _setStatus(e.message, "error"));
