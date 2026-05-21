// AitM Block – Shared Detection Engine
// Detects pages that mimic Microsoft 365 / Azure login.
// All functions are prefixed "aitm_" to avoid collisions with page globals.

const MSFT_LEGIT_DOMAINS = [
    "login.microsoftonline.com",
    "login.live.com",
    "login.microsoft.com",
    "login.windows.net",
    "microsoftonline.com",
    "microsoft.com",
    "live.com",
    "office.com",
    "msauth.net",
    "office365.com",
    "office.net",
    "microsoftonline.us",
    "microsoftonline.cn",
    "account.microsoft.com",
    "account.live.com",
    "signup.live.com",
    "login.microsoftonline.us",
    "login.partner.microsoftonline.cn",
    "sts.windows.net",
    "aadcdn.msftauth.net",
    "aadcdn.msauth.net",
];

// Signal weights — sum must exceed DETECT_THRESHOLD to trigger warning.
const DETECT_WEIGHTS = {
    jsGlobals:         4, // $Config / ServerData / inline script markers (MS runtime)
    tenantBranding:    3, // MS tenant branding data (aTenantBranding / TenantId) embedded in page
    pageId:            3, // <meta name="PageID" content="ConvergedSignIn">
    msCdn:             3, // Resources from known MS auth CDNs
    domIds:            3, // ≥2 MS-specific DOM IDs/selectors present
    bodyClass:         2, // body.win10 / body.win7 / body.mac / data-bind on body
    msButtonColor:     2, // Submit button close to Microsoft blue (#0067b8)
    logoHint:          2, // img alt/src/class matching MS branding
    oauthHiddenInputs: 2, // ≥2 hidden inputs with OAuth/MSAL-specific names
    formStructure:     1, // Password or email field present (generic signal)
    titleMatch:        1, // "Sign in" / "Microsoft" in document.title
    buttonText:        1, // Sign-in-like button labels
};

const DETECT_THRESHOLD = 7;

// Returns true if hostname is a known-legitimate Microsoft domain.
function aitm_isLegitDomain(hostname) {
    const h = hostname.toLowerCase();
    return MSFT_LEGIT_DOMAINS.some(d => h === d || h.endsWith("." + d));
}

// Main entry point. Returns { score, breakdown, threshold }.
function aitm_getScore() {
    const breakdown = {};
    let score = 0;

    function add(key, result) {
        const pts = typeof result === "number" ? result : (result ? DETECT_WEIGHTS[key] : 0);
        if (pts > 0) {
            breakdown[key] = pts;
            score += pts;
        }
    }

    add("jsGlobals",         aitm_checkJsGlobals());
    add("tenantBranding",    aitm_checkTenantBranding());
    add("pageId",            aitm_checkPageId());
    add("msCdn",             aitm_checkMsCdn());
    add("domIds",            aitm_checkDomIds());
    add("bodyClass",         aitm_checkBodyClass());
    add("msButtonColor",     aitm_checkButtonColor());
    add("logoHint",          aitm_checkLogoHints());
    add("oauthHiddenInputs", aitm_checkOauthHiddenInputs());
    add("formStructure",     aitm_checkFormStructure());
    add("titleMatch",        aitm_checkTitleMatch());
    add("buttonText",        aitm_checkButtonText());

    return { score, breakdown, threshold: DETECT_THRESHOLD };
}

// --- Individual signal checks ---

function aitm_checkJsGlobals() {
    if (window.$Config || window.ServerData || window.Config?.serverData) {
        return DETECT_WEIGHTS.jsGlobals;
    }
    // Inline script text: require ≥3 distinct MS-specific markers to score.
    const markers = [
        "$Config", "ServerData", "hpgact", "hpgid", "sFT", "sCtx",
        "ConvergedSignIn", "apiCanary", "boilerplateVersion", "fShowPersistentCookiesWarning",
    ];
    let hits = 0;
    for (const script of document.querySelectorAll("script:not([src])")) {
        const text = script.textContent || "";
        for (const m of markers) {
            if (text.includes(m)) hits++;
        }
        if (hits >= 3) return DETECT_WEIGHTS.jsGlobals;
    }
    return 0;
}

// Tenant branding check — the most specific MS-login signal.
// Real MS pages and AitM proxies both embed $Config.aTenantBranding with actual
// tenant data (TenantId GUID, BannerLogo, UserIllustrationUrl, etc.).
// This data is Microsoft-internal and should NEVER appear on a legitimate non-MS domain.
// An AitM proxy copies it verbatim → strong evidence the page is a proxied MS login.
function aitm_checkTenantBranding() {
    // Method 1: live $Config object
    try {
        const tb = window.$Config?.aTenantBranding;
        if (Array.isArray(tb) && tb.length > 0) {
            const first = tb[0];
            if (first && (first.TenantId || first.BannerLogo || first.UserIllustrationUrl)) {
                return true;
            }
        }
        // ServerData variant
        if (window.ServerData?.oTenantBranding?.TenantId) return true;
        if (window.ServerData?.aTenantBranding?.[0]?.TenantId) return true;
    } catch { /* page globals may be access-restricted */ }

    // Method 2: inline script text — require ≥2 tenant-branding-specific keys co-present
    const tbMarkers = [
        '"aTenantBranding"', '"oTenantBranding"',
        '"TenantId"', '"BannerLogo"', '"UserIllustrationUrl"',
        '"TileLogo"', '"BoilerPlateText"', '"TenantDisplayName"',
    ];
    for (const script of document.querySelectorAll("script:not([src])")) {
        const text = script.textContent || "";
        const hits = tbMarkers.filter(m => text.includes(m));
        if (hits.length >= 2) return true;
    }
    return false;
}

function aitm_checkPageId() {
    const meta = document.querySelector('meta[name="PageID"]');
    const content = (meta?.getAttribute("content") || "").toLowerCase();
    return content.includes("convergedsignin") || content.includes("kmsi");
}

function aitm_checkMsCdn() {
    const cdns = [
        "aadcdn.msftauth.net",
        "aadcdn.msauth.net",
        "logincdn.msftauth.net",
        "secure.aadcdn.microsoftonline-p.com",
        "aadcdn.msftauthimages.net",
    ];
    for (const el of document.querySelectorAll("link[href], script[src]")) {
        const url = (el.getAttribute("href") || el.getAttribute("src") || "").toLowerCase();
        if (cdns.some(c => url.includes(c))) return true;
    }
    return false;
}

function aitm_checkDomIds() {
    const selectors = [
        "#i0116",                               // email input
        "#i0118",                               // password input
        "#idSIButton9",                         // "Sign in" button
        "#idBtn_Back",                          // back button
        "#KmsiCheckboxField",                   // keep me signed in
        "#lightbox",                            // main MS login container
        "[name='loginfmt']",                    // login format hidden input
        "[data-report-event='Signin_Signin']",  // MS telemetry attribute
        ".login-paginated-page",                // paginated login wrapper
        "#FormsAuthentication",                 // forms auth container
        "#displayName",                         // display name field
        "#idDiv_SAOTCS_Title",                  // verification title div
    ];
    const hits = selectors.filter(s => {
        try { return !!document.querySelector(s); } catch { return false; }
    });
    return hits.length >= 2;
}

function aitm_checkBodyClass() {
    const bodyClass = (document.body?.className || "").toLowerCase();
    const htmlClass = (document.documentElement?.className || "").toLowerCase();
    const combined = bodyClass + " " + htmlClass;
    const msClasses = ["win10", "win7", "win11", " win ", "mac ", " mac", "aad-", "msa-"];
    if (msClasses.some(c => combined.includes(c))) return true;
    // data-bind on body is a strong Knockout.js / MS marker
    const dataBind = (document.body?.getAttribute("data-bind") || "").toLowerCase();
    return dataBind.includes("loginfmt") || dataBind.includes("i0116") || dataBind.includes("i0118");
}

function aitm_checkButtonColor() {
    const msBlue = { r: 0x00, g: 0x67, b: 0xb8 };
    const tolerance = 10;
    for (const btn of document.querySelectorAll(
        'button, input[type="submit"], input[type="button"], [role="button"]'
    )) {
        const bg = getComputedStyle(btn).backgroundColor;
        const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (!m) continue;
        const [r, g, b] = [+m[1], +m[2], +m[3]];
        if (
            Math.abs(r - msBlue.r) <= tolerance &&
            Math.abs(g - msBlue.g) <= tolerance &&
            Math.abs(b - msBlue.b) <= tolerance
        ) {
            return DETECT_WEIGHTS.msButtonColor;
        }
    }
    return 0;
}

function aitm_checkLogoHints() {
    for (const img of document.querySelectorAll("img")) {
        const alt = (img.getAttribute("alt") || "").toLowerCase();
        const src = (img.getAttribute("src") || "").toLowerCase();
        const id  = (img.id || "").toLowerCase();
        const cls = (img.className || "").toLowerCase();
        if (
            alt.includes("microsoft") || alt.includes("organization banner logo") ||
            src.includes("microsoft") || src.includes("aadcdn") || src.includes("logintenantbranding") ||
            id.includes("bannerlogo") || cls.includes("banner-logo") || cls.includes("ext-banner-logo") ||
            cls.includes("tenant-branding") || cls.includes("logo-img")
        ) return true;
    }
    // SVG use/text references
    for (const use of document.querySelectorAll("svg use, svg title")) {
        const href = (use.getAttribute("href") || use.getAttribute("xlink:href") || use.textContent || "").toLowerCase();
        if (href.includes("microsoft")) return true;
    }
    return false;
}

function aitm_checkOauthHiddenInputs() {
    const oauthNames = [
        "ppft", "canary", "ctx", "client_id", "response_type",
        "redirect_uri", "scope", "nonce", "state", "session_state",
        "id_token", "code", "sftag", "correlationid", "flowtoken",
    ];
    let hits = 0;
    for (const input of document.querySelectorAll('input[type="hidden"]')) {
        const name = (input.getAttribute("name") || "").toLowerCase();
        const id   = (input.id || "").toLowerCase();
        if (oauthNames.some(n => name.includes(n) || id.includes(n))) hits++;
    }
    return hits >= 2;
}

function aitm_checkFormStructure() {
    return (
        document.querySelector('input[type="password"]') !== null ||
        document.querySelector('input[type="email"]') !== null ||
        document.querySelector('input[name*="user" i]') !== null ||
        document.querySelector('input[name*="email" i]') !== null
    );
}

function aitm_checkTitleMatch() {
    const title = document.title.toLowerCase();
    return (
        title.includes("sign in") ||
        title.includes("microsoft") ||
        title.includes("anmelden") ||
        title.includes("log in to your account") ||
        title.includes("azure active directory") ||
        title.includes("microsoft 365")
    );
}

function aitm_checkButtonText() {
    const patterns = [
        "sign in", "signin", "anmelden", "next", "weiter",
        "continue", "log in", "einloggen", "verify", "bestätigen",
    ];
    for (const btn of document.querySelectorAll(
        'button, input[type="submit"], input[type="button"], [role="button"]'
    )) {
        const text = (
            btn.innerText || btn.value ||
            btn.getAttribute("aria-label") || ""
        ).toLowerCase();
        if (patterns.some(p => text.includes(p))) return true;
    }
    return false;
}
