
// =========================================
// CYBER PULSE - MAIN JAVASCRIPT
// =========================================

// Store all articles loaded from feeds.json
let allArticles = [];

// Store the currently selected category
let selectedCategory = "All";

// Categories displayed in the dashboard
const categories = [
    {
        name: "All",
        label: "Total Articles",
        className: "stat-total"
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
// LOAD ARTICLES
// =========================================

async function loadArticles() {
    try {
        const response = await fetch("../feeds.json");

        if (!response.ok) {
            throw new Error("Unable to load feeds.json");
        }

        const articles = await response.json();

        if (!Array.isArray(articles)) {
            throw new Error("Article data is not in the expected format");
        }

        allArticles = articles;

        console.log("Articles loaded:", allArticles.length);

        updateStatistics();
        applyFilters();

    } catch (error) {
        console.error("Error loading articles:", error);

        const container = document.getElementById("articleContainer");

        if (container) {
            container.textContent =
                "Unable to load articles. Please check the backend data and server.";
        }
    }
}


// =========================================
// UPDATE STATISTICS
// =========================================

function updateStatistics() {
    const statsGrid = document.querySelector(".stats-grid");

    if (!statsGrid) {
        console.error("Statistics container not found");
        return;
    }

    // Remove the existing four cards
    statsGrid.innerHTML = "";

    // Create all eight statistic cards
    categories.forEach(category => {

        // Count articles belonging to this category
        let count;

        if (category.name === "All") {
            count = allArticles.length;
        } else {
            count = allArticles.filter(article =>
                article.category === category.name
            ).length;
        }

        // Create the card
        const card = document.createElement("div");
        card.className = `stat-card ${category.className}`;

        // Create category label
        const label = document.createElement("p");
        label.textContent = category.label;

        // Create article count
        const number = document.createElement("h2");
        number.textContent = count;

        // Add elements to the card
        card.appendChild(label);
        card.appendChild(number);

        // Add card to statistics section
        statsGrid.appendChild(card);
    });
}


// =========================================
// DISPLAY ARTICLES
// =========================================

function displayArticles(articles) {
    const container = document.getElementById("articleContainer");

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
        title.textContent = article.title || "Untitled article";

        // Article summary
        const summary = document.createElement("p");
        summary.className = "article-summary";
        summary.textContent =
            article.summary || "No summary available.";

        // Article metadata
        const meta = document.createElement("div");
        meta.className = "article-meta";

        const source = document.createElement("span");
        source.textContent = article.source || "Unknown source";

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

        // Assemble the article card
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

        const title = (article.title || "").toLowerCase();
        const summary = (article.summary || "").toLowerCase();
        const source = (article.source || "").toLowerCase();
        const category = (article.category || "").toLowerCase();

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

    if (selectedCategory === "All") {
        return articles;
    }

    return articles.filter(article =>
        article.category === selectedCategory
    );
}


// =========================================
// APPLY SEARCH AND CATEGORY FILTERS
// =========================================

function applyFilters() {

    const searchInput = document.getElementById("searchInput");

    const searchTerm = searchInput
        ? searchInput.value
        : "";

    // First filter by category
    const categoryFiltered = filterByCategory(allArticles);

    // Then filter by search term
    const searchFiltered = searchArticles(
        categoryFiltered,
        searchTerm
    );

    // Display the final results
    displayArticles(searchFiltered);

    // Update article count
    const articleCount = document.getElementById("articleCount");

    if (articleCount) {
        articleCount.textContent =
            `Showing ${searchFiltered.length} of ${allArticles.length} articles`;
    }
}


// =========================================
// CATEGORY BUTTON EVENTS
// =========================================

function setupCategoryFilters() {

    const categoryButtons = document.querySelectorAll(".category-btn");

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

    const searchInput = document.getElementById("searchInput");

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
document.addEventListener("DOMContentLoaded", initializeDashboard);
