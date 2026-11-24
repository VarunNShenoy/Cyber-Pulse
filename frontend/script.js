
// =========================================
// CYBER PULSE - MAIN JAVASCRIPT
// =========================================

// Store all articles loaded from feeds.json
let allArticles = [];

// Store the currently selected category or filter
let selectedCategory = "All";

// Categories displayed in the dashboard
const categories = [
    {
        name: "All",
        label: "Total Articles",
        className: "stat-total"
    },
    {
        name: "New24Hours",
        label: "New Articles (24h)",
        className: "stat-new"
    },
    {
        name: "Vulnerabilities",
        label: "Vulnerabilities",
        className: "stat-vulnerabilities"
    },
    {
        name: "Ransomware",
        label: "Ransomware",
        className: "stat-ransomware"
    },
    {
        name: "Data Breaches",
        label: "Data Breaches",
        className: "stat-breaches"
    },
    {
        name: "Malware",
        label: "Malware",
        className: "stat-malware"
    },
    {
        name: "Threat Actors",
        label: "Threat Actors",
        className: "stat-threat-actors"
    },
    {
        name: "Security Updates",
        label: "Security Updates",
        className: "stat-updates"
    },
    {
        name: "Other",
        label: "Other",
        className: "stat-other"
    }
];


// =========================================
// NEW ARTICLES TIME FILTER
// =========================================

function getLast24HoursArticles(articles) {

    const now = Date.now();
    const last24Hours = now - (24 * 60 * 60 * 1000);

    return articles.filter(article => {

        if (!article.published) {
            return false;
        }

        const publishedTime = new Date(article.published).getTime();

        return (
            !isNaN(publishedTime) &&
            publishedTime >= last24Hours &&
            publishedTime <= now
        );
    });
}


// =========================================
// LOAD ARTICLES
// =========================================

async function loadArticles() {

    try {

        // Detect whether the dashboard is running on GitHub Pages
        const isGitHubPages =
            window.location.hostname === "varunnshenoy.github.io";

        // Select the correct feeds.json location
        const feedsPath = isGitHubPages
            ? "/Cyber-Pulse/feeds.json"
            : "../feeds.json";

        const response = await fetch(feedsPath);

        if (!response.ok) {
            throw new Error(
                `Unable to load feeds.json. Status: ${response.status}`
            );
        }

        const articles = await response.json();

        if (!Array.isArray(articles)) {
            throw new Error(
                "Article data is not in the expected format"
            );
        }

        allArticles = articles;

        console.log("Articles loaded:", allArticles.length);

        updateStatistics();
        applyFilters();

    } catch (error) {

        console.error("Error loading articles:", error);

        const container =
            document.getElementById("articleContainer");

        if (container) {
            container.textContent =
                "Unable to load articles. Please check the news data and try again.";
        }
    }
}


// =========================================
// UPDATE STATISTICS
// =========================================

function updateStatistics() {

    const statsGrid =
        document.querySelector(".stats-grid");

    if (!statsGrid) {
        console.error("Statistics container not found");
        return;
    }

    // Remove existing statistic cards
    statsGrid.innerHTML = "";

    // Create all statistic cards
    categories.forEach(category => {

        let count;

        if (category.name === "All") {

            count = allArticles.length;

        } else if (category.name === "New24Hours") {

            count = getLast24HoursArticles(allArticles).length;

        } else {

            count = allArticles.filter(article =>
                article.category === category.name
            ).length;
        }

        // Create the card
        const card = document.createElement("div");

        card.className = `stat-card ${category.className}`;

        // Make the card interactive
        card.style.cursor = "pointer";
        card.setAttribute("role", "button");
        card.setAttribute("tabindex", "0");
        card.setAttribute(
            "aria-label",
            `Filter articles by ${category.label}`
        );

        // Store the filter name on the card
        card.dataset.statCategory = category.name;

        // Create category label
        const label = document.createElement("p");
        label.textContent = category.label;

        // Create article count
        const number = document.createElement("h2");
        number.textContent = count;

        // Assemble the card
        card.appendChild(label);
        card.appendChild(number);

        // Handle mouse click
        card.addEventListener("click", () => {
            selectStatisticCard(category.name);
        });

        // Handle keyboard interaction
        card.addEventListener("keydown", event => {

            if (event.key === "Enter" || event.key === " ") {

                event.preventDefault();
                selectStatisticCard(category.name);
            }
        });

        // Add card to statistics section
        statsGrid.appendChild(card);
    });

    updateActiveStatisticCard();
}


// =========================================
// SELECT STATISTIC CARD
// =========================================

function selectStatisticCard(categoryName) {

    // Update selected filter
    selectedCategory = categoryName;

    // Synchronize category buttons
    const categoryButtons =
        document.querySelectorAll(".category-btn");

    categoryButtons.forEach(button => {

        button.classList.toggle(
            "active",
            button.dataset.category === selectedCategory
        );
    });

    // Apply selected filter
    applyFilters();
}


// =========================================
// UPDATE ACTIVE STATISTIC CARD
// =========================================

function updateActiveStatisticCard() {

    const statisticCards =
        document.querySelectorAll(".stat-card");

    statisticCards.forEach(card => {

        const isSelected =
            card.dataset.statCategory === selectedCategory;

        // Highlight the currently selected card
        card.style.outline = isSelected
            ? "2px solid #ffffff"
            : "none";

        card.style.outlineOffset = isSelected
            ? "3px"
            : "0";
    });
}


// =========================================
// DISPLAY ARTICLES
// =========================================

function displayArticles(articles) {

    const container =
        document.getElementById("articleContainer");

    if (!container) {
        console.error("Article container not found");
        return;
    }

    container.innerHTML = "";

    // Display message when no articles match
    if (articles.length === 0) {

        const message = document.createElement("p");
        message.textContent = "No articles found.";

        container.appendChild(message);
        return;
    }

    articles.forEach(article => {

        // Main article card
        const card = document.createElement("div");
        card.className = "article-card";

        // Category
        const category = document.createElement("span");
        category.className = "article-category";
        category.textContent = article.category || "Other";

        // Article title
        const title = document.createElement("h3");
        title.textContent =
            article.title || "Untitled article";

        // Article summary
        const summary = document.createElement("p");
        summary.className = "article-summary";
        summary.textContent =
            article.summary || "No summary available.";

        // Article metadata
        const meta = document.createElement("div");
        meta.className = "article-meta";

        const source = document.createElement("span");
        source.textContent =
            article.source || "Unknown source";

        const published = document.createElement("span");

        if (article.published) {

            const date = new Date(article.published);

            published.textContent = isNaN(date.getTime())
                ? ""
                : date.toLocaleDateString();
        }

        meta.appendChild(source);
        meta.appendChild(published);

        // Read more link
        const link = document.createElement("a");
        link.textContent = "Read Full Article";

        // Only allow HTTP and HTTPS URLs
        try {

            const articleURL = new URL(article.url);

            if (
                articleURL.protocol === "https:" ||
                articleURL.protocol === "http:"
            ) {

                link.href = articleURL.href;
                link.target = "_blank";
                link.rel = "noopener noreferrer";

            } else {

                link.textContent = "Invalid article link";
            }

        } catch {

            link.textContent = "Article link unavailable";
        }

        // Assemble article card
        card.appendChild(category);
        card.appendChild(title);
        card.appendChild(summary);
        card.appendChild(meta);
        card.appendChild(link);

        container.appendChild(card);
    });
}


// =========================================
// SEARCH ARTICLES
// =========================================

function searchArticles(articles, searchTerm) {

    const searchText = searchTerm.toLowerCase().trim();

    if (!searchText) {
        return articles;
    }

    return articles.filter(article => {

        const title =
            (article.title || "").toLowerCase();

        const summary =
            (article.summary || "").toLowerCase();

        const source =
            (article.source || "").toLowerCase();

        const category =
            (article.category || "").toLowerCase();

        return (
            title.includes(searchText) ||
            summary.includes(searchText) ||
            source.includes(searchText) ||
            category.includes(searchText)
        );
    });
}


// =========================================
// FILTER BY CATEGORY
// =========================================

function filterByCategory(articles) {

    // Show all articles
    if (selectedCategory === "All") {
        return articles;
    }

    // Show articles published in the last 24 hours
    if (selectedCategory === "New24Hours") {
        return getLast24HoursArticles(articles);
    }

    // Show articles belonging to the selected category
    return articles.filter(article =>
        article.category === selectedCategory
    );
}


// =========================================
// APPLY SEARCH AND CATEGORY FILTERS
// =========================================

function applyFilters() {

    const searchInput =
        document.getElementById("searchInput");

    const searchTerm = searchInput
        ? searchInput.value
        : "";

    // First filter by selected category or time period
    const categoryFiltered =
        filterByCategory(allArticles);

    // Then filter by search term
    const searchFiltered = searchArticles(
        categoryFiltered,
        searchTerm
    );

    // Display final results
    displayArticles(searchFiltered);

    // Update article count
    const articleCount =
        document.getElementById("articleCount");

    if (articleCount) {

        articleCount.textContent =
            `Showing ${searchFiltered.length} of ${allArticles.length} articles`;
    }

    // Update selected statistic card
    updateActiveStatisticCard();
}


// =========================================
// CATEGORY BUTTON EVENTS
// =========================================

function setupCategoryFilters() {

    const categoryButtons =
        document.querySelectorAll(".category-btn");

    categoryButtons.forEach(button => {

        button.addEventListener("click", () => {

            selectedCategory = button.dataset.category;

            // Remove active class from every button
            categoryButtons.forEach(btn => {
                btn.classList.remove("active");
            });

            // Highlight selected button
            button.classList.add("active");

            // Apply selected category
            applyFilters();
        });
    });
}


// =========================================
// SEARCH INPUT EVENT
// =========================================

function setupSearch() {

    const searchInput =
        document.getElementById("searchInput");

    if (!searchInput) {
        return;
    }

    searchInput.addEventListener("input", () => {
        applyFilters();
    });
}


// =========================================
// INITIALIZE DASHBOARD
// =========================================

function initializeDashboard() {

    setupCategoryFilters();

    setupSearch();

    loadArticles();
}


// Start the dashboard
document.addEventListener(
    "DOMContentLoaded",
    initializeDashboard
);
