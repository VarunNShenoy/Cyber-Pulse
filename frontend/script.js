
/* =========================================
   CYBER PULSE - MAIN JAVASCRIPT
========================================= */

"use strict";

const PAGE_SIZE = 24;
const MAX_TOPIC_CHIPS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;
const SVG_NS = "http://www.w3.org/2000/svg";

const RANGES = {
    "24h": { label: "Last 24 Hours", ms: DAY_MS },
    "7d":  { label: "Last 7 Days", ms: 7 * DAY_MS },
    "30d": { label: "Last 30 Days", ms: 30 * DAY_MS },
    "all": { label: "All Collected", ms: Infinity }
};

const DEFAULT_RANGE = "7d";

const CATEGORY_CONFIG = {
    "Vulnerabilities":  { color: "#ff526d", desc: "Security flaws and CVEs" },
    "Ransomware":       { color: "#ff8148", desc: "Ransomware incidents" },
    "Data Breaches":    { color: "#c16bdf", desc: "Exposed information" },
    "Malware":          { color: "#e9bd42", desc: "Malicious software" },
    "Threat Actors":    { color: "#3daddb", desc: "Attacker activity" },
    "Security Updates": { color: "#49c878", desc: "Patches and advisories" },
    "Other":            { color: "#8294ad", desc: "Other cyber developments" }
};

const FALLBACK_STYLE = {
    color: "#8294ad",
    desc: "Other cyber developments"
};

const SPECIAL_HEADINGS = {
    All: "Latest Cybersecurity News",
    Vulnerabilities: "Vulnerability News",
    Ransomware: "Ransomware News",
    "Data Breaches": "Data Breach News",
    Malware: "Malware News",
    "Threat Actors": "Threat Actor News",
    "Security Updates": "Security Updates",
    Other: "Other Cybersecurity News"
};

let allArticles = [];
let scope = [];
let categoryList = [];

const state = {
    category: "All",
    source: "All",
    confidence: "All",
    tag: null,
    search: "",
    sort: "newest",
    range: DEFAULT_RANGE,
    visible: PAGE_SIZE
};


/* =========================================
   SMALL HELPERS
========================================= */

function el(tag, className, text) {
    const node = document.createElement(tag);

    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;

    return node;
}

function svgEl(tag, attrs) {
    const node = document.createElementNS(SVG_NS, tag);

    Object.entries(attrs || {}).forEach(([key, value]) => {
        node.setAttribute(key, value);
    });

    return node;
}

function $(id) {
    return document.getElementById(id);
}

function styleOf(category) {
    return CATEGORY_CONFIG[category] || FALLBACK_STYLE;
}

function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

function applyAccent(node, category) {
    const color = styleOf(category).color;

    node.style.setProperty("--accent", color);
    node.style.setProperty("--accent-rgb", hexToRgb(color));
}

function safeUrl(value) {
    try {
        const url = new URL(value);

        return (url.protocol === "https:" || url.protocol === "http:")
            ? url.href
            : null;

    } catch (error) {
        return null;
    }
}

function timeAgo(ms) {
    if (!Number.isFinite(ms)) return "Date unavailable";

    const seconds = Math.max(0, (Date.now() - ms) / 1000);

    if (seconds < 3600) {
        return `${Math.max(1, Math.round(seconds / 60))}m ago`;
    }

    if (seconds < 86400) {
        return `${Math.round(seconds / 3600)}h ago`;
    }

    if (seconds < 86400 * 7) {
        return `${Math.round(seconds / 86400)}d ago`;
    }

    return new Date(ms).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric"
    });
}

function dayKey(ms) {
    const d = new Date(ms);
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function severityOf(score) {
    if (score >= 9) return "critical";
    if (score >= 7) return "high";
    if (score >= 4) return "medium";
    return "low";
}

function slugCount(map, key) {
    map[key] = (map[key] || 0) + 1;
}


/* =========================================
   PREPARE ARTICLE DATA
========================================= */

function prepareArticle(raw) {

    const title = raw.title || "";
    const summary = raw.summary || "";
    const text = `${title} ${summary}`;

    const cves = [...new Set(
        (text.match(/CVE-\d{4}-\d{3,}/gi) || [])
            .map(id => id.toUpperCase())
    )];

    const cvssMatch = text.match(/CVSS[^0-9]{0,40}(\d{1,2}(?:\.\d)?)/i);
    const cvssValue = cvssMatch ? parseFloat(cvssMatch[1]) : null;

    const tags = Array.isArray(raw.tags) ? raw.tags : [];

    const secondary = Array.isArray(raw.secondary_categories)
        ? raw.secondary_categories
        : [];

    const time = new Date(raw.published).getTime();

    return {
        ...raw,

        category: raw.category || "Other",
        tags,
        secondary,

        confidence: raw.confidence
            ? String(raw.confidence).toLowerCase()
            : null,

        _time: time,
        _cves: cves,

        _cvss: (
            cvssValue !== null && cvssValue <= 10
        ) ? cvssValue : null,

        _search: [
            title,
            summary,
            raw.source,
            raw.category,
            ...tags,
            ...secondary
        ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
    };
}


/* =========================================
   LOAD ARTICLES
========================================= */

async function loadArticles() {

    try {

        const isGitHubPages =
            window.location.hostname === "varunnshenoy.github.io";

        const feedPath = isGitHubPages
            ? "/Cyber-Pulse/feeds.json"
            : "../feeds.json";

        const response = await fetch(feedPath);

        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status}`);
        }

        const data = await response.json();

        if (!Array.isArray(data)) {
            throw new Error("Invalid feeds.json format.");
        }

        allArticles = data.map(prepareArticle);

        console.log("Articles loaded:", allArticles.length);

        initializeDashboard();

    } catch (error) {

        console.error("Error loading articles:", error);

        const container = $("articleContainer");

        if (container) {
            container.replaceChildren(
                el(
                    "p",
                    "no-articles",
                    "Unable to load cybersecurity news. Please try again later."
                )
            );
        }
    }
}


/* =========================================
   TIME RANGE AND DERIVED DATA
========================================= */

function computeScope() {

    const now = Date.now();
    const limit = RANGES[state.range].ms;

    scope = allArticles.filter(article => {

        if (state.range === "all") return true;

        return article._time >= now - limit &&
            article._time <= now + 36e5;
    });
}

function buildCategoryList() {

    const present = new Set(allArticles.map(a => a.category));

    const known = Object.keys(CATEGORY_CONFIG)
        .filter(c => c !== "Other");

    const extra = [...present]
        .filter(c => !CATEGORY_CONFIG[c]);

    categoryList = [...known, ...extra, "Other"];
}

function countBy(key) {

    const counts = {};

    scope.forEach(article => {
        slugCount(counts, article[key]);
    });

    return counts;
}

function getLast24HoursCount() {

    const now = Date.now();

    return allArticles.filter(article =>
        article._time >= now - DAY_MS &&
        article._time <= now + 36e5
    ).length;
}


/* =========================================
   STATISTICS CARDS
========================================= */

function makeStatCard(category, label, desc, count, total) {

    const card = el("button", "stat-card");

    card.type = "button";
    card.dataset.category = category;

    if (category === "All") {

        card.style.setProperty("--accent", "#62d8ff");
        card.style.setProperty("--accent-rgb", "98, 216, 255");

    } else if (category === "New24Hours") {

        card.style.setProperty("--accent", "#44f0cf");
        card.style.setProperty("--accent-rgb", "68, 240, 207");

    } else {

        applyAccent(card, category);
    }

    if (count === 0) card.classList.add("is-empty");

    const bar = el("div", "stat-bar");
    const fill = el("i");

    fill.style.width = total
        ? `${Math.min(100, Math.round((count / total) * 100))}%`
        : "0%";

    bar.appendChild(fill);

    card.append(
        el("span", "stat-label", label),
        el("span", "stat-count", String(count)),
        el("span", "stat-desc", desc),
        bar
    );

    return card;
}

function renderStats() {

    const grid = $("statsGrid");
    const counts = countBy("category");
    const total = scope.length;

    grid.replaceChildren(

        makeStatCard(
            "All",
            "Total Articles",
            RANGES[state.range].label,
            total,
            total
        ),

        makeStatCard(
            "New24Hours",
            "Last 24 Hours",
            "Click to view only these",
            getLast24HoursCount(),
            allArticles.length
        ),

        ...categoryList.map(category =>
            makeStatCard(
                category,
                category,
                styleOf(category).desc,
                counts[category] || 0,
                total
            )
        )
    );
}


/* =========================================
   DONUT CHART
========================================= */

function renderDonut() {

    const counts = countBy("category");
    const total = scope.length;

    const radius = 48;
    const circumference = 2 * Math.PI * radius;

    const donut = $("donut");
    const legend = $("donutLegend");

    const svg = svgEl("svg", {
        viewBox: "0 0 120 120"
    });

    svg.appendChild(svgEl("circle", {
        cx: 60,
        cy: 60,
        r: radius,
        fill: "none",
        stroke: "rgba(255,255,255,0.06)",
        "stroke-width": 15
    }));

    let offset = 0;

    const legendItems = [];

    categoryList.forEach(category => {

        const count = counts[category] || 0;

        if (!count) return;

        const length = (count / total) * circumference;
        const gap = count === total ? 0 : 1.5;

        const slice = svgEl("circle", {
            class: "slice",
            cx: 60,
            cy: 60,
            r: radius,
            stroke: styleOf(category).color,
            "stroke-dasharray": `${Math.max(length - gap, 0.5)} ${circumference}`,
            "stroke-dashoffset": -offset
        });

        slice.dataset.category = category;

        const tip = svgEl("title");
        tip.textContent = `${category}: ${count}`;

        slice.appendChild(tip);
        svg.appendChild(slice);

        offset += length;

        const item = el("li");
        const button = el("button");

        button.type = "button";
        button.dataset.category = category;

        applyAccent(button, category);

        button.append(
            el("span", "dot"),
            el("span", "", category),
            el("span", "n", String(count)),
            el(
                "span",
                "pct",
                count / total < 0.005
                    ? "<1%"
                    : `${Math.round((count / total) * 100)}%`
            )
        );

        item.appendChild(button);
        legendItems.push(item);
    });

    const center = el("div", "donut-center");

    center.append(
        el("strong", "", String(total)),
        el("span", "", "articles")
    );

    donut.replaceChildren(svg, center);

    if (!legendItems.length) {

        const empty = el("li");

        empty.appendChild(
            el("span", "panel-empty", "No articles in this range.")
        );

        legendItems.push(empty);
    }

    legend.replaceChildren(...legendItems);
}


/* =========================================
   TIMELINE CHART
========================================= */

function renderTimeline() {

    const container = $("timeline");

    const times = scope
        .map(article => article._time)
        .filter(Number.isFinite);

    if (!times.length) {

        container.className = "timeline";

        container.replaceChildren(
            el("p", "no-articles", "No dated articles in this range.")
        );

        return;
    }

    const newest = Math.max(...times);
    const oldest = Math.min(...times);

    const spanDays = Math.round((newest - oldest) / DAY_MS) + 1;

    let dayCount = 7;

    if (state.range === "30d") {

        dayCount = 30;

    } else if (state.range === "all") {

        dayCount = Math.min(30, Math.max(7, spanDays));
    }

    const dense = dayCount > 10;

    container.className = dense
        ? "timeline dense"
        : "timeline";

    const anchor = new Date(newest);

    anchor.setHours(12, 0, 0, 0);

    const days = [];

    for (let i = dayCount - 1; i >= 0; i--) {

        const d = new Date(anchor);

        d.setDate(d.getDate() - i);

        days.push({
            key: dayKey(d.getTime()),
            date: d,
            counts: {},
            total: 0
        });
    }

    const byKey = Object.fromEntries(
        days.map(day => [day.key, day])
    );

    scope.forEach(article => {

        if (!Number.isFinite(article._time)) return;

        const day = byKey[dayKey(article._time)];

        if (!day) return;

        slugCount(day.counts, article.category);
        day.total++;
    });

    const max = Math.max(
        1,
        ...days.map(day => day.total)
    );

    const columns = days.map((day, index) => {

        const col = el("div", "tl-col");

        if (!day.total) {
            col.classList.add("tl-empty");
        }

        const dateText = day.date.toLocaleDateString(
            undefined,
            {
                month: "short",
                day: "numeric"
            }
        );

        col.title = `${dateText}: ${day.total} ${
            day.total === 1 ? "article" : "articles"
        }`;

        const bar = el("div", "tl-bar");

        categoryList.forEach(category => {

            const count = day.counts[category];

            if (!count) return;

            const segment = el("div", "tl-seg");

            applyAccent(segment, category);

            segment.style.height = `${(count / max) * 100}%`;
            segment.title = `${category}: ${count}`;

            bar.appendChild(segment);
        });

        const showLabel = !dense ||
            (dayCount - 1 - index) % 5 === 0;

        col.append(
            el("span", "tl-total", String(day.total)),
            bar,
            el("span", "tl-label", showLabel ? dateText : "")
        );

        return col;
    });

    container.replaceChildren(...columns);
}


/* =========================================
   TOOLBAR, TOPICS AND HEADER INFO
========================================= */

function populateSources() {

    const sourceCounts = countBy("source");

    const sources = Object.keys(sourceCounts)
        .sort((a, b) => sourceCounts[b] - sourceCounts[a]);

    if (
        state.source !== "All" &&
        !sourceCounts[state.source]
    ) {
        state.source = "All";
    }

    const select = $("sourceSelect");

    select.replaceChildren();

    const all = el(
        "option",
        "",
        `All sources (${scope.length})`
    );

    all.value = "All";

    select.appendChild(all);

    sources.forEach(source => {

        const option = el(
            "option",
            "",
            `${source} (${sourceCounts[source]})`
        );

        option.value = source;

        select.appendChild(option);
    });

    select.value = state.source;
}

function populateTopics() {

    const tagCounts = {};

    scope.forEach(article => {
        article.tags.forEach(tag => {
            slugCount(tagCounts, tag);
        });
    });

    const ranked = Object.keys(tagCounts)
        .sort((a, b) =>
            tagCounts[b] - tagCounts[a] ||
            a.localeCompare(b)
        );

    const tags = ranked.slice(0, MAX_TOPIC_CHIPS);

    if (state.tag && !tags.includes(state.tag)) {
        tags.push(state.tag);
    }

    $("topicSection").hidden = tags.length === 0;

    $("topicChips").replaceChildren(
        ...tags.map(tag => {

            const button = el("button", "topic-btn");

            button.type = "button";
            button.dataset.tag = tag;

            button.append(
                tag + " ",
                el("b", "", String(tagCounts[tag] || 0))
            );

            return button;
        })
    );
}

function populateStaticControls() {

    $("confidenceWrap").hidden =
        !allArticles.some(article => article.confidence);
}

function renderHeaderInfo() {

    const sources = new Set(
        allArticles.map(article => article.source)
    ).size;

    $("feedStatus").textContent =
        `RSS Feed Monitor · ${sources} sources`;

    $("dateRange").textContent = RANGES[state.range].label;

    const times = scope
        .map(article => article._time)
        .filter(Number.isFinite);

    const allTimes = allArticles
        .map(article => article._time)
        .filter(Number.isFinite);

    if (!allTimes.length) {

        $("lastUpdated").textContent = "";

        return;
    }

    const fmt = {
        month: "short",
        day: "numeric"
    };

    const newestAll = Math.max(...allTimes);

    if (times.length) {

        const first = new Date(Math.min(...times));
        const last = new Date(Math.max(...times));

        $("lastUpdated").textContent =
            `${first.toLocaleDateString(undefined, fmt)} – ` +
            `${last.toLocaleDateString(undefined, fmt)} · newest ${timeAgo(newestAll)}`;

    } else {

        $("lastUpdated").textContent =
            `Newest article ${timeAgo(newestAll)}`;
    }
}

function renderAll() {

    computeScope();

    renderHeaderInfo();
    renderStats();
    renderDonut();
    renderTimeline();

    populateSources();
    populateTopics();
}


/* =========================================
   FILTERING AND SORTING
========================================= */

function getFilteredArticles() {

    const list = scope.filter(article => {

        // Category filtering uses the primary category only.
        if (
            state.category !== "All" &&
            article.category !== state.category
        ) {
            return false;
        }

        if (
            state.source !== "All" &&
            article.source !== state.source
        ) {
            return false;
        }

        if (
            state.confidence !== "All" &&
            article.confidence !== state.confidence
        ) {
            return false;
        }

        if (
            state.tag &&
            !article.tags.includes(state.tag)
        ) {
            return false;
        }

        if (
            state.search &&
            !article._search.includes(state.search)
        ) {
            return false;
        }

        return true;
    });

    const time = article =>
        Number.isFinite(article._time)
            ? article._time
            : 0;

    if (state.sort === "oldest") {

        list.sort((a, b) => time(a) - time(b));

    } else if (state.sort === "severity") {

        list.sort((a, b) =>
            (b._cvss ?? -1) - (a._cvss ?? -1) ||
            time(b) - time(a)
        );

    } else {

        list.sort((a, b) => time(b) - time(a));
    }

    return list;
}

function hasActiveFilters() {

    return state.category !== "All" ||
        state.source !== "All" ||
        state.confidence !== "All" ||
        state.tag !== null ||
        state.search !== "";
}

function resetFilters() {

    state.category = "All";
    state.source = "All";
    state.confidence = "All";
    state.tag = null;
    state.search = "";

    $("searchInput").value = "";
    $("sourceSelect").value = "All";
    $("confidenceSelect").value = "All";

    populateTopics();

    refresh();
}

function setRange(range) {

    state.range = range;

    $("rangeSelect").value = range;

    renderAll();
    refresh();
}


/* =========================================
   ARTICLE CARD
========================================= */

function createCard(article) {

    const card = el("article", "article-card");

    applyAccent(card, article.category);

    // Top row: primary category, secondary badges and confidence.
    const top = el("div", "card-top");

    top.appendChild(
        el("span", "article-category", article.category)
    );

    // Secondary categories remain visible as informational badges.
    article.secondary.forEach(category => {

        const badge = el(
            "span",
            "badge-secondary",
            category
        );

        badge.title = "Also relevant to this category";

        applyAccent(badge, category);

        top.appendChild(badge);
    });

    if (article.confidence) {

        const confidence = el(
            "span",
            `confidence ${article.confidence}`
        );

        confidence.title =
            "How confident the categorizer is";

        confidence.append(
            el("i"),
            `${article.confidence} confidence`
        );

        top.appendChild(confidence);
    }

    // Title
    const title = el("h3", "article-title");

    const url = safeUrl(article.url);

    if (url) {

        const link = el(
            "a",
            "",
            article.title || "Untitled Article"
        );

        link.href = url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";

        title.appendChild(link);

    } else {

        title.textContent =
            article.title || "Untitled Article";
    }

    // Summary
    const summaryText =
        article.summary || "No summary available.";

    const summary = el(
        "p",
        "article-summary",
        summaryText
    );

    const parts = [
        top,
        title,
        summary
    ];

    // Summary expand toggle
    const toggle = el(
        "button",
        "toggle-summary",
        "Show more"
    );

    toggle.type = "button";
    toggle.hidden = true;

    toggle.addEventListener("click", () => {

        const open = summary.classList.toggle("expanded");

        toggle.textContent =
            open ? "Show less" : "Show more";
    });

    parts.push(toggle);

    // Severity, CVEs and topic tags
    const chips = el("div", "chip-row");

    if (article._cvss !== null) {

        const level = severityOf(article._cvss);

        chips.appendChild(
            el(
                "span",
                `chip sev ${level}`,
                `CVSS ${article._cvss.toFixed(1)} · ${level}`
            )
        );
    }

    article._cves.slice(0, 2).forEach(id => {

        chips.appendChild(
            el("span", "chip cve", id)
        );
    });

    if (article._cves.length > 2) {

        const more = el(
            "span",
            "chip cve",
            `+${article._cves.length - 2} CVEs`
        );

        more.title = article._cves.slice(2).join(", ");

        chips.appendChild(more);
    }

    article.tags.forEach(tag => {

        chips.appendChild(
            el("span", "chip tag", tag)
        );
    });

    if (chips.children.length) {
        parts.push(chips);
    }

    // Category explanation
    const explanation = el(
        "details",
        "category-explanation"
    );

    explanation.append(
        el("summary", "", "Why this category?"),
        el(
            "p",
            "",
            article.category_reason ||
                "No classification explanation available."
        )
    );

    parts.push(explanation);

    // Metadata
    const meta = el("div", "article-meta");

    const date = new Date(article._time);

    const when = el(
        "span",
        "",
        timeAgo(article._time)
    );

    if (!Number.isNaN(date.getTime())) {
        when.title = date.toLocaleString();
    }

    meta.append(
        el(
            "span",
            "source",
            article.source || "Unknown Source"
        ),
        el("span", "sep", "•"),
        when
    );

    parts.push(meta);

    // Full article link
    if (url) {

        const link = el(
            "a",
            "article-link",
            "Read Full Article →"
        );

        link.href = url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";

        parts.push(link);
    }

    card.append(...parts);

    return card;
}


/* =========================================
   RENDER ARTICLE LIST
========================================= */

function revealSummaryToggles(container) {

    container.querySelectorAll(".article-card")
        .forEach(card => {

            const summary =
                card.querySelector(".article-summary");

            const toggle =
                card.querySelector(".toggle-summary");

            if (summary && toggle) {

                toggle.hidden =
                    summary.scrollHeight <=
                    summary.clientHeight + 1;
            }
        });
}

function renderArticles() {

    const container = $("articleContainer");

    const filtered = getFilteredArticles();

    const shown = filtered.slice(0, state.visible);

    const rangeLabel = RANGES[state.range].label;

    $("articleCount").textContent =
        filtered.length === scope.length
            ? `${filtered.length} ${
                filtered.length === 1 ? "article" : "articles"
              } · ${rangeLabel}`
            : `${filtered.length} of ${scope.length} articles · ${rangeLabel}`;

    const heading =
        SPECIAL_HEADINGS[state.category] ||
        (
            state.category === "All"
                ? "Latest Cybersecurity News"
                : `${state.category} News`
        );

    $("newsHeading").textContent = heading;

    if (!filtered.length) {

        const message = el("div", "no-articles");

        if (
            !scope.length &&
            state.range !== "all"
        ) {

            message.append(
                `No articles were published in this range (${rangeLabel}).`
            );

            const showAll = el(
                "button",
                "clear-btn",
                "Show all collected"
            );

            showAll.type = "button";

            showAll.addEventListener("click", () => {
                setRange("all");
            });

            message.append(
                el("br"),
                showAll
            );

        } else {

            message.append(
                "No articles match these filters."
            );

            if (hasActiveFilters()) {

                const clear = el(
                    "button",
                    "clear-btn",
                    "Clear filters"
                );

                clear.type = "button";

                clear.addEventListener(
                    "click",
                    resetFilters
                );

                message.append(
                    el("br"),
                    clear
                );
            }
        }

        container.replaceChildren(message);

    } else {

        container.replaceChildren(
            ...shown.map(createCard)
        );

        revealSummaryToggles(container);
    }

    const remaining = filtered.length - shown.length;

    const loadMore = $("loadMore");

    loadMore.hidden = remaining <= 0;

    loadMore.textContent =
        `Show ${Math.min(PAGE_SIZE, remaining)} more (${remaining} remaining)`;

    $("clearFilters").hidden = !hasActiveFilters();
}

function updateActiveStates() {

    document.querySelectorAll(".stat-card")
        .forEach(card => {

            const category = card.dataset.category;

            const active =
                category === "New24Hours"
                    ? state.range === "24h"
                    : category === state.category;

            card.classList.toggle("active", active);

            card.setAttribute(
                "aria-pressed",
                String(active)
            );
        });

    document.querySelectorAll(".legend button")
        .forEach(button => {

            button.classList.toggle(
                "on",
                button.dataset.category === state.category
            );
        });

    const donut = $("donut");

    const activeSlice = state.category !== "All";

    donut.classList.toggle(
        "has-active",
        activeSlice
    );

    donut.querySelectorAll("circle.slice")
        .forEach(slice => {

            slice.classList.toggle(
                "on",
                slice.dataset.category === state.category
            );
        });

    document.querySelectorAll(".topic-btn")
        .forEach(button => {

            button.classList.toggle(
                "active",
                button.dataset.tag === state.tag
            );
        });
}

function refresh() {

    state.visible = PAGE_SIZE;

    updateActiveStates();
    renderArticles();
}


/* =========================================
   EVENTS
========================================= */

function toggleCategory(category) {

    state.category =
        (
            state.category === category &&
            category !== "All"
        )
            ? "All"
            : category;

    refresh();
}

function setupEvents() {

    $("statsGrid").addEventListener(
        "click",
        event => {

            const card = event.target.closest(".stat-card");

            if (!card) return;

            if (card.dataset.category === "New24Hours") {

                setRange(
                    state.range === "24h"
                        ? DEFAULT_RANGE
                        : "24h"
                );

                return;
            }

            toggleCategory(card.dataset.category);
        }
    );

    $("donut").addEventListener(
        "click",
        event => {

            const slice =
                event.target.closest("circle.slice");

            if (slice) {
                toggleCategory(slice.dataset.category);
            }
        }
    );

    $("donutLegend").addEventListener(
        "click",
        event => {

            const button = event.target.closest("button");

            if (button) {
                toggleCategory(button.dataset.category);
            }
        }
    );

    $("topicChips").addEventListener(
        "click",
        event => {

            const button =
                event.target.closest(".topic-btn");

            if (!button) return;

            state.tag =
                state.tag === button.dataset.tag
                    ? null
                    : button.dataset.tag;

            refresh();
        }
    );

    let timer = null;

    $("searchInput").addEventListener(
        "input",
        event => {

            clearTimeout(timer);

            timer = setTimeout(() => {

                state.search =
                    event.target.value
                        .toLowerCase()
                        .trim();

                refresh();

            }, 150);
        }
    );

    $("rangeSelect").addEventListener(
        "change",
        event => {
            setRange(event.target.value);
        }
    );

    $("sourceSelect").addEventListener(
        "change",
        event => {

            state.source = event.target.value;

            refresh();
        }
    );

    $("confidenceSelect").addEventListener(
        "change",
        event => {

            state.confidence = event.target.value;

            refresh();
        }
    );

    $("sortSelect").addEventListener(
        "change",
        event => {

            state.sort = event.target.value;

            refresh();
        }
    );

    $("clearFilters").addEventListener(
        "click",
        resetFilters
    );

    $("loadMore").addEventListener(
        "click",
        () => {

            state.visible += PAGE_SIZE;

            renderArticles();
        }
    );

    // Press "/" to jump to search.
    document.addEventListener(
        "keydown",
        event => {

            const typing =
                /^(INPUT|SELECT|TEXTAREA)$/.test(
                    document.activeElement.tagName
                );

            if (event.key === "/" && !typing) {

                event.preventDefault();

                $("searchInput").focus();
            }
        }
    );
}


/* =========================================
   INITIALIZE DASHBOARD
========================================= */

function initializeDashboard() {

    buildCategoryList();

    populateStaticControls();

    setupEvents();

    $("rangeSelect").value = state.range;

    renderAll();

    refresh();
}


/* =========================================
   START APPLICATION
========================================= */

document.addEventListener(
    "DOMContentLoaded",
    loadArticles
);
