import calendar
import html
import json
import os
import re
import socket
import tempfile

from collections import Counter
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime

import feedparser


# =========================================
# CONFIGURATION
# =========================================

# Articles older than this are dropped from feeds.json. RSS feeds only
# expose their most recent items, so the script MERGES each run into the
# existing feeds.json; that is how 30 days of history builds up.
DAYS_TO_KEEP = 30

OUTPUT_FILE = "feeds.json"

# Seconds to wait for a feed before giving up.
REQUEST_TIMEOUT = 20

# Maximum number of topic tags stored per article.
MAX_TAGS = 6

now = datetime.now(timezone.utc)
retention_cutoff = now - timedelta(days=DAYS_TO_KEEP)


# =========================================
# CLEAN RSS TEXT
# =========================================

def clean_summary(summary):
    """Remove HTML markup and normalize whitespace in RSS text."""

    if not summary:
        return ""

    summary = re.sub(r"<[^>]+>", " ", str(summary))
    summary = html.unescape(summary)
    summary = re.sub(r"\s+", " ", summary)

    return summary.strip()


# =========================================
# CLASSIFICATION RULES - VERSION 2
# =========================================
#
# Each category has:
#   strong: specific phrases / indicators
#   keywords: broader but still useful indicators
#
# Patterns are regular expressions matched case-insensitively with
# word boundaries so short terms do not match inside unrelated words.
#
# Scoring (see categorize_article):
#   * each rule counts at most once per field (title / summary)
#   * a rule that matched in the title is not counted again in the summary
#   * overlapping matches are resolved across BOTH tiers, longest wins
# =========================================

CATEGORY_RULES = {
    "Ransomware": {
        "strong": [
            r"\bransomware attack\b",
            r"\bransomware gang\b",
            r"\bransomware group\b",
            r"\bransomware campaign\b",
            r"\bransomware operation\b",
            r"\bdouble extortion\b",
            r"\btriple extortion\b",
            r"\bransom demand\b",
            r"\bfiles? encrypted by ransomware\b",
            r"\bransomware-as-a-service\b",
            r"\bRaaS\b",
        ],
        "keywords": [
            r"\bransomware\b",
            r"\bransom note\b",
            r"\bransom payment\b",
            r"\bdecrypt(?:ion|or)\b",
            r"\bdata encryption attack\b",
            # NOTE: plain "extortion" was removed. Data-extortion crews
            # (vishing, leak sites) are Threat Actors, not ransomware.
            r"\b(?:LockBit|Akira|Qilin|Cl0p|Clop|BlackCat|ALPHV|RansomHub|"
            r"Black Basta|Rhysida)\b",
        ],
    },

    "Data Breaches": {
        "strong": [
            r"\bdata breach(?:es)?\b",
            # "data leak site" is an extortion-gang site, not a breach.
            r"\bdata leaks?\b(?!\s+sites?)",
            r"\bsecurity breach(?:es)?\b",
            r"\b(?:discloses?|confirms?|reveals?|suffers?|detects?|hit by)\b"
            r".{0,25}\b(?:cyber ?attack|security incident|intrusion|breach)\b",
            r"\bbreach(?:ed|es)?\b.{0,40}\b(?:expos\w+|leak\w*|stol\w+|steal\w*)\b",
            r"\bcustomer data exposed\b",
            r"\bpersonal information exposed\b",
            r"\bcustomer records stolen\b",
            r"\bsensitive data leaked\b",
            r"\bdatabase exposed\b",
            r"\bmillions of records exposed\b",
            r"\bunauthorized access to (?:customer|personal|sensitive) data\b",
            r"\bcredentials? exposed\b",
            r"\bcloud database exposed\b",
        ],
        "keywords": [
            r"\bdata theft\b",
            r"\b(?:prompt|credential) theft\b",
            r"\bdata exfiltration\b",
            r"\bstolen credentials\b",
            r"\bexposed records\b",
            r"\bcustomer information\b",
            r"\bpersonal information\b",
            r"\bcredit card data\b",
            r"\bpayment card data\b",
            r"\bdatabase leak\b",
            r"\bcredentials stolen\b",
            r"\bdata exposed\b",
            r"\bcompromised credentials\b",
            r"\bsensitive data\b",
            r"\bstolen data\b",
            r"\bdata exposure\b",
            r"\binformation stolen\b",
            r"\brecords exposed\b",
            r"\bprivate conversations leaked\b",
            r"\b(?:data|information|records) leaked\b",
            r"\bunauthori[sz]ed (?:access|activity)\b",
            # "exposing / leaked ... data|keys|secrets", but NOT hypothetical
            # wording such as "could expose customer data".
            r"(?<!could )(?<!can )(?<!may )(?<!lets )(?<!allow )"
            r"\b(?:expos(?:es|ed|ing)|leak(?:s|ed|ing))\b.{0,50}"
            r"\b(?:data|records|credentials|api keys|access keys|cloud keys|"
            r"secrets|private (?:chats|conversations))\b",
            r"\b(?:hackers?|attackers?|threat actors?)\b.{0,30}"
            r"\b(?:breach\w*|compromis\w+)\b",
        ],
    },

    "Threat Actors": {
        "strong": [
            r"\bnation[- ]state (?:hacking )?group\b",
            r"\bstate[- ]sponsored (?:attack|campaign|group|hackers?)\b",
            r"\bthreat actor group\b",
            r"\bAPT\s*[-#]?\s*\d{1,3}\b",
            r"\bcybercriminal (?:group|gang|operation)\b",
            # Any country + linked/aligned/nexus/backed (replaces the three
            # hard-coded "North Korea-aligned / China-linked / Iranian" rules).
            r"\b(?:China|Chinese|Iran|Iranian|Russia|Russian|North Korea|"
            r"North Korean|DPRK|Vietnam|Vietnamese|Pakistan|Pakistani)"
            r"[- ](?:linked|aligned|nexus|backed|based|sponsored|affiliated)\b",
            r"\b(?:Chinese|Iranian|Russian|North Korean) hackers?\b",
            r"\b(?:cyber[- ])?espionage (?:campaign|operation|group)s?\b",
            r"\b(?:extortion|hacking|cybercrime|hacker|threat) "
            r"(?:gang|crew|collective)s?\b",
            r"\b(?:UNC|UAT|TA|FIN|CL-STA|Storm)-?\d{2,4}\b",
        ],
        "keywords": [
            r"\bthreat actors?\b",
            r"\bhacking group\b",
            r"\bAPT group\b",
            r"\bnation[- ]state\b",
            r"\bcyber espionage\b",
            r"\bstate[- ]sponsored\b",
            r"\bespionage group\b",
            r"\bhacker group\b",
            r"\bcybercriminal group\b",
            r"\bthreat campaign\b",
            r"\bChina[- ]linked\b",
            r"\bNorth Korea\b",
            r"\bIran[- ]linked\b",
            r"\bRussia[- ]linked\b",
            r"\bhacker operation\b",
            r"\bcybercrime group\b",
            r"\badvanced persistent threat\b",
            r"\bAPT\b",
            r"\bvishing\b",
            r"\bleak sites?\b",
            r"\b(?:ShinyHunters|Scattered Spider|Lazarus|Kimsuky|Sandworm|"
            r"Volt Typhoon|Salt Typhoon|MuddyWater|OilRig|Turla|Lapsus)\b",
        ],
    },

    "Malware": {
        "strong": [
            r"\binformation stealer\b",
            r"\bcredential stealer\b",
            r"\bremote access trojan\b",
            r"\bbanking trojan\b",
            r"\bmalware campaign\b",
            r"\bmalicious payload\b",
            r"\bmalware command[- ]and[- ]control\b",
            r"\bmalware C2 infrastructure\b",
            r"\bblockchain[- ]based C2\b",
        ],
        "keywords": [
            r"\bmalware\b",
            r"\btrojan\b",
            r"\bspyware\b",
            r"\binfostealer\b",
            r"\bbackdoor\b",
            r"\bbotnet\b",
            r"\bkeylogger\b",
            r"\brootkit\b",
            r"\bmalicious software\b",
            r"\bcomputer worm\b",
            r"\bmalicious code\b",
            r"\bcommand[- ]and[- ]control\b",
            r"\bC2 infrastructure\b",
            r"\bC2 servers?\b",
            r"\bloader malware\b",
            r"\bmalicious implant\b",
        ],
    },

"Vulnerabilities": {
    "strong": [
        r"\bCVE-\d{4}-\d{4,}\b",
        r"\bzero[- ]day vulnerabilities?\b",
        r"\bauthentication bypass\b",
        r"\bremote code execution\b",
        r"\barbitrary code execution\b",
        r"\bprivilege escalation\b",
        r"\bcommand injection\b",
        r"\bsql injection\b",
        r"\bsecurity vulnerabilities?\b",
        r"\bactively exploited vulnerabilities?\b",
        r"\bimproper authentication\b",
        r"\bunauthenticated access\b",
        r"\bvulnerability exploitation\b",
        r"\bexploited (?:a|an|the) vulnerability\b",
    ],
    "keywords": [
        r"\bsecurity flaw\b",
        r"\bcritical vulnerability\b",
        r"\bflaw in .{0,60}\b",
        r"\bvulnerability\b",
        r"\bvulnerabilities\b",
        r"\bexploit(?:ed|s|ing)?\b",
        r"\bpatch(?:es|ed|ing)?\b",
        r"\bsecurity update\b",
        r"\bsecurity advisory\b",
        r"\bfix(?:es|ed|ing)? vulnerabilities\b",
        r"\bzero[- ]day\b",
        r"\bCVSS\b",
        r"\bproof[- ]of[- ]concept\b",
        r"\bPoC\b",
    ],
},

    "Security Updates": {
        "strong": [
            r"\bemergency security update\b",
            r"\bsecurity patch released\b",
            r"\bsecurity advisory issued\b",
            r"\bvendor releases? security fix\b",
            r"\bpatches? (?:a|the) critical vulnerability\b",
            r"\bfixes? actively exploited vulnerabilities\b",
            r"\b(?:fixes|patches|patched|fixed)\b.{0,40}"
            r"\b(?:flaws?|vulnerabilit(?:y|ies)|bugs?)\b",
            r"\b(?:releases?|ships?|issues?|rolls? out)\b.{0,20}"
            r"\b(?:fix(?:es)?|patch(?:es)?|updates?)\b",
        ],
        "keywords": [
            r"\bsecurity update\b",
            r"\bsecurity patch(?:es)?\b",
            r"\bpatch Tuesday\b",
            r"\bsecurity advisory\b",
            r"\bfirmware security update\b",
            r"\bsecurity fixes\b",
            r"\bvendor fixes? (?:a )?vulnerabilit(?:y|ies)\b",
            r"\bupdates? to address (?:a )?security flaw\b",
            r"\bhotfix\b",
        ],
    },
}


# Compile rules once instead of compiling them for every article.
COMPILED_RULES = {}

for category, rule_groups in CATEGORY_RULES.items():
    COMPILED_RULES[category] = {
        group_name: [
            re.compile(pattern, re.IGNORECASE)
            for pattern in patterns
        ]
        for group_name, patterns in rule_groups.items()
    }


# =========================================
# TOPIC TAGS
# =========================================
#
# Tags are separate from categories. They describe WHAT an article is
# about (topic, technique, named actor, malware family) and power the
# dashboard's topic chips. CVE IDs are deliberately not tags: the
# dashboard already extracts and shows them on each card.
#
# To follow new actors or malware, add names to ACTOR_NAMES / MALWARE_NAMES.

TOPIC_TAG_RULES = {
    "AI/LLM": (
        r"\b(?:AI|LLMs?|GPT-?\d[\w.]*|ChatGPT|OpenAI|Anthropic|Copilot|"
        r"Gemini|agentic|AI agents?|prompt injection|jailbreaks?|MCP|"
        r"machine learning)\b"
    ),
    "Supply Chain": (
        r"\b(?:supply[- ]chain|npm|PyPI|RubyGems|GitHub Actions|"
        r"typosquat\w*|malicious (?:packages?|extensions?)|"
        r"third[- ]party (?:vendors?|librar(?:y|ies)|scripts?)|"
        r"compromised vendor)\b"
    ),
    "Cloud": (
        r"\b(?:AWS|Azure|GCP|Google Cloud|Kubernetes|SaaS|Okta|Entra|"
        r"S3 buckets?|cloud (?:platform|servers?|storage|keys|credentials))\b"
    ),
    "Network Edge": (
        r"\b(?:firewalls?|VPN|routers?|gateways?|load balancers?|vCenter|"
        r"ESXi?|Fortinet|FortiGate|PAN-OS|F5|BIG-IP|Ivanti|SonicWall|"
        r"Citrix|NetScaler|Check Point|GL\.iNet)\b"
    ),
    "Mobile": r"\b(?:Android|iOS|iPadOS|iPhone|WhatsApp|Telegram)\b",
    "Critical Infrastructure": (
        r"\b(?:SCADA|ICS|OT networks?|industrial control|"
        r"critical infrastructure|power grid|utilit(?:y|ies)|"
        r"telecom(?:munications?)?|hospitals?|healthcare)\b"
    ),
    "Browser": (
        r"\b(?:Chrome|Chromium|Firefox|Safari|WebKit|browser extensions?)\b"
    ),
    "Microsoft": (
        r"\b(?:Windows|Microsoft|Active Directory|Exchange Server|"
        r"SharePoint|BitLocker)\b"
    ),
    "Phishing": (
        r"\b(?:phishing|vishing|smishing|spear[- ]phishing|ClickFix|"
        r"fake CAPTCHA|social engineering)\b"
    ),
    "Zero-Day": r"\b(?:zero[- ]days?|0[- ]days?)\b",
    "Credential Theft": (
        r"\b(?:credential (?:theft|stealing|harvesting)|infostealers?|"
        r"stolen credentials|password stealers?)\b"
    ),
    "DDoS": r"\b(?:DDoS|denial[- ]of[- ]service)\b",
    "RCE": r"\b(?:remote code execution|RCE)\b",
}

ACTOR_NAMES = [
    "ShinyHunters", "Scattered Spider", "Lazarus", "Kimsuky", "Sandworm",
    "Volt Typhoon", "Salt Typhoon", "MuddyWater", "OilRig", "Turla",
    "Lapsus", "Volant Manticore", "Webworm",
]

MALWARE_NAMES = [
    "Cobalt Strike", "Mimikatz", "QakBot", "Emotet", "Lumma", "RedLine",
    "AsyncRAT", "Remcos", "StealC", "Mirai", "DarkGate", "IcedID", "XWorm",
    "PlugX", "ShadowPad", "KuboShell", "EggStreme", "Bazuka",
]

TOPIC_TAG_PATTERNS = {
    tag: re.compile(pattern, re.IGNORECASE)
    for tag, pattern in TOPIC_TAG_RULES.items()
}


def _name_pattern(names):
    return re.compile(
        r"\b(" + "|".join(re.escape(name) for name in names) + r")\b",
        re.IGNORECASE
    )


ACTOR_PATTERN = _name_pattern(ACTOR_NAMES)
MALWARE_PATTERN = _name_pattern(MALWARE_NAMES)

ACTOR_CANONICAL = {name.lower(): name for name in ACTOR_NAMES}
MALWARE_CANONICAL = {name.lower(): name for name in MALWARE_NAMES}

# Numbered actor designations: APT28, UNC5221, FIN7, TA505, Storm-1234.
# Case-sensitive on purpose so ordinary words are not matched.
GENERIC_ACTOR_PATTERN = re.compile(
    r"\b(?:APT|UNC|UAT|FIN|TA)-?\d{1,4}\b|\bStorm-\d{3,4}\b"
)


def detect_tags(title, summary):
    """
    Return up to MAX_TAGS tags: named actors first, then malware
    families, then topics and techniques.
    """

    text = f"{title} {summary}"

    tags = []

    def add(tag):
        if tag not in tags:
            tags.append(tag)

    for match in GENERIC_ACTOR_PATTERN.finditer(text):
        add(match.group(0).upper().replace("-", ""))

    for match in ACTOR_PATTERN.finditer(text):
        add(ACTOR_CANONICAL[match.group(1).lower()])

    for match in MALWARE_PATTERN.finditer(text):
        add(MALWARE_CANONICAL[match.group(1).lower()])

    for tag, pattern in TOPIC_TAG_PATTERNS.items():
        if pattern.search(text):
            add(tag)

    return tags[:MAX_TAGS]


# =========================================
# ARTICLE CATEGORIZATION - VERSION 2
# =========================================

MINIMUM_CLASSIFICATION_SCORE = 5

STRONG_TITLE_WEIGHT = 10
STRONG_SUMMARY_WEIGHT = 4
KEYWORD_TITLE_WEIGHT = 5
KEYWORD_SUMMARY_WEIGHT = 1


def get_non_overlapping_matches(text, weighted_patterns):
    """
    Find the best non-overlapping matches in one text field.

    weighted_patterns is a list of (compiled_pattern, points, tier)
    covering BOTH the strong and keyword tiers together, so a phrase
    such as "ransomware attack" is scored once (as the longer, stronger
    match) instead of also earning points for "ransomware".

    Each rule counts at most once per field, so a word repeated in a
    long summary cannot add points over and over.

    Returns (selected_matches, ids_of_all_patterns_that_matched).
    """

    candidates = []

    for pattern, points, tier in weighted_patterns:

        match = pattern.search(text)

        if match and match.end() > match.start():

            candidates.append({
                "start": match.start(),
                "end": match.end(),
                "length": match.end() - match.start(),
                "match": match,
                "points": points,
                "tier": tier,
                "pattern": pattern
            })

    # Prefer longer, more specific matches. If lengths are equal,
    # prefer the match with the higher point value.
    candidates.sort(
        key=lambda item: (
            -item["length"],
            -item["points"],
            item["start"]
        )
    )

    selected = []

    for candidate in candidates:

        overlaps = any(
            candidate["start"] < chosen["end"]
            and candidate["end"] > chosen["start"]
            for chosen in selected
        )

        if not overlaps:
            selected.append(candidate)

    matched_ids = {id(item["pattern"]) for item in candidates}

    return sorted(selected, key=lambda item: item["start"]), matched_ids


def estimate_confidence(best_score, score_margin, kinds):
    """
    Rule-based confidence that looks at the TYPE of evidence as well as
    the score and the margin over the runner-up.

    kinds counts the matches behind the winning category, keyed by
    (field, tier), e.g. ("Title", "strong").

    Returns (confidence_label, short_explanation).
    """

    strong_title = kinds[("Title", "strong")]
    keyword_title = kinds[("Title", "keywords")]
    strong_summary = kinds[("Summary", "strong")]

    title_hits = strong_title + keyword_title
    strong_hits = strong_title + strong_summary

    # Start from score and margin.
    if best_score >= 12 and score_margin >= 4:
        level = 2
    elif best_score >= 7 and score_margin >= 2:
        level = 1
    else:
        level = 0

    # Evidence-quality adjustments.
    if level == 2 and title_hits == 0:
        level = 1                      # nothing in the headline

    elif level == 2 and strong_hits == 0 and keyword_title < 2:
        level = 1                      # only generic keywords

    if level == 1 and strong_title >= 1 and score_margin >= 8:
        level = 2                      # a specific headline phrase and
                                       # no real competitor

    if strong_title:
        note = "a specific phrase in the headline"
    elif keyword_title:
        note = "keywords in the headline"
    elif strong_summary:
        note = "specific phrases in the summary only"
    else:
        note = "only generic keywords in the summary"

    return ("Low", "Medium", "High")[level], note


def categorize_article(title, summary):
    """
    Classify an article using weighted title and summary evidence.

    Returns a dict with:
        category              primary category
        category_reason       multi-line explanation for the dashboard
        secondary_categories  up to two additional relevant categories
        confidence            "High", "Medium" or "Low"
        tags                  topic / actor / malware / technique tags

    Confidence is a rule-based estimate, not a statistical probability.
    """

    title_text = clean_summary(title)
    summary_text = clean_summary(summary)

    tags = detect_tags(title_text, summary_text)

    scores = {}
    evidence = {}
    evidence_kinds = {}

    for category, rule_groups in COMPILED_RULES.items():

        title_rules = []
        summary_rules = []

        for group_name, patterns in rule_groups.items():

            if group_name == "strong":
                title_points = STRONG_TITLE_WEIGHT
                summary_points = STRONG_SUMMARY_WEIGHT
            else:
                title_points = KEYWORD_TITLE_WEIGHT
                summary_points = KEYWORD_SUMMARY_WEIGHT

            for pattern in patterns:
                title_rules.append((pattern, title_points, group_name))
                summary_rules.append((pattern, summary_points, group_name))

        title_matches, title_matched_ids = get_non_overlapping_matches(
            title_text,
            title_rules
        )

        # A rule that matched in the title is not counted again.
        summary_rules = [
            rule for rule in summary_rules
            if id(rule[0]) not in title_matched_ids
        ]

        summary_matches, _ = get_non_overlapping_matches(
            summary_text,
            summary_rules
        )

        category_score = 0
        kinds = Counter()
        entries = []

        for field, matches in (
            ("Title", title_matches),
            ("Summary", summary_matches)
        ):

            for item in matches:

                category_score += item["points"]
                kinds[(field, item["tier"])] += 1

                entries.append((
                    item["points"],
                    f"{field}: '{item['match'].group(0)}' "
                    f"(+{item['points']})"
                ))

        # Strongest evidence first.
        entries.sort(key=lambda entry: -entry[0])

        scores[category] = category_score
        evidence[category] = [text for _, text in entries]
        evidence_kinds[category] = kinds

    # Sort by score. The category insertion order provides a stable
    # tie-break, but a close score will reduce the confidence level.
    ranked_categories = sorted(
        scores.items(),
        key=lambda item: item[1],
        reverse=True
    )

    best_category, best_score = ranked_categories[0]
    runner_up, second_score = ranked_categories[1]

    topics_line = (
        "Topics detected: " + ", ".join(tags) if tags else ""
    )

    # Do not force a weak match into a specific category.
    if best_score < MINIMUM_CLASSIFICATION_SCORE:

        if best_score > 0:
            reason = (
                f"No category reached the minimum score of "
                f"{MINIMUM_CLASSIFICATION_SCORE} "
                f"(closest was {best_category} with {best_score})."
            )
        else:
            reason = "No category-specific indicators were found."

        if topics_line:
            reason += "\n" + topics_line

        return {
            "category": "Other",
            "category_reason": reason,
            "secondary_categories": [],
            "confidence": "Low",
            "tags": tags
        }

    # =====================================
    # CONFIDENCE ESTIMATE
    # =====================================

    score_margin = best_score - second_score

    confidence, evidence_note = estimate_confidence(
        best_score,
        score_margin,
        evidence_kinds[best_category]
    )

    # =====================================
    # SECONDARY CATEGORIES
    # =====================================
    #
    # A secondary category must have meaningful evidence and reach
    # a reasonable proportion of the primary category's score.
    # This avoids adding categories from a single weak summary match.
    # =====================================

    secondary_categories = []

    secondary_minimum = max(
        5,
        best_score * 0.30
    )

    for category, score in ranked_categories[1:]:

        if score >= secondary_minimum:
            secondary_categories.append(category)

        if len(secondary_categories) == 2:
            break

    # =====================================
    # BUILD CLASSIFICATION EXPLANATION
    # =====================================

    if second_score > 0:
        margin_note = (
            f"it leads {runner_up} ({second_score}) "
            f"by {score_margin} points"
        )
    else:
        margin_note = "no other category matched"

    lines = [
        f"Classified as {best_category} "
        f"({confidence} confidence, score {best_score}).",

        f"Why: {evidence_note}; {margin_note}.",

        "Key evidence: " + "; ".join(evidence[best_category][:4])
    ]

    if secondary_categories:
        lines.append(
            "Also relevant: "
            + ", ".join(
                f"{category} ({scores[category]})"
                for category in secondary_categories
            )
        )

    if topics_line:
        lines.append(topics_line)

    return {
        "category": best_category,
        "category_reason": "\n".join(lines),
        "secondary_categories": secondary_categories,
        "confidence": confidence,
        "tags": tags
    }


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


def parse_iso_date(value):
    """Parse an ISO date string from feeds.json into UTC, or None."""

    if not value or not isinstance(value, str):
        return None

    try:

        date = datetime.fromisoformat(value.replace("Z", "+00:00"))

    except ValueError:

        return None

    if date.tzinfo is None:
        date = date.replace(tzinfo=timezone.utc)

    return date.astimezone(timezone.utc)


# =========================================
# CHECK RSS FEED
# =========================================

def check_feed(feed, source_name):

    status = getattr(feed, "status", None)

    # Only 4xx/5xx are failures. Redirects (301/302) still carry articles.
    if status is not None and status >= 400:

        print(
            f"{source_name} is unavailable. HTTP Status: {status}"
        )

        return False

    if not feed.entries:

        print(f"{source_name} returned no articles.")

        return False

    return True


# =========================================
# BUILD ARTICLE RECORD
# =========================================

def build_article(title, source_name, published_iso, url, summary):
    """Create one feeds.json record, including all classification fields."""

    result = categorize_article(title, summary)

    return {

        "title": title,

        "source": source_name,

        "published": published_iso,

        "url": url,

        "summary": summary,

        "category": result["category"],

        "category_reason": result["category_reason"],

        "secondary_categories": result["secondary_categories"],

        "tags": result["tags"],

        "confidence": result["confidence"]
    }


def url_key(url):
    """Normalized key used to recognise the same article across runs."""

    return url.strip().rstrip("/")


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

        print(feed.get("bozo_exception"))

    if hasattr(feed, "status"):

        print(
            f"{source_name} HTTP Status:",
            feed.status
        )

    if check_feed(feed, source_name):

        for article in feed.entries:

            published_date = get_published_date(article)

            # Skip articles without valid dates.
            if not published_date:
                continue

            # Keep articles inside the retention window.
            if retention_cutoff <= published_date <= now:

                title = (article.get("title") or "").strip()

                url = (article.get("link") or "").strip()

                summary = clean_summary(
                    article.get("summary", "")
                )

                # Skip incomplete articles.
                if not title or not url:
                    continue

                feed_articles.append(
                    build_article(
                        title,
                        source_name,
                        published_date.isoformat(),
                        url,
                        summary
                    )
                )

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
# MERGE WITH EXISTING feeds.json
# =========================================

def load_existing_articles(path):
    """Read the previous feeds.json, or return [] if unusable."""

    if not os.path.exists(path):
        return []

    try:

        with open(path, encoding="utf-8") as file:
            data = json.load(file)

    except (OSError, ValueError) as error:

        print(f"Could not read existing {path}: {error}")

        return []

    if not isinstance(data, list):
        return []

    return [item for item in data if isinstance(item, dict)]


def merge_with_existing(new_articles, existing_articles):
    """
    Combine freshly collected articles with the previous feeds.json.

    * Old articles inside the retention window are kept, and are
      re-classified so rule improvements apply to them too.
    * Articles older than DAYS_TO_KEEP are removed.
    * The same URL is only stored once; the fresh copy wins.

    Returns (articles, stats).
    """

    merged = {}

    stats = {
        "existing_kept": 0,
        "expired": 0,
        "invalid": 0,
        "new_added": 0,
        "refreshed": 0
    }

    for article in existing_articles:

        title = (article.get("title") or "").strip()
        url = (article.get("url") or "").strip()
        published = parse_iso_date(article.get("published"))

        if not title or not url or not published:
            stats["invalid"] += 1
            continue

        if published < retention_cutoff:
            stats["expired"] += 1
            continue

        merged[url_key(url)] = build_article(
            title,
            article.get("source") or "Unknown Source",
            published.isoformat(),
            url,
            clean_summary(article.get("summary", ""))
        )

        stats["existing_kept"] += 1

    for article in new_articles:

        key = url_key(article["url"])

        if key in merged:
            stats["refreshed"] += 1
            stats["existing_kept"] -= 1
        else:
            stats["new_added"] += 1

        merged[key] = article

    return list(merged.values()), stats


def save_json(articles, path):
    """Write atomically so a crash never leaves a half-written file."""

    directory = os.path.dirname(os.path.abspath(path))

    handle, temp_path = tempfile.mkstemp(dir=directory, suffix=".tmp")

    try:

        with os.fdopen(handle, "w", encoding="utf-8") as file:

            json.dump(
                articles,
                file,
                indent=4,
                ensure_ascii=False
            )

        os.replace(temp_path, path)

    except Exception:

        if os.path.exists(temp_path):
            os.remove(temp_path)

        raise


# =========================================
# MAIN
# =========================================

def main():

    socket.setdefaulttimeout(REQUEST_TIMEOUT)

    # -------- collect --------

    new_articles = []

    for source in rss_sources:

        new_articles.extend(
            process_feed(
                source["url"],
                source["name"]
            )
        )

    # -------- merge with history --------

    existing_articles = load_existing_articles(OUTPUT_FILE)

    articles, merge_stats = merge_with_existing(
        new_articles,
        existing_articles
    )

    articles.sort(
        key=lambda article: article["published"],
        reverse=True
    )

    # -------- save --------

    if articles:

        save_json(articles, OUTPUT_FILE)

        print("\nArticles saved successfully!")

    else:

        print(
            "\nNo articles collected. Existing JSON file preserved."
        )

    # -------- summary --------

    print("\n========== COLLECTION SUMMARY ==========")

    print("Total Sources:", len(rss_sources))

    print("Retention window:", f"{DAYS_TO_KEEP} days")

    print("Collected this run:", len(new_articles))

    print("New articles added:", merge_stats["new_added"])

    print("Already known (refreshed):", merge_stats["refreshed"])

    print("Kept from previous file:", merge_stats["existing_kept"])

    print("Expired and removed:", merge_stats["expired"])

    if merge_stats["invalid"]:
        print("Invalid old entries dropped:", merge_stats["invalid"])

    print("Total in feeds.json:", len(articles))

    if articles:

        print("\nPRIMARY CATEGORY DISTRIBUTION:")

        for category, count in Counter(
            article["category"] for article in articles
        ).most_common():

            print(f"{category}: {count}")

        print("\nCLASSIFICATION CONFIDENCE:")

        confidence_counts = Counter(
            article["confidence"] for article in articles
        )

        for level in ("High", "Medium", "Low"):

            print(f"{level}: {confidence_counts.get(level, 0)}")

        print("\nTOP TAGS:")

        tag_counts = Counter(
            tag for article in articles for tag in article["tags"]
        )

        for tag, count in tag_counts.most_common(10):

            print(f"{tag}: {count}")

    print("========================================")


if __name__ == "__main__":
    main()