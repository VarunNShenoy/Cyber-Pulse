
import feedparser
import json
from datetime import datetime, timedelta, timezone

# Calculate the 7-day cutoff
now = datetime.now(timezone.utc)
seven_days_ago = now - timedelta(days=7)

articles = []


# Check whether an RSS feed is usable
def check_feed(feed, source_name):

    if hasattr(feed, "status") and feed.status != 200:
        print(f"{source_name} is unavailable. HTTP Status: {feed.status}")
        return False

    if not feed.entries:
        print(f"{source_name} returned no articles.")
        return False

    return True


# Fetch The Hacker News
rss_data = feedparser.parse("https://feeds.feedburner.com/TheHackersNews")

if rss_data.bozo:
    print("Warning: The Hacker News feed has a parsing issue.")
    print(rss_data.bozo_exception)

if hasattr(rss_data, "status"):
    print("The Hacker News HTTP Status:", rss_data.status)

if check_feed(rss_data, "The Hacker News"):

    for article in rss_data.entries:

        # Skip articles without publication dates
        if not article.get("published"):
            continue

        # Handle invalid publication date formats
        try:
            published_date = datetime.strptime(
                article.published,
                "%a, %d %b %Y %H:%M:%S %z"
            ).astimezone(timezone.utc)

        except ValueError:
            continue

        # Keep articles from the last 7 days
        if published_date >= seven_days_ago:

            article_data = {
                "title": article.title,
                "source": rss_data.feed.title,
                "published": published_date.isoformat(),
                "url": article.link,
                "summary": article.summary
            }

            articles.append(article_data)


# Fetch BleepingComputer
bc_data = feedparser.parse("https://www.bleepingcomputer.com/feed/")

if bc_data.bozo:
    print("Warning: The BleepingComputer feed has a parsing issue.")
    print(bc_data.bozo_exception)

if hasattr(bc_data, "status"):
    print("BleepingComputer HTTP Status:", bc_data.status)

if check_feed(bc_data, "BleepingComputer"):

    for article in bc_data.entries:

        # Skip articles without publication dates
        if not article.get("published"):
            continue

        # Handle invalid publication date formats
        try:
            published_date = datetime.strptime(
                article.published,
                "%a, %d %b %Y %H:%M:%S %z"
            ).astimezone(timezone.utc)

        except ValueError:
            continue

        # Keep articles from the last 7 days
        if published_date >= seven_days_ago:

            article_data = {
                "title": article.title,
                "source": bc_data.feed.title,
                "published": published_date.isoformat(),
                "url": article.link,
                "summary": article.summary
            }

            articles.append(article_data)


# Remove duplicate URLs
total_before_dedup = len(articles)

unique_articles = []
seen_urls = set()

for article in articles:

    if article["url"] not in seen_urls:
        unique_articles.append(article)
        seen_urls.add(article["url"])

articles = unique_articles

# Save articles to JSON only if articles were collected
if articles:

    with open("feeds.json", "w", encoding="utf-8") as file:
        json.dump(articles, file, indent=4, ensure_ascii=False)

    print("Articles saved successfully!")

else:
    print("No articles collected. Existing JSON file preserved.")


# Display collection statistics
print("Before Deduplication:", total_before_dedup)
print("After Deduplication:", len(articles))
print("Duplicates Removed:", total_before_dedup - len(articles))

