
import feedparser
import json
import re
import html
import calendar

from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from collections import Counter


# =========================================
# DATE CONFIGURATION
# =========================================

now = datetime.now(timezone.utc)
seven_days_ago = now - timedelta(days=7)


# =========================================
# CLEAN RSS TEXT
# =========================================

def clean_summary(summary):

    if not summary:
        return ""

    summary = re.sub(r"<[^>]+>", " ", summary)
    summary = html.unescape(summary)
    summary = re.sub(r"\s+", " ", summary)

    return summary.strip()


# =========================================
# CHECK RSS FEED
# =========================================

def check_feed(feed, source_name):

    if hasattr(feed, "status") and feed.status != 200:

        print(
            f"{source_name} is unavailable. HTTP Status: {feed.status}"
        )

        return False

    if not feed.entries:

        print(f"{source_name} returned no articles.")

        return False

    return True


# =========================================
# ARTICLE CATEGORIZATION
# =========================================

def categorize_article(title, summary):

    title = clean_summary(title).lower()
    summary = clean_summary(summary).lower()

    categories = {

        # RANSOMWARE
        "Ransomware": {

            "strong": [
                "ransomware attack",
                "ransomware gang",
                "ransomware group",
                "ransomware campaign",
                "double extortion",
                "ransomware operation"
            ],

            "keywords": [
                "ransomware",
                "ransom note",
                "ransom payment",
                "encrypted files",
                "ransom demand"
            ]
        },

        # DATA BREACHES
        "Data Breaches": {

            "strong": [
                "data breach",
                "data leak",
                "customer data exposed",
                "personal information exposed",
                "customer records stolen",
                "sensitive data leaked",
                "credit card numbers",
                "payment card information",
                "stolen customer data",
                "database exposed",
                "prompt theft",
                "credential theft",
                "cloud server breach",
                "hackers breach n-able",
                "rackspace spot breach",
                "access kubernetes secrets"
            ],

            "keywords": [
                "data theft",
                "data exfiltration",
                "stolen credentials",
                "exposed records",
                "customer information",
                "personal information",
                "credit card data",
                "payment card data",
                "database leak",
                "credentials stolen",
                "data exposed",
                "customer secrets",
                "cloud credentials",
                "unauthorized access to data",
                "information stolen",
                "records exposed",
                "secrets stolen",
                "compromised credentials",
                "sensitive data",
                "exposed sensitive data",
                "stolen data",
                "data exposure",
                "breached cloud platform",
                "exposed sensitive information",
                "private conversations",
                "unauthorized workloads",
                "access customer data"
            ]
        },

        # THREAT ACTORS
        "Threat Actors": {

            "strong": [
                "nation-state hacking group",
                "cyber espionage campaign",
                "state-sponsored attack",
                "threat actor group",
                "north korea-aligned",
                "china-linked hackers",
                "iranian hackers",
                "russian hackers",
                "espionage operation",
                "cybercriminal operation"
            ],

            "keywords": [
                "threat actor",
                "hacking group",
                "apt group",
                "nation-state",
                "cyber espionage",
                "state-sponsored",
                "espionage group",
                "hacker group",
                "cybercriminal group",
                "threat campaign",
                "china-linked",
                "north korea",
                "iran-linked",
                "russia-linked",
                "webworm",
                "apt",
                "hacker operation",
                "threat actors",
                "cyber attacks",
                "vishing attacks",
                "affiliate attacks",
                "extortion campaigns",
                "government impersonation",
                "com affiliate",
                "vishing campaign",
                "data theft campaign"
            ]
        },

        # MALWARE
        "Malware": {

            "strong": [
                "information stealer",
                "credential stealer",
                "remote access trojan",
                "banking trojan",
                "malicious payload",
                "malware campaign",
                "blockchain-based c2"
            ],

            "keywords": [
                "malware",
                "trojan",
                "spyware",
                "infostealer",
                "backdoor",
                "botnet",
                "keylogger",
                "rootkit",
                "rat malware",
                "malicious software",
                "loader",
                "worm",
                "malicious code",
                "payload",
                "command-and-control",
                "command and control",
                "c2 infrastructure",
                "compromised vendor script",
                "malware command-and-control",
                "malware c2",
                "c2 servers",
                "compromised vendor",
                "software supply chain compromise"
            ]
        },

        # VULNERABILITIES
        "Vulnerabilities": {

            "strong": [
                "zero-day vulnerability",
                "remote code execution",
                "privilege escalation vulnerability",
                "authentication bypass vulnerability",
                "critical vulnerability",
                "security vulnerability",
                "buffer overflow vulnerability",
                "actively exploited vulnerability",
                "memory corruption",
                "code injection",
                "malicious webpage",
                "critical memory bug",
                "bypasses tpm lockout"
            ],

            "keywords": [
                "vulnerability",
                "vulnerabilities",
                "zero-day",
                "0-day",
                "security flaw",
                "unpatched",
                "buffer overflow",
                "sql injection",
                "cross-site scripting",
                "rce",
                "cve-",
                "authentication bypass",
                "privilege escalation",
                "exploit",
                "arbitrary code execution",
                "execute arbitrary code",
                "remote code execution",
                "memory bug",
                "session flaw",
                "lockout bypass",
                "pin bypass",
                "security bypass",
                "php2shell",
                "nginx2root",
                "memory safety",
                "malicious input",
                "unauthenticated attacker",
                "arbitrary code",
                "security weakness",
                "authentication flaw",
                "logic flaw",
                "improper validation"
            ]
        },

        # SECURITY UPDATES
        "Security Updates": {

            "strong": [
                "security update released",
                "security patch released",
                "emergency security update",
                "security advisory issued",
                "vendor releases security fix"
            ],

            "keywords": [
                "security update",
                "security patch",
                "patch released",
                "security advisory",
                "firmware update",
                "software update",
                "security fixes",
                "patch tuesday",
                "patches critical flaws",
                "vendor fixes vulnerability"
            ]
        }
    }

    # =====================================
    # WEIGHTED SCORING WITH EXPLANATIONS
    # =====================================

    scores = {}
    reasons = {}

    for category, keywords in categories.items():

        score = 0
        matched_reasons = []

        # Strong keyword matches
        for keyword in keywords["strong"]:

            if keyword in title:

                score += 8

                matched_reasons.append(
                    f"Title matched: {keyword} (+8)"
                )

            elif keyword in summary:

                score += 3

                matched_reasons.append(
                    f"Summary matched: {keyword} (+3)"
                )

        # Regular keyword matches
        for keyword in keywords["keywords"]:

            if keyword in title:

                score += 4

                matched_reasons.append(
                    f"Title matched: {keyword} (+4)"
                )

            elif keyword in summary:

                score += 1

                matched_reasons.append(
                    f"Summary matched: {keyword} (+1)"
                )

        scores[category] = score
        reasons[category] = matched_reasons

    # =====================================
    # SELECT BEST CATEGORY
    # =====================================

    best_category = max(scores, key=scores.get)
    best_score = scores[best_category]

    # Minimum score required
    if best_score < 4:

        return (
            "Other",
            "No category reached the minimum classification score."
        )

    # =====================================
    # BUILD CLASSIFICATION REASON
    # =====================================

    matched_reasons = reasons[best_category]

    category_reason = (
        f"Score: {best_score}. "
        + "; ".join(matched_reasons)
    )

    return best_category, category_reason


# =========================================
# GET PUBLICATION DATE IN UTC
# =========================================

def get_published_date(article):

    if article.get("published_parsed"):

        timestamp = calendar.timegm(
            article.published_parsed
        )

        return datetime.fromtimestamp(
            timestamp,
            timezone.utc
        )

    published = (
        article.get("published")
        or article.get("updated")
    )

    if published:

        try:

            date = parsedate_to_datetime(published)

            if date.tzinfo is None:
                date = date.replace(tzinfo=timezone.utc)

            return date.astimezone(timezone.utc)

        except (ValueError, TypeError, OverflowError):
            pass

        try:

            date = datetime.fromisoformat(
                published.replace("Z", "+00:00")
            )

            if date.tzinfo is None:
                date = date.replace(tzinfo=timezone.utc)

            return date.astimezone(timezone.utc)

        except (ValueError, TypeError):
            pass

    return None


# =========================================
# PROCESS RSS FEED
# =========================================

def process_feed(feed_url, source_name):

    feed_articles = []

    try:

        feed = feedparser.parse(feed_url)

    except Exception as error:

        print(f"Error fetching {source_name}: {error}")

        return feed_articles

    if feed.bozo:

        print(
            f"Warning: {source_name} has a parsing issue."
        )

        print(feed.bozo_exception)

    if hasattr(feed, "status"):

        print(
            f"{source_name} HTTP Status:",
            feed.status
        )

    if check_feed(feed, source_name):

        for article in feed.entries:

            published_date = get_published_date(article)

            # Skip articles without valid dates
            if not published_date:
                continue

            # Keep articles from the last 7 days
            if seven_days_ago <= published_date <= now:

                title = article.get(
                    "title", ""
                ).strip()

                url = article.get(
                    "link", ""
                ).strip()

                summary = clean_summary(
                    article.get("summary", "")
                )

                # Skip incomplete articles
                if not title or not url:
                    continue

                # Get category and explanation
                category, category_reason = categorize_article(
                    title,
                    summary
                )

                article_data = {

                    "title": title,

                    "source": source_name,

                    "published": published_date.isoformat(),

                    "url": url,

                    "summary": summary,

                    "category": category,

                    "category_reason": category_reason
                }

                feed_articles.append(article_data)

    print(
        f"{source_name}: {len(feed_articles)} articles collected."
    )

    return feed_articles


# =========================================
# RSS SOURCES
# =========================================

rss_sources = [

    {
        "name": "The Hacker News",
        "url": "https://feeds.feedburner.com/TheHackersNews"
    },

    {
        "name": "BleepingComputer",
        "url": "https://www.bleepingcomputer.com/feed/"
    },

    {
        "name": "Cisco Talos",
        "url": "https://blog.talosintelligence.com/rss/"
    },

    {
        "name": "Palo Alto Unit 42",
        "url": "https://unit42.paloaltonetworks.com/feed/"
    },

    {
        "name": "The DFIR Report",
        "url": "https://thedfirreport.com/feed/"
    },

    {
        "name": "Zero Day Initiative",
        "url": "https://www.zerodayinitiative.com/rss/published/"
    },

    {
        "name": "Krebs on Security",
        "url": "https://krebsonsecurity.com/feed/"
    }

]


# =========================================
# COLLECT ARTICLES
# =========================================

articles = []

for source in rss_sources:

    articles.extend(
        process_feed(
            source["url"],
            source["name"]
        )
    )


# =========================================
# REMOVE DUPLICATES
# =========================================

total_before_dedup = len(articles)

unique_articles = []

seen_urls = set()

for article in articles:

    if article["url"] not in seen_urls:

        unique_articles.append(article)

        seen_urls.add(article["url"])

articles = unique_articles


# =========================================
# SAVE JSON
# =========================================

if articles:

    with open(
        "feeds.json",
        "w",
        encoding="utf-8"
    ) as file:

        json.dump(
            articles,
            file,
            indent=4,
            ensure_ascii=False
        )

    print("\nArticles saved successfully!")

else:

    print(
        "\nNo articles collected. Existing JSON file preserved."
    )


# =========================================
# COLLECTION SUMMARY
# =========================================

print("\n========== COLLECTION SUMMARY ==========")

print("Total Sources:", len(rss_sources))

print("Before Deduplication:", total_before_dedup)

print("After Deduplication:", len(articles))

print(
    "Duplicates Removed:",
    total_before_dedup - len(articles)
)

# Category distribution
if articles:

    print("\nCATEGORY DISTRIBUTION:")

    category_counts = Counter(
        article["category"]
        for article in articles
    )

    for category, count in category_counts.most_common():

        print(f"{category}: {count}")

print("========================================")
