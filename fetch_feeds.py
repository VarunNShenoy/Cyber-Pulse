
import feedparser
import json
from datetime import datetime, timedelta, timezone

# Calculate the 7-day cutoff
now = datetime.now(timezone.utc)
seven_days_ago = now - timedelta(days=7)


# Check whether an RSS feed is usable
def check_feed(feed, source_name):

    if hasattr(feed, "status") and feed.status != 200:
        print(f"{source_name} is unavailable. HTTP Status: {feed.status}")
        return False

    if not feed.entries:
        print(f"{source_name} returned no articles.")
        return False

    return True


# Process articles from an RSS feed
def process_feed(feed_url, source_name):

    feed_articles = []

    feed = feedparser.parse(feed_url)

    if feed.bozo:
        print(f"Warning: {source_name} has a parsing issue.")
        print(feed.bozo_exception)

    if hasattr(feed, "status"):
        print(f"{source_name} HTTP Status:", feed.status)

    if check_feed(feed, source_name):

        for article in feed.entries:

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
                    "source": source_name,
                    "published": published_date.isoformat(),
                    "url": article.link,
                    "summary": article.summary
                }

                feed_articles.append(article_data)

    return feed_articles


# Collect articles from all RSS sources
articles = []

articles.extend(
    process_feed(
        "https://feeds.feedburner.com/TheHackersNews",
        "The Hacker News"
    )
)

articles.extend(
    process_feed(
        "https://www.bleepingcomputer.com/feed/",
        "BleepingComputer"
    )
)


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
