// AitM Block Pro – Settings Page Logic

const _ext = typeof browser !== "undefined" ? browser : chrome;

const PRO_DEFAULTS = {
    language:            "en",
    whitelistDomains:    [],
    webhookEnabled:      false,
    webhookUrl:          "",
    webhookApiKey:       "",
    trustedBadgeEnabled: false,
    customColors: {
        background: "",
        accent:     "",
        text:       "",
    },
    customLogoUrl:       "",
    customWarningText:   "",
    showSignalDetails:   true,
    accentColor:         "",
    backgroundColor:     "",
    textColor:           "",
};

// ── DOM refs ──────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const els = {
    language:            $("language"),
    trustedBadge:        $("trustedBadge"),
    showSignalDetails:   $("showSignalDetails"),
    whitelist:           $("whitelist"),
    webhookEnabled:      $("webhookEnabled"),
    webhookFields:       $("webhookFields"),
    webhookUrl:          $("webhookUrl"),
    webhookApiKey:       $("webhookApiKey"),
    colorAccent:         $("colorAccent"),
    colorAccentPicker:   $("colorAccentPicker"),
    colorBg:             $("colorBg"),
    colorBgPicker:       $("colorBgPicker"),
    colorText:           $("colorText"),
    colorTextPicker:     $("colorTextPicker"),
    customLogo:          $("customLogo"),
    customWarningText:   $("customWarningText"),
    saveBtn:             $("saveBtn"),
    statusMsg:           $("statusMsg"),
    managedBanner:       $("managedBanner"),
};

let isManaged = false;

// ── Load & render ─────────────────────────────────────────────────────────────
function loadSettings() {
    _ext.storage.local.get(PRO_DEFAULTS, local => {
        if (_ext.storage?.managed) {
            _ext.storage.managed.get(PRO_DEFAULTS, managed => {
                const hasMgd = _hasManagedValues(managed);
                const merged = hasMgd
                    ? { ...PRO_DEFAULTS, ...local, ...managed }
                    : { ...PRO_DEFAULTS, ...local };
                isManaged = hasMgd;
                _render(merged);
            });
            return;
        }
        isManaged = false;
        _render({ ...PRO_DEFAULTS, ...local });
    });
}

function _render(s) {
    els.language.value = s.language || "en";
    els.trustedBadge.checked = !!s.trustedBadgeEnabled;
    els.showSignalDetails.checked = s.showSignalDetails !== false;

    const wl = Array.isArray(s.whitelistDomains) ? s.whitelistDomains : [];
    els.whitelist.value = wl.join("\n");

    els.webhookEnabled.checked = !!s.webhookEnabled;
    els.webhookFields.hidden = !s.webhookEnabled;
    els.webhookUrl.value = s.webhookUrl || "";
    els.webhookApiKey.value = s.webhookApiKey || "";

    const c = s.customColors || {};
    _setColorField(els.colorAccent, els.colorAccentPicker, c.accent || "");
    _setColorField(els.colorBg, els.colorBgPicker, c.background || "");
    _setColorField(els.colorText, els.colorTextPicker, c.text || "");

    els.customLogo.value = s.customLogoUrl || "";
    els.customWarningText.value = s.customWarningText || "";

    _setManagedState(isManaged);
}

function _setColorField(textEl, pickerEl, value) {
    textEl.value = value;
    if (value && /^#[0-9a-fA-F]{3,6}$/.test(value)) {
        pickerEl.value = value;
    }
}

function _setManagedState(managed) {
    const inputs = [
        els.language, els.trustedBadge, els.showSignalDetails, els.whitelist,
        els.webhookEnabled, els.webhookUrl, els.webhookApiKey,
        els.colorAccent, els.colorAccentPicker,
        els.colorBg, els.colorBgPicker,
        els.colorText, els.colorTextPicker,
        els.customLogo, els.customWarningText,
    ];
    inputs.forEach(el => { if (el) el.disabled = managed; });
    els.saveBtn.disabled = managed;
    els.saveBtn.style.opacity = managed ? "0.6" : "1";
    els.managedBanner.hidden = !managed;
}

function _hasManagedValues(s) {
    if (!s) return false;
    return (
        (Array.isArray(s.whitelistDomains) && s.whitelistDomains.length > 0) ||
        s.webhookEnabled || s.webhookUrl || s.webhookApiKey ||
        s.language || s.trustedBadgeEnabled !== undefined ||
        s.showSignalDetails !== undefined ||
        s.accentColor || s.backgroundColor || s.textColor ||
        s.customLogoUrl || s.customWarningText
    );
}

// ── Color picker ↔ text field sync ────────────────────────────────────────────
function _bindColorPair(textEl, pickerEl) {
    if (!textEl || !pickerEl) return;
    pickerEl.addEventListener("input", () => {
        textEl.value = pickerEl.value;
    });
    textEl.addEventListener("input", () => {
        const v = textEl.value.trim();
        if (/^#[0-9a-fA-F]{3,6}$/.test(v)) pickerEl.value = v;
    });
}

_bindColorPair(els.colorAccent, els.colorAccentPicker);
_bindColorPair(els.colorBg, els.colorBgPicker);
_bindColorPair(els.colorText, els.colorTextPicker);

// ── Webhook toggle ────────────────────────────────────────────────────────────
els.webhookEnabled.addEventListener("change", () => {
    els.webhookFields.hidden = !els.webhookEnabled.checked;
});

// ── Save ──────────────────────────────────────────────────────────────────────
els.saveBtn.addEventListener("click", () => {
    if (isManaged) {
        _showStatus("Settings are managed by policy and cannot be changed locally.", true);
        return;
    }

    const whitelistDomains = els.whitelist.value
        .split("\n")
        .map(l => l.trim())
        .filter(Boolean);

    const customColors = {
        accent:     els.colorAccent.value.trim() || "",
        background: els.colorBg.value.trim() || "",
        text:       els.colorText.value.trim() || "",
    };

    const settings = {
        language:            els.language.value,
        trustedBadgeEnabled: els.trustedBadge.checked,
        showSignalDetails:   els.showSignalDetails.checked,
        whitelistDomains,
        webhookEnabled:      els.webhookEnabled.checked,
        webhookUrl:          els.webhookUrl.value.trim(),
        webhookApiKey:       els.webhookApiKey.value.trim(),
        customColors,
        customLogoUrl:       els.customLogo.value.trim(),
        customWarningText:   els.customWarningText.value.trim(),
    };

    _ext.storage.local.set(settings, () => {
        if (_ext.runtime.lastError) {
            _showStatus("Error saving settings: " + _ext.runtime.lastError.message, true);
        } else {
            _showStatus("Settings saved.", false);
        }
    });
});

function _showStatus(msg, isError) {
    els.statusMsg.textContent = msg;
    els.statusMsg.className = "status-msg" + (isError ? " error" : "");
    setTimeout(() => { els.statusMsg.textContent = ""; }, 3000);
}

// ── Init ──────────────────────────────────────────────────────────────────────
loadSettings();
