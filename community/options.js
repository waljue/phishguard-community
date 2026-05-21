// PhishGuard Community – Settings Page

const _ext = typeof browser !== "undefined" ? browser : chrome;

const DEFAULTS = { trustedBadgeEnabled: true };

const $ = id => document.getElementById(id);

function load() {
    _ext.storage.local.get(DEFAULTS, s => {
        $("trustedBadge").checked = s.trustedBadgeEnabled !== false;
    });
}

$("saveBtn").addEventListener("click", () => {
    _ext.storage.local.set({ trustedBadgeEnabled: $("trustedBadge").checked }, () => {
        if (_ext.runtime.lastError) {
            showStatus("Error: " + _ext.runtime.lastError.message, true);
        } else {
            showStatus("Saved.", false);
        }
    });
});

function showStatus(msg, error) {
    const el = $("statusMsg");
    el.textContent = msg;
    el.className = "status" + (error ? " error" : "");
    setTimeout(() => { el.textContent = ""; }, 2500);
}

load();
