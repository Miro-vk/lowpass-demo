#!/usr/bin/env python3
"""
digest.py — Phase 1: fetch raw discussion about a topic from Reddit and
Hacker News, and print it out. No summarization yet — the goal here is
just to confirm the raw data is good enough to be worth summarizing.

Usage:
    python digest.py "Switch 2 price"
    python digest.py "Switch 2 price" --limit 15
"""

import argparse
import sys
from datetime import datetime, timezone

import requests

REDDIT_SEARCH_URL = "https://www.reddit.com/search.json"
HN_SEARCH_URL = "http://hn.algolia.com/api/v1/search"

# Reddit requires a descriptive User-Agent or it will throttle/block you.
HEADERS = {"User-Agent": "topic-digest-script/0.1 (personal project)"}


def fetch_reddit(topic: str, limit: int = 10):
    """Search Reddit for posts matching the topic, sorted by relevance,
    restricted to the last month. Returns a list of simple dicts."""
    params = {
        "q": topic,
        "sort": "top",
        "t": "month",
        "limit": limit,
    }
    try:
        resp = requests.get(REDDIT_SEARCH_URL, headers=HEADERS, params=params, timeout=10)
        resp.raise_for_status()
    except requests.RequestException as e:
        print(f"[reddit] fetch failed: {e}", file=sys.stderr)
        return []

    posts = []
    for child in resp.json().get("data", {}).get("children", []):
        d = child.get("data", {})
        posts.append({
            "source": "reddit",
            "title": d.get("title"),
            "subreddit": d.get("subreddit"),
            "score": d.get("score", 0),
            "num_comments": d.get("num_comments", 0),
            "url": f"https://reddit.com{d.get('permalink', '')}",
            "created_utc": d.get("created_utc"),
            "selftext": (d.get("selftext") or "")[:500],  # cap length for now
        })
    return posts


def fetch_hn(topic: str, limit: int = 10):
    """Search Hacker News via the Algolia API for stories matching the topic."""
    params = {
        "query": topic,
        "tags": "story",
        "hitsPerPage": limit,
    }
    try:
        resp = requests.get(HN_SEARCH_URL, params=params, timeout=10)
        resp.raise_for_status()
    except requests.RequestException as e:
        print(f"[hn] fetch failed: {e}", file=sys.stderr)
        return []

    posts = []
    for hit in resp.json().get("hits", []):
        posts.append({
            "source": "hackernews",
            "title": hit.get("title"),
            "score": hit.get("points", 0),
            "num_comments": hit.get("num_comments", 0),
            "url": hit.get("url") or f"https://news.ycombinator.com/item?id={hit.get('objectID')}",
            "created_utc": hit.get("created_at_i"),
            "selftext": "",  # HN search doesn't return story body text
        })
    return posts


def format_age(created_utc):
    if not created_utc:
        return "unknown"
    delta = datetime.now(timezone.utc) - datetime.fromtimestamp(created_utc, tz=timezone.utc)
    hours = delta.total_seconds() / 3600
    if hours < 24:
        return f"{int(hours)}h ago"
    return f"{int(hours // 24)}d ago"


def print_posts(posts, topic):
    if not posts:
        print("  (nothing found)")
        return
    # sort by engagement (score) descending so the most-discussed stuff is on top
    for p in sorted(posts, key=lambda x: x["score"], reverse=True):
        sub = f" r/{p['subreddit']}" if p.get("subreddit") else ""
        print(f"  [{p['score']:>5} pts | {p['num_comments']:>4} comments | {format_age(p['created_utc'])}]{sub}")
        print(f"    {p['title']}")
        print(f"    {p['url']}")
        if p.get("selftext"):
            print(f"    > {p['selftext'][:200].strip()}...")
        print()


def main():
    parser = argparse.ArgumentParser(description="Fetch raw discussion about a topic from Reddit and HN.")
    parser.add_argument("topic", help="Topic to search for, e.g. 'Switch 2 price'")
    parser.add_argument("--limit", type=int, default=10, help="Max results per source (default: 10)")
    args = parser.parse_args()

    print(f"\nFetching discussion about: \"{args.topic}\"\n")

    print("=" * 60)
    print("REDDIT")
    print("=" * 60)
    reddit_posts = fetch_reddit(args.topic, args.limit)
    print_posts(reddit_posts, args.topic)

    print("=" * 60)
    print("HACKER NEWS")
    print("=" * 60)
    hn_posts = fetch_hn(args.topic, args.limit)
    print_posts(hn_posts, args.topic)

    total = len(reddit_posts) + len(hn_posts)
    print(f"Done. {total} posts fetched ({len(reddit_posts)} Reddit, {len(hn_posts)} HN).")
    print("Next step: feed this into an LLM and see if the summary is actually useful.")


if __name__ == "__main__":
    main()