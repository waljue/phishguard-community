// AitM Block – Community Edition Content Script
// whennotif• CI | "Real threats. Real fixes. No theater."
// Requires: shared/detection.js loaded first (provides aitm_* functions)

const _ext = typeof browser !== "undefined" ? browser : chrome;

let _shown = false;
let _dismissed = false;

_ext.runtime.sendMessage({ action: "content_ready" });

_ext.runtime.onMessage.addListener((msg) => {
    if (msg.action !== "scan_html") return;
    if (_dismissed) return;

    const host = window.location.hostname.toLowerCase();
    if (aitm_isLegitDomain(host)) return;

    [0, 800, 2500, 5500, 10000].forEach(delay =>
        setTimeout(() => {
            if (_dismissed || _shown) return;
            if (!aitm_isLegitDomain(window.location.hostname.toLowerCase())) {
                _runDetection();
            }
        }, delay)
    );
});

function _runDetection() {
    if (_shown) return;
    const result = aitm_getScore();
    console.info("[AitM Block] score=%d/%d breakdown=%o",
        result.score, result.threshold, result.breakdown);
    if (result.score >= result.threshold) {
        _shown = true;
        _showWarning(result);
    }
}

function _showWarning(result) {
    document.getElementById("__aitm_overlay__")?.remove();

    const confidence = Math.min(Math.round((result.score / 20) * 100), 99);

    // Signal labels for the details section
    const SIGNAL_LABELS = {
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
    };

    // Overlay
    const overlay = el("div", {
        id: "__aitm_overlay__",
        style: css({
            position: "fixed", inset: "0", zIndex: "2147483647",
            background: "rgba(10,10,15,0.92)",
            backdropFilter: "blur(10px)", webkitBackdropFilter: "blur(10px)",
            display: "flex", justifyContent: "center", alignItems: "center",
            padding: "16px", boxSizing: "border-box",
            fontFamily: "'Inter','Segoe UI',system-ui,Arial,sans-serif",
        }),
    });

    // Modal card
    const modal = el("div", {
        style: css({
            width: "580px", maxWidth: "96vw",
            background: "#12121A",
            border: "1px solid rgba(230,57,70,0.6)",
            boxShadow: "0 0 0 1px rgba(230,57,70,0.15), 0 32px 64px rgba(0,0,0,0.7)",
            color: "#F0F0F0",
            overflow: "hidden",
            position: "relative",
        }),
    });

    // Top accent bar
    modal.appendChild(el("div", {
        style: css({ height: "3px", background: "#E63946", width: "100%" }),
    }));

    // Header
    const header = el("div", {
        style: css({
            padding: "22px 24px 18px",
            borderBottom: "1px solid #1A1A2E",
        }),
    });
    header.appendChild(el("div", {
        style: css({
            display: "inline-block",
            background: "rgba(230,57,70,0.12)",
            border: "1px solid #E63946",
            color: "#E63946",
            fontSize: "11px", fontWeight: "700",
            letterSpacing: "0.12em",
            padding: "3px 10px",
            marginBottom: "14px",
            textTransform: "uppercase",
        }),
        text: "CRITICAL — PHISHING DETECTED",
    }));
    header.appendChild(el("div", {
        style: css({
            fontSize: "22px", fontWeight: "700", color: "#F0F0F0",
            lineHeight: "1.2", letterSpacing: "-0.02em", marginBottom: "6px",
        }),
        text: "AitM Phishing Attack Detected",
    }));
    header.appendChild(el("div", {
        style: css({
            fontSize: "12px", color: "#00B4D8",
            fontWeight: "500", letterSpacing: "0.08em", textTransform: "uppercase",
        }),
        text: `whennotif• AitM Block  ·  Detection confidence: ${confidence}%`,
    }));
    modal.appendChild(header);

    // Body
    const body = el("div", {
        style: css({
            padding: "20px 24px",
            fontSize: "14px", lineHeight: "1.7", color: "#F0F0F0",
            borderBottom: "1px solid #1A1A2E",
        }),
    });
    const warning = el("div", {
        style: css({
            padding: "12px 16px", marginBottom: "16px",
            background: "rgba(230,57,70,0.08)",
            borderLeft: "3px solid #E63946",
            fontSize: "14px",
        }),
    });
    warning.innerHTML = "<strong>Do not enter your credentials on this page.</strong>";
    body.appendChild(warning);

    const desc = el("p", {
        style: css({ margin: "0 0 12px" }),
    });
    desc.innerHTML =
        "This page is imitating a <strong>Microsoft 365 / Azure AD login</strong> but is " +
        "hosted on an unverified domain. This is a classic " +
        "<strong>Adversary-in-the-Middle (AitM)</strong> phishing attack that " +
        "steals credentials <em>and</em> session tokens — bypassing MFA entirely.";
    body.appendChild(desc);

    body.appendChild(el("p", {
        style: css({
            margin: "0", fontSize: "12px", color: "#9ca3af",
            fontFamily: "'JetBrains Mono','Courier New',monospace",
        }),
        text: `Suspicious domain: ${window.location.hostname}`,
    }));
    modal.appendChild(body);

    // Collapsible signal details
    const details = document.createElement("details");
    Object.assign(details.style, {
        borderBottom: "1px solid #1A1A2E",
        fontSize: "12px",
    });
    const summary = el("div", {
        style: css({
            padding: "10px 24px",
            cursor: "pointer",
            color: "#6b7280",
            fontWeight: "500",
            userSelect: "none",
            display: "flex", alignItems: "center", gap: "8px",
        }),
    });
    summary.innerHTML =
        `<span style="color:#00B4D8;font-family:monospace">▶</span>` +
        `Detection signals &nbsp;<span style="color:#374151">(${Object.keys(result.breakdown).length} active, ` +
        `score ${result.score}/${result.threshold})</span>`;
    details.appendChild(summary);

    const detailBody = el("div", {
        style: css({ padding: "4px 24px 16px", background: "#0A0A0F" }),
    });
    for (const [key, pts] of Object.entries(result.breakdown)) {
        const row = el("div", {
            style: css({
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "5px 8px", marginBottom: "2px", background: "#12121A",
            }),
        });
        row.innerHTML =
            `<span style="color:#d1d5db">${SIGNAL_LABELS[key] || key}</span>` +
            `<span style="color:#E63946;font-weight:700;font-family:monospace">+${pts}</span>`;
        detailBody.appendChild(row);
    }
    details.appendChild(detailBody);
    // make summary toggle open/close
    summary.addEventListener("click", () => {
        if (details.open) { details.removeAttribute("open"); } else { details.setAttribute("open", ""); }
    });
    modal.appendChild(details);

    // Footer
    const footer = el("div", {
        style: css({
            padding: "16px 24px",
            display: "flex", justifyContent: "space-between", alignItems: "center",
            background: "#0A0A0F",
        }),
    });

    const learnMore = document.createElement("a");
    learnMore.href = "https://whennotif.io/aitm-phishing";
    learnMore.target = "_blank";
    learnMore.rel = "noopener noreferrer";
    Object.assign(learnMore.style, css({
        padding: "10px 20px",
        background: "#E63946",
        color: "#ffffff",
        textDecoration: "none",
        fontSize: "13px", fontWeight: "700",
        letterSpacing: "0.06em", textTransform: "uppercase",
        display: "inline-block",
    }));
    learnMore.textContent = "What is AitM?";
    footer.appendChild(learnMore);

    const right = el("div", {
        style: css({ display: "flex", alignItems: "center", gap: "10px" }),
    });
    const timer = el("span", {
        style: css({ fontSize: "12px", color: "#4b5563", fontFamily: "monospace" }),
        text: "(30s)",
    });
    const dismissBtn = el("button", {
        style: css({
            padding: "10px 20px",
            background: "transparent",
            border: "1px solid #374151",
            color: "#4b5563", fontSize: "13px", fontWeight: "600",
            cursor: "not-allowed", letterSpacing: "0.04em",
        }),
        text: "Dismiss",
    });
    dismissBtn.disabled = true;

    let secs = 30;
    const countdown = setInterval(() => {
        secs--;
        if (secs <= 0) {
            clearInterval(countdown);
            timer.textContent = "";
            dismissBtn.disabled = false;
            dismissBtn.style.cursor = "pointer";
            dismissBtn.style.color = "#9ca3af";
            dismissBtn.style.borderColor = "#4b5563";
        } else {
            timer.textContent = `(${secs}s)`;
        }
    }, 1000);

    dismissBtn.onclick = () => {
        _dismissed = true;
        overlay.remove();
    };

    right.appendChild(timer);
    right.appendChild(dismissBtn);
    footer.appendChild(right);
    modal.appendChild(footer);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
}

// --- Tiny DOM helpers ---

function el(tag, opts = {}) {
    const node = document.createElement(tag);
    if (opts.style) Object.assign(node.style, opts.style);
    if (opts.text)  node.textContent = opts.text;
    if (opts.id)    node.id = opts.id;
    return node;
}

function css(obj) { return obj; }
