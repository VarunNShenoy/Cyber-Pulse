
/* =========================================
   CYBER PULSE - MAIN JAVASCRIPT
========================================= */

let allArticles = [];
let selectedCategory = "All";

const categoryCountElements = {
    All: "totalArticles",
    New24Hours: "recentCount",
    Vulnerabilities: "vulnerabilityCount",
    Ransomware: "ransomwareCount",
    "Data Breaches": "breachCount",
    Malware: "malwareCount",
    "Threat Actors": "threatActorCount",
    "Security Updates": "securityUpdateCount",
    Other: "otherCount"
};

const categoryHeadings = {
    All: "Latest Cybersecurity News",
    New24Hours: "Cybersecurity News - Last 24 Hours",
    Vulnerabilities: "Vulnerability News",
    Ransomware: "Ransomware News",
    "Data Breaches": "Data Breach News",
    Malware: "Malware News",
    "Threat Actors": "Threat Actor News",
    "Security Updates": "Security Updates",
    Other: "Other Cybersecurity News"
};


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

        allArticles = await response.json();

        if (!Array.isArray(allArticles)) {
            throw new Error("Invalid feeds.json format.");
        }

        console.log("Articles loaded:", allArticles.length);

        initializeDashboard();

    } catch (error) {

        console.error("Error loading articles:", error);

        const container = document.getElementById("articleContainer");

        if (container) {

            container.replaceChildren();

            const message = document.createElement("p");

            message.className = "no-articles";

            message.textContent =
                "Unable to load cybersecurity news. Please try again later.";

            container.appendChild(message);
        }

    }

}


/* =========================================
   DATE HANDLING
========================================= */

function getLast24HoursArticles() {

    const now = Date.now();

    const cutoff = now - (24 * 60 * 60 * 1000);

    return allArticles.filter(article => {

        const published = new Date(article.published).getTime();

        return (
            Number.isFinite(published) &&
            published >= cutoff &&
            published <= now
        );

    });

}


/* =========================================
   UPDATE ALL STATISTICS CARDS
========================================= */

function updateStatistics() {

    const counts = {
        All: allArticles.length,
        New24Hours: getLast24HoursArticles().length,
        Vulnerabilities: 0,
        Ransomware: 0,
        "Data Breaches": 0,
        Malware: 0,
        "Threat Actors": 0,
        "Security Updates": 0,
        Other: 0
    };

    allArticles.forEach(article => {

        const category = article.category;

        if (
            Object.prototype.hasOwnProperty.call(counts, category) &&
            category !== "All" &&
            category !== "New24Hours"
        ) {

            counts[category]++;

        }

    });

    Object.entries(categoryCountElements).forEach(([category, elementId]) => {

        const element = document.getElementById(elementId);

        if (element) {
            element.textContent = counts[category];
        }

    });

}


/* =========================================
   ARTICLE COUNT
========================================= */

function updateArticleCount(count) {

    const element = document.getElementById("articleCount");

    if (!element) return;

    element.textContent =
        `${count} ${count === 1 ? "article" : "articles"}`;

}


/* =========================================
   UPDATE ACTIVE FILTER
========================================= */

function updateActiveCategory() {

    document.querySelectorAll(".category-btn").forEach(button => {

        button.classList.toggle(
            "active",
            button.dataset.category === selectedCategory
        );

    });

    document.querySelectorAll(".stat-card").forEach(card => {

        card.classList.toggle(
            "active",
            card.dataset.category === selectedCategory
        );

    });

    const heading = document.getElementById("newsHeading");

    if (heading) {

        heading.textContent =
            categoryHeadings[selectedCategory] || "Cybersecurity News";

    }

}


/* =========================================
   DISPLAY ARTICLES
========================================= */

function displayArticles(articles) {

    const container = document.getElementById("articleContainer");

    if (!container) return;

    container.replaceChildren();

    updateArticleCount(articles.length);

    if (articles.length === 0) {

        const message = document.createElement("p");

        message.className = "no-articles";

        message.textContent =
            "No articles found in this category. Try another filter or search term.";

        container.appendChild(message);

        return;

    }

    articles.forEach(article => {

        const card = document.createElement("div");

        card.className = "article-card";


        // Category

        const category = document.createElement("span");

        category.className = "article-category";

        category.textContent = article.category || "Other";


        // Title

        const title = document.createElement("h3");

        title.className = "article-title";

        title.textContent = article.title || "Untitled Article";


        // Summary

        const summary = document.createElement("p");

        summary.className = "article-summary";

        summary.textContent =
            article.summary || "No summary available.";


        // Metadata

        const metadata = document.createElement("div");

        metadata.className = "article-meta";

        const source = document.createElement("span");

        source.textContent = article.source || "Unknown Source";

        const published = document.createElement("span");

        const date = new Date(article.published);

        published.textContent = Number.isNaN(date.getTime())
            ? "Date unavailable"
            : date.toLocaleDateString();

        metadata.append(source, published);


        // Category explanation

        const explanation = document.createElement("details");

        explanation.className = "category-explanation";

        const explanationHeading = document.createElement("summary");

        explanationHeading.textContent = "Why this category?";

        const explanationText = document.createElement("p");

        explanationText.textContent =
            article.category_reason ||
            "No classification explanation available.";

        explanation.append(
            explanationHeading,
            explanationText
        );


        // Article link

        const link = document.createElement("a");

        link.className = "article-link";

        let articleURL = null;

        try {

            const url = new URL(article.url);

            if (url.protocol === "https:" || url.protocol === "http:") {
                articleURL = url.href;
            }

        } catch (error) {

            articleURL = null;

        }

        if (articleURL) {

            link.href = articleURL;

            link.target = "_blank";

            link.rel = "noopener noreferrer";

            link.textContent = "Read Full Article →";

        } else {

            link.href = "#";

            link.textContent = "Article link unavailable";

            link.addEventListener("click", event => {
                event.preventDefault();
            });

        }


        // Assemble article card

        card.append(
            category,
            title,
            summary,
            metadata,
            explanation,
            link
        );

        container.appendChild(card);

    });

}


/* =========================================
   SEARCH
========================================= */

function searchArticles() {

    applyFilters();

}


/* =========================================
   CATEGORY FILTERING
========================================= */

function filterByCategory(category) {

    selectedCategory = category;

    updateActiveCategory();

    applyFilters();

}


/* =========================================
   APPLY CATEGORY AND SEARCH FILTERS
========================================= */

function applyFilters() {

    const searchInput = document.getElementById("searchInput");

    const searchTerm = searchInput
        ? searchInput.value.toLowerCase().trim()
        : "";

    let filteredArticles = [...allArticles];


    // Apply selected category

    if (selectedCategory === "New24Hours") {

        filteredArticles = getLast24HoursArticles();

    } else if (selectedCategory !== "All") {

        filteredArticles = filteredArticles.filter(article =>
            article.category === selectedCategory
        );

    }


    // Apply search within the selected category

    if (searchTerm) {

        filteredArticles = filteredArticles.filter(article => {

            const searchableText = [
                article.title,
                article.summary,
                article.source,
                article.category
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();

            return searchableText.includes(searchTerm);

        });

    }

    displayArticles(filteredArticles);

}


/* =========================================
   SET UP CATEGORY BUTTONS AND STAT CARDS
========================================= */

function setupCategoryFilters() {

    // Category filter buttons

    document.querySelectorAll(".category-btn").forEach(button => {

        button.addEventListener("click", () => {

            const category = button.dataset.category;

            if (category) {
                filterByCategory(category);
            }

        });

    });


    // Clickable statistics cards

    document.querySelectorAll(".stat-card").forEach(card => {

        card.addEventListener("click", () => {

            const category = card.dataset.category;

            if (category) {
                filterByCategory(category);
            }

        });

    });

}


/* =========================================
   SEARCH EVENT
========================================= */

function setupSearch() {

    const searchInput = document.getElementById("searchInput");

    if (searchInput) {

        searchInput.addEventListener("input", searchArticles);

    }

}


/* =========================================
   INITIALIZE DASHBOARD
========================================= */

function initializeDashboard() {

    updateStatistics();

    setupCategoryFilters();

    setupSearch();

    updateActiveCategory();

    displayArticles(allArticles);

}


/* =========================================
   START APPLICATION
========================================= */

document.addEventListener("DOMContentLoaded", loadArticles);
