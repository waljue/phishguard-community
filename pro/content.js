// AitM Block – Professional Edition Content Script
// Base IT GmbH | Requires: shared/detection.js loaded first

const _ext = typeof browser !== "undefined" ? browser : chrome;

// ── Translations ──────────────────────────────────────────────────────────────
const TRANSLATIONS = {
    en: {
        severityTag:       "CRITICAL — PHISHING DETECTED",
        title:             "AitM Phishing Attack Detected",
        subtitle:          "Security Warning",
        warningHeading:    "Do not enter your credentials on this page.",
        bodyText:
            "This page is impersonating a <strong>Microsoft 365 / Azure AD login</strong> " +
            "but is hosted on an unverified domain. This is an " +
            "<strong>Adversary-in-the-Middle (AitM)</strong> phishing attack that captures " +
            "credentials <em>and</em> session tokens — bypassing MFA.",
        suspiciousDomain:  "Suspicious domain:",
        signalsTitle:      "Detection signals",
        score:             "Score",
        threshold:         "threshold",
        learnMore:         "What does this mean?",
        reportBtn:         "Report Phishing",
        reportSending:     "Sending…",
        reportSent:        "Reported ✓",
        reportFailed:      "Send failed",
        dismiss:           "Dismiss",
        trustedTitle:      "Verified Microsoft Login",
        trustedSubtitle:   "This page is on a legitimate Microsoft domain.",
        adminTitle:        "Security Team Summary",
        timestamp:         "Timestamp:",
        url:               "URL:",
        host:              "Host:",
        scoreLabel:        "Score:",
        signalsLabel:      "Signals:",
        none:              "none",
        signalLabels: {
            jsGlobals:         "Microsoft JS runtime ($Config / ServerData)",
            tenantBranding:    "Microsoft tenant branding data (aTenantBranding / TenantId)",
            pageId:            "Microsoft ConvergedSignIn PageID meta tag",
            msCdn:             "Microsoft authentication CDN resources",
            domIds:            "Microsoft-specific DOM element IDs",
            bodyClass:         "Microsoft login page body classes",
            msButtonColor:     "Microsoft blue sign-in button",
            logoHint:          "Microsoft branding / logo hints",
            oauthHiddenInputs: "OAuth / MSAL hidden input fields",
            formStructure:     "Login form structure detected",
            titleMatch:        "Page title matches Microsoft sign-in",
            buttonText:        "Sign-in button text detected",
        },
    },
    de: {
        severityTag:       "KRITISCH — PHISHING ERKANNT",
        title:             "AitM-Phishing-Angriff erkannt",
        subtitle:          "Sicherheitswarnung",
        warningHeading:    "Geben Sie auf dieser Seite keine Zugangsdaten ein.",
        bodyText:
            "Diese Seite imitiert eine <strong>Microsoft 365 / Azure AD Anmeldeseite</strong>, " +
            "ist aber auf einer nicht verifizierten Domain gehostet. Dies ist ein " +
            "<strong>Adversary-in-the-Middle (AitM)</strong>-Phishing-Angriff, der " +
            "Zugangsdaten <em>und</em> Session-Tokens stiehlt — MFA wird umgangen.",
        suspiciousDomain:  "Verdächtige Domain:",
        signalsTitle:      "Erkennungssignale",
        score:             "Score",
        threshold:         "Schwellwert",
        learnMore:         "Was bedeutet das?",
        reportBtn:         "Phishing melden",
        reportSending:     "Sende…",
        reportSent:        "Gemeldet ✓",
        reportFailed:      "Fehler beim Senden",
        dismiss:           "Schließen",
        trustedTitle:      "Verifizierter Microsoft-Login",
        trustedSubtitle:   "Diese Seite befindet sich auf einer legitimen Microsoft-Domain.",
        adminTitle:        "Zusammenfassung für das Security-Team",
        timestamp:         "Zeitpunkt:",
        url:               "URL:",
        host:              "Host:",
        scoreLabel:        "Score:",
        signalsLabel:      "Signale:",
        none:              "keine",
        signalLabels: {
            jsGlobals:         "Microsoft JS-Runtime ($Config / ServerData)",
            tenantBranding:    "Microsoft Tenant-Branding-Daten (aTenantBranding / TenantId)",
            pageId:            "Microsoft ConvergedSignIn PageID Meta-Tag",
            msCdn:             "Microsoft Authentifizierungs-CDN Ressourcen",
            domIds:            "Microsoft-spezifische DOM-Element-IDs",
            bodyClass:         "Microsoft Login-Seiten Body-Klassen",
            msButtonColor:     "Microsoft blauer Anmelde-Button",
            logoHint:          "Microsoft Branding / Logo-Hinweise",
            oauthHiddenInputs: "OAuth / MSAL Hidden-Input-Felder",
            formStructure:     "Login-Formular-Struktur erkannt",
            titleMatch:        "Seitentitel entspricht Microsoft-Login",
            buttonText:        "Anmelde-Button-Text erkannt",
        },
    },
};

// ── Settings ──────────────────────────────────────────────────────────────────
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

// Base IT CI defaults
const BASEIT = {
    bg:      "#ffffff",
    surface: "#f4f7f8",
    dark:    "#0b1f33",
    teal:    "#00a19a",
    green:   "#95c11f",
    border:  "#e3ecef",
};

let _settings = { ...PRO_DEFAULTS };
let _shown = false;
let _dismissed = false;
let _popupActive = false;

function t(key, sub = "") {
    const lang = _settings.language || "en";
    const dict = TRANSLATIONS[lang] || TRANSLATIONS.en;
    return (dict[key] ?? TRANSLATIONS.en[key] ?? key).replace("$1", sub);
}

function tSignal(key) {
    const lang = _settings.language || "en";
    const dict = TRANSLATIONS[lang] || TRANSLATIONS.en;
    return dict.signalLabels?.[key] ?? TRANSLATIONS.en.signalLabels?.[key] ?? key;
}

function resolveColor(key, fallback) {
    return _settings.customColors?.[key] || fallback;
}

// ── Settings loading ──────────────────────────────────────────────────────────
function _loadSettings() {
    if (!_ext.storage?.local) return;

    const localP = new Promise(res =>
        _ext.storage.local.get(PRO_DEFAULTS, d => res(d || {}))
    );

    if (_ext.storage?.managed) {
        _ext.storage.managed.get(PRO_DEFAULTS, managed => {
            localP.then(local => {
                const hasMgd = _hasManagedValues(managed);
                _settings = hasMgd
                    ? { ...PRO_DEFAULTS, ...local, ...managed }
                    : { ...PRO_DEFAULTS, ...local };
                _normalizeSettings();
            });
        });
        return;
    }
    localP.then(local => {
        _settings = { ...PRO_DEFAULTS, ...local };
        _normalizeSettings();
    });
}

function _normalizeSettings() {
    if (!Array.isArray(_settings.whitelistDomains)) _settings.whitelistDomains = [];
    _settings.whitelistDomains = _settings.whitelistDomains
        .map(e => String(e || "").trim().toLowerCase())
        .filter(Boolean);
    if (!_settings.customColors || typeof _settings.customColors !== "object") {
        _settings.customColors = {};
    }
    // Flat managed-storage keys override nested customColors
    if (_settings.accentColor)     _settings.customColors.accent     = _settings.accentColor;
    if (_settings.backgroundColor) _settings.customColors.background = _settings.backgroundColor;
    if (_settings.textColor)       _settings.customColors.text       = _settings.textColor;
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

function _isWhitelisted(host) {
    const h = host.toLowerCase();
    return (_settings.whitelistDomains || []).some(entry => {
        let d = entry;
        if (d.startsWith("http://") || d.startsWith("https://")) {
            try { d = new URL(d).hostname.toLowerCase(); } catch { return false; }
        }
        d = d.replace(/^\*\./, "").replace(/^\./, "");
        return d && (h === d || h.endsWith("." + d));
    });
}

_loadSettings();

if (_ext.storage?.onChanged) {
    _ext.storage.onChanged.addListener((_, area) => {
        if (area === "local" || area === "managed") _loadSettings();
    });
}

// ── Message listener ──────────────────────────────────────────────────────────
_ext.runtime.sendMessage({ action: "content_ready" });

_ext.runtime.onMessage.addListener((msg) => {
    if (msg.action !== "scan_html") return;
    if (_dismissed) return;

    const host = window.location.hostname.toLowerCase();

    if (aitm_isLegitDomain(host)) {
        if (_settings.trustedBadgeEnabled) _showTrustedBadge();
        return;
    }

    if (_isWhitelisted(host)) return;

    [0, 800, 2500, 5500, 10000].forEach(delay =>
        setTimeout(() => {
            if (_dismissed || _shown) return;
            const h = window.location.hostname.toLowerCase();
            if (!aitm_isLegitDomain(h) && !_isWhitelisted(h)) _runDetection();
        }, delay)
    );
});

// ── Detection ─────────────────────────────────────────────────────────────────
function _runDetection() {
    if (_shown || _popupActive) return;
    const result = aitm_getScore();
    console.info("[PhishGuard Pro] score=%d/%d", result.score, result.threshold, result.breakdown);
    if (result.score >= result.threshold) {
        _maybeSendWebhook(result);
        _showWarning(result);
    }
}

// ── Webhook ───────────────────────────────────────────────────────────────────
function _maybeSendWebhook(result) {
    if (!_settings.webhookEnabled || !_settings.webhookUrl) return;
    _ext.runtime.sendMessage({
        action: "pro_webhook_event",
        payload: {
            type:      "detection",
            timestamp: new Date().toISOString(),
            url:       window.location.href,
            host:      window.location.hostname,
            score:     result.score,
            threshold: result.threshold,
            breakdown: result.breakdown,
        },
    });
}

function _sendReport(result) {
    if (!_settings.webhookEnabled || !_settings.webhookUrl) return Promise.resolve();
    return new Promise(res => {
        _ext.runtime.sendMessage(
            {
                action: "pro_report_phishing",
                payload: {
                    timestamp: new Date().toISOString(),
                    url:       window.location.href,
                    host:      window.location.hostname,
                    score:     result.score,
                    breakdown: result.breakdown,
                },
            },
            res
        );
    });
}

// ── Warning overlay ───────────────────────────────────────────────────────────
function _showWarning(result) {
    if (_shown || _dismissed || _popupActive) return;
    _shown = true;
    _popupActive = true;

    const bg    = resolveColor("background", BASEIT.bg);
    const acc   = resolveColor("accent",     BASEIT.teal);
    // Smart text fallback: dark bg → light text, light bg → dark text
    const bright      = _isBright(bg);
    const txtFallback = bright ? BASEIT.dark : "#f0f4f6";
    const txt   = resolveColor("text", txtFallback);

    // Adaptive derived colors — work on any bg/acc/txt combination
    const surface  = _hexToRgba(txt, bright ? 0.04 : 0.12);
    const border   = _hexToRgba(txt, bright ? 0.10 : 0.22);
    const alertBg  = bright ? "#fff5f5"              : "rgba(239,68,68,0.12)";
    const alertBdr = bright ? "1px solid #fca5a5"   : "1px solid rgba(239,68,68,0.35)";
    const alertTxt = bright ? "#991b1b"              : "#fca5a5";

    const warningText = _settings.customWarningText || t("bodyText");
    const logoUrl = _settings.customLogoUrl
        ? _settings.customLogoUrl
        : _ext.runtime.getURL("assets/baseit-logo.png");
    const confidence = Math.min(Math.round((result.score / 20) * 100), 99);

    document.getElementById("__aitm_pro_overlay__")?.remove();

    // Overlay backdrop
    const overlay = _el("div", {
        id: "__aitm_pro_overlay__",
        style: {
            position: "fixed", inset: "0", zIndex: "2147483647",
            background: "rgba(5,16,28,0.72)",
            backdropFilter: "blur(7px)", webkitBackdropFilter: "blur(7px)",
            display: "flex", justifyContent: "center", alignItems: "center",
            padding: "20px", boxSizing: "border-box",
            fontFamily: "'Inter','Segoe UI',system-ui,Arial,sans-serif",
        },
    });

    // Modal
    const modal = _el("div", {
        style: {
            width: "540px", maxWidth: "94vw",
            background: bg,
            borderRadius: "12px",
            border: `1px solid ${border}`,
            boxShadow: "0 24px 56px rgba(11,31,51,0.32), 0 4px 12px rgba(11,31,51,0.12)",
            color: txt,
            overflow: "hidden",
        },
    });

    // Header gradient bar
    const headerBar = _el("div", {
        style: {
            background: `linear-gradient(90deg, ${acc} 0%, ${_darken(acc, 15)} 100%)`,
            padding: "14px 20px",
            display: "flex", alignItems: "center", justifyContent: "space-between",
        },
    });
    const headerLeft = _el("div", {
        style: { display: "flex", alignItems: "center", gap: "10px" },
    });

    // Logo
    const logoImg = document.createElement("img");
    logoImg.src = logoUrl;
    logoImg.style.cssText = "width:22px;height:22px;object-fit:contain;flex-shrink:0";
    logoImg.onerror = () => { logoImg.style.display = "none"; };
    headerLeft.appendChild(logoImg);

    headerLeft.appendChild(_el("span", {
        style: { fontSize: "14px", fontWeight: "700", color: "#ffffff", letterSpacing: "0.02em" },
        text:  t("subtitle"),
    }));
    headerBar.appendChild(headerLeft);

    // Confidence badge
    headerBar.appendChild(_el("span", {
        style: {
            fontSize: "11px", fontWeight: "700",
            background: "rgba(255,255,255,0.18)",
            color: "#ffffff", padding: "3px 8px",
            borderRadius: "2px", letterSpacing: "0.06em",
        },
        text: `${confidence}% confidence`,
    }));
    modal.appendChild(headerBar);

    // Body
    const body = _el("div", { style: { padding: "20px" } });

    // Alert heading
    const alertBox = _el("div", {
        style: {
            padding: "10px 14px", marginBottom: "14px",
            background: alertBg, border: alertBdr,
            borderLeft: "4px solid #ef4444",
            borderRadius: "4px",
            fontSize: "13px", fontWeight: "600", color: alertTxt,
            lineHeight: "1.4",
        },
    });
    alertBox.textContent = t("warningHeading");
    body.appendChild(alertBox);

    // Main description
    const desc = _el("p", {
        style: { margin: "0 0 14px", fontSize: "14px", lineHeight: "1.65", color: txt },
    });
    desc.innerHTML = warningText;
    body.appendChild(desc);

    // Domain pill
    const domainRow = _el("div", {
        style: {
            marginBottom: "0",
            padding: "12px 14px",
            background: _hexToRgba(acc, 0.08),
            border: `1px solid ${_hexToRgba(acc, 0.25)}`,
            borderLeft: `4px solid ${acc}`,
            borderRadius: "6px",
            display: "flex",
            flexDirection: "column",
            gap: "3px",
        },
    });
    domainRow.innerHTML =
        `<span style="font-size:10px;font-weight:700;color:${acc};text-transform:uppercase;letter-spacing:0.08em">${t("suspiciousDomain")}</span>` +
        `<span style="font-size:14px;font-weight:700;color:${txt};font-family:'JetBrains Mono','Courier New',monospace;word-break:break-all;line-height:1.4">${window.location.hostname}</span>`;
    body.appendChild(domainRow);
    modal.appendChild(body);

    // Collapsible signal details + admin summary (hidden when showSignalDetails === false)
    const details = document.createElement("details");
    Object.assign(details.style, {
        borderTop: `1px solid ${border}`,
        borderBottom: `1px solid ${border}`,
        fontSize: "12px",
    });
    const summary = _el("summary", {
        style: {
            padding: "9px 20px", cursor: "pointer",
            fontWeight: "600", fontSize: "12px", color: acc,
            userSelect: "none", listStyle: "none",
        },
        text: `${t("signalsTitle")} — ${t("score")} ${result.score} (${t("threshold")}: ${result.threshold})`,
    });
    details.appendChild(summary);

    const detailsInner = _el("div", {
        style: {
            padding: "8px 20px 14px",
            background: surface,
            maxHeight: "30vh", overflowY: "auto",
        },
    });

    // Signal rows
    for (const [key, pts] of Object.entries(result.breakdown)) {
        const row = _el("div", {
            style: {
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "4px 0", borderBottom: `1px solid ${border}`,
                fontSize: "12px",
            },
        });
        row.innerHTML =
            `<span style="color:${txt}">${tSignal(key)}</span>` +
            `<span style="color:${acc};font-weight:700;font-family:monospace">+${pts}</span>`;
        detailsInner.appendChild(row);
    }

    // Admin pre block
    const adminTitle = _el("div", {
        style: { fontWeight: "600", margin: "10px 0 6px", color: BASEIT.dark, fontSize: "12px" },
        text: t("adminTitle"),
    });
    detailsInner.appendChild(adminTitle);

    const adminPre = _el("pre", {
        style: {
            margin: "0", padding: "10px 12px",
            background: BASEIT.dark, color: "#e2edf3",
            fontFamily: "'JetBrains Mono','Courier New',monospace",
            fontSize: "11px", whiteSpace: "pre-wrap", overflowWrap: "break-word",
        },
    });
    const detectedKeys = Object.keys(result.breakdown).join(", ") || t("none");
    adminPre.textContent = [
        `${t("timestamp")} ${new Date().toISOString()}`,
        `${t("url")} ${window.location.href}`,
        `${t("host")} ${window.location.hostname}`,
        `${t("scoreLabel")} ${result.score} (threshold: ${result.threshold})`,
        `${t("signalsLabel")} ${detectedKeys}`,
    ].join("\n");
    detailsInner.appendChild(adminPre);

    details.appendChild(detailsInner);
    if (_settings.showSignalDetails !== false) modal.appendChild(details);

    // Footer buttons
    const footer = _el("div", {
        style: {
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "14px 20px", background: surface,
            borderTop: `1px solid ${border}`,
            gap: "8px", flexWrap: "wrap",
        },
    });

    // Left: Learn more + Report
    const leftBtns = _el("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap" } });

    const learnMore = document.createElement("a");
    learnMore.href = "https://whennotif.io/blog/aitm-phishing";
    learnMore.target = "_blank";
    learnMore.rel = "noopener noreferrer";
    Object.assign(learnMore.style, {
        padding: "6px 12px", background: "transparent", color: acc,
        textDecoration: "none", fontSize: "12px", fontWeight: "600",
        display: "inline-block", flexShrink: "0",
        border: `1px solid ${acc}`, borderRadius: "4px",
    });
    learnMore.textContent = t("learnMore");
    leftBtns.appendChild(learnMore);
    footer.appendChild(leftBtns);

    // Right: dismiss with countdown
    const rightWrap = _el("div", { style: { display: "flex", alignItems: "center", gap: "8px" } });

    const timerSpan = _el("span", {
        style: { fontSize: "12px", color: "#9ca3af", fontFamily: "monospace" },
        text: "(60s)",
    });
    const dismissBtn = _el("button", {
        style: {
            padding: "6px 12px", background: "transparent",
            border: "1px solid #d1d5db", borderRadius: "4px",
            color: "#9ca3af", fontSize: "12px", fontWeight: "500",
            cursor: "not-allowed",
        },
        text: t("dismiss"),
    });
    dismissBtn.disabled = true;

    let secs = 60;
    const countdown = setInterval(() => {
        secs--;
        if (secs <= 0) {
            clearInterval(countdown);
            timerSpan.textContent = "";
            dismissBtn.disabled = false;
            dismissBtn.style.cursor = "pointer";
            dismissBtn.style.color = "#6b7280";
            dismissBtn.style.borderColor = "#d1d5db";
        } else {
            timerSpan.textContent = `(${secs}s)`;
        }
    }, 1000);

    dismissBtn.onclick = () => {
        _dismissed = true;
        _popupActive = false;
        overlay.remove();
    };

    rightWrap.appendChild(timerSpan);
    rightWrap.appendChild(dismissBtn);
    footer.appendChild(rightWrap);

    modal.appendChild(footer);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
}

// ── Trusted badge ─────────────────────────────────────────────────────────────
function _showTrustedBadge() {
    if (document.getElementById("__aitm_trusted__")) return;
    const badge = _el("div", {
        id: "__aitm_trusted__",
        style: {
            position: "fixed", bottom: "16px", right: "16px",
            zIndex: "2147483646",
            background: "#f0fdf4", border: "1px solid #bbf7d0",
            borderLeft: "3px solid #22c55e",
            padding: "8px 12px",
            fontSize: "12px", fontWeight: "600", color: "#15803d",
            fontFamily: "'Inter','Segoe UI',system-ui,sans-serif",
            boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
            display: "flex", alignItems: "center", gap: "6px",
            cursor: "default", userSelect: "none",
            maxWidth: "260px",
        },
    });
    badge.innerHTML =
        `<span style="font-size:14px">✓</span>` +
        `<div>` +
        `<div style="font-size:12px;font-weight:700">Verified Microsoft Login</div>` +
        `<div style="font-size:11px;font-weight:400;color:#16a34a">${window.location.hostname}</div>` +
        `</div>`;
    // Auto-hide after 6s
    document.body.appendChild(badge);
    setTimeout(() => {
        badge.style.transition = "opacity 0.5s";
        badge.style.opacity = "0";
        setTimeout(() => badge.remove(), 600);
    }, 6000);
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function _el(tag, opts = {}) {
    const node = document.createElement(tag);
    if (opts.style) Object.assign(node.style, opts.style);
    if (opts.text)  node.textContent = opts.text;
    if (opts.id)    node.id = opts.id;
    return node;
}

function _hexToRgba(hex, alpha) {
    const n = parseInt((hex || "#000000").replace("#", ""), 16);
    return `rgba(${(n >> 16) & 0xff},${(n >> 8) & 0xff},${n & 0xff},${alpha})`;
}

function _isBright(hex) {
    const n = parseInt((hex || "#ffffff").replace("#", ""), 16);
    const r = (n >> 16) & 0xff, g = (n >> 8) & 0xff, b = n & 0xff;
    return (0.299 * r + 0.587 * g + 0.114 * b) > 128;
}

function _darken(hex, pct) {
    const n = parseInt(hex.replace("#", ""), 16);
    const r = Math.max(0, ((n >> 16) & 0xff) - Math.round(2.55 * pct));
    const g = Math.max(0, ((n >> 8)  & 0xff) - Math.round(2.55 * pct));
    const b = Math.max(0,  (n        & 0xff) - Math.round(2.55 * pct));
    return "#" + [r, g, b].map(x => x.toString(16).padStart(2, "0")).join("");
}
