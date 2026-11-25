# 🛡️ CyberPulse — Intelligence Sources

CyberPulse aggregates cybersecurity news and threat intelligence from **7 trusted industry sources** using RSS feeds.

Our goal is to provide a centralized view of the latest cybersecurity developments, including vulnerabilities, ransomware, malware, data breaches, threat actors, and security updates.

**Live Dashboard:** [Open CyberPulse](https://varunnshenoy.github.io/Cyber-Pulse/)

## Overview

CyberPulse helps security enthusiasts and professionals stay informed about the latest cybersecurity threats, vulnerabilities, malware, ransomware, and data breaches.
---

## 🌐 News Sources

| # | Source | Coverage | RSS Feed |
|---|---|---|---|
| 01 | **The Hacker News** | Cybersecurity news, vulnerabilities, attacks and threat intelligence | [RSS ↗](https://feeds.feedburner.com/TheHackersNews) |
| 02 | **BleepingComputer** | Malware, ransomware, vulnerabilities and security incidents | [RSS ↗](https://www.bleepingcomputer.com/feed/) |
| 03 | **Cisco Talos** | Threat research, malware analysis and threat intelligence | [RSS ↗](https://blog.talosintelligence.com/rss/) |
| 04 | **Palo Alto Networks Unit 42** | Threat actor research, incident response and malware investigations | [RSS ↗](https://unit42.paloaltonetworks.com/feed/) |
| 05 | **The DFIR Report** | Digital forensics, incident response and attack investigations | [RSS ↗](https://thedfirreport.com/feed/) |
| 06 | **Zero Day Initiative (ZDI)** | Zero-day vulnerabilities, security advisories and vulnerability research | [RSS ↗](https://www.zerodayinitiative.com/rss/published/) |
| 07 | **Krebs on Security** | Cybercrime investigations, data breaches and security reporting | [RSS ↗](https://krebsonsecurity.com/feed/) |

---

## 📊 Source Coverage

| Intelligence Area | Primary Sources |
|---|---|
| Vulnerabilities | Zero Day Initiative, The Hacker News, BleepingComputer |
| Ransomware | BleepingComputer, The DFIR Report |
| Data Breaches | Krebs on Security, The Hacker News |
| Malware | Cisco Talos, Unit 42, BleepingComputer |
| Threat Actors | Unit 42, Cisco Talos, The DFIR Report |
| Security Updates | Zero Day Initiative, BleepingComputer |

*Sources can contribute to multiple intelligence categories.*

---

## ⚙️ RSS Collection Pipeline

CyberPulse uses Python and RSS feeds to automate news collection.

```text
       RSS NEWS SOURCES
              │
              ▼
       fetch_feeds.py
              │
              ▼
      Parse RSS Articles
              │
              ▼
       Filter Last 7 Days
              │
              ▼
       Remove Duplicates
              │
              ▼
       Categorize Articles
              │
              ▼
          feeds.json
              │
              ▼
       CyberPulse Dashboard
```

### Collection Features

- Automated RSS feed monitoring
- Seven-day article filtering
- Duplicate article removal
- Keyword-based categorization
- Centralized JSON data storage
- Automated GitHub Actions updates

---

## 📈 Latest Collection Snapshot

**Last recorded successful collection: November 24, 2026**

| Metric | Result |
|---|---:|
| Configured Sources | 7 |
| Articles Before Deduplication | 103 |
| Articles After Deduplication | 103 |
| Duplicates Removed | 0 |

---

## ⚠️ Disclaimer

CyberPulse collects publicly available cybersecurity news from third-party publishers. Original articles remain the property of their respective publishers.

CyberPulse is an independent learning project and is not affiliated with the listed organizations.

**Stay informed. Stay ahead of cyber threats.** 🛡️