#!/usr/bin/env python3
"""
digest.py — fetch, cluster, score, and print discussion about a topic from
Reddit and Hacker News.

Usage:
    python digest.py "Switch 2 price"
    python digest.py "Switch 2 price" --limit 15
"""

import argparse
import json
import math
import os
import sys
from datetime import datetime, timezone
from difflib import SequenceMatcher
from pathlib import Path

import yaml

import anthropic
import requests
from dotenv import load_dotenv

load_dotenv("local.env")

MODEL = "claude-opus-4-8"

REDDIT_SEARCH_URL = "https://www.reddit.com/search.json"
HN_SEARCH_URL = "http://hn.algolia.com/api/v1/search"
YOUTUBE_SEARCH_URL = "https://www.googleapis.com/youtube/v3/search"
YOUTUBE_VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos"
X_SEARCH_URL = "https://api.twitter.com/2/tweets/search/recent"

HEADERS = {"User-Agent": "topic-digest-script/0.1 (personal project)"}

TITLE_SIMILARITY_THRESHOLD = 0.6
RECENCY_HALF_LIFE_DAYS = 7.0  # composite score halves every 7 days

SEEN_CACHE = Path.home() / ".lowpass_seen.json"
SEEN_TTL_DAYS = 30
TOPICS_CONFIG = Path("topics.yaml")


# ---------------------------------------------------------------------------
# Fetchers
# ---------------------------------------------------------------------------

def fetch_reddit_trending(limit: int = 25):
    """Top posts from r/popular in the past 24 hours — no topic query."""
    try:
        resp = requests.get(
            "https://www.reddit.com/r/popular/top.json",
            headers=HEADERS,
            params={"t": "day", "limit": limit},
            timeout=10,
        )
        resp.raise_for_status()
    except requests.RequestException as e:
        print(f"[reddit] trending fetch failed: {e}", file=sys.stderr)
        return []

    posts = []
    for child in resp.json().get("data", {}).get("children", []):
        d = child.get("data", {})
        preview_images = d.get("preview", {}).get("images", [])
        image_url = None
        if preview_images:
            src = preview_images[0].get("source", {}).get("url", "")
            image_url = src.replace("&amp;", "&") if src else None
        if not image_url:
            thumb = d.get("thumbnail", "")
            if thumb and thumb.startswith("http"):
                image_url = thumb
        posts.append({
            "source": "reddit",
            "title": d.get("title"),
            "subreddit": d.get("subreddit"),
            "score": d.get("score", 0),
            "num_comments": d.get("num_comments", 0),
            "url": f"https://reddit.com{d.get('permalink', '')}",
            "created_utc": d.get("created_utc"),
            "selftext": (d.get("selftext") or "")[:500],
            "image_url": image_url,
        })
    return posts


def fetch_hn_trending(limit: int = 25):
    """Top HN stories posted in the past 24 hours, sorted by points."""
    import time
    since = int(time.time()) - 86400
    params = {
        "tags": "story",
        "numericFilters": f"created_at_i>{since}",
        "hitsPerPage": limit,
    }
    try:
        resp = requests.get(HN_SEARCH_URL, params=params, timeout=10)
        resp.raise_for_status()
    except requests.RequestException as e:
        print(f"[hn] trending fetch failed: {e}", file=sys.stderr)
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
            "selftext": "",
        })
    # Sort by raw engagement (points + 2 * comments) since all are recent
    posts.sort(key=lambda p: p["score"] + 2 * p["num_comments"], reverse=True)
    return posts


def fetch_reddit(topic: str, limit: int = 10):
    params = {"q": topic, "sort": "top", "t": "month", "limit": limit}
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
            "selftext": (d.get("selftext") or "")[:500],
        })
    return posts


def fetch_hn(topic: str, limit: int = 10):
    params = {"query": topic, "tags": "story", "hitsPerPage": limit}
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
            "selftext": "",
        })
    return posts


def fetch_youtube(topic: str, limit: int = 10):
    api_key = os.environ.get("YOUTUBE_API_KEY")
    if not api_key:
        return []

    try:
        search_resp = requests.get(YOUTUBE_SEARCH_URL, params={
            "q": topic, "part": "snippet", "type": "video",
            "order": "relevance", "maxResults": limit, "key": api_key,
        }, timeout=10)
        search_resp.raise_for_status()
    except requests.RequestException as e:
        print(f"[youtube] fetch failed: {e}", file=sys.stderr)
        return []

    items = search_resp.json().get("items", [])
    if not items:
        return []

    video_ids = [item["id"]["videoId"] for item in items]
    snippets = {item["id"]["videoId"]: item["snippet"] for item in items}

    try:
        stats_resp = requests.get(YOUTUBE_VIDEOS_URL, params={
            "id": ",".join(video_ids), "part": "statistics", "key": api_key,
        }, timeout=10)
        stats_resp.raise_for_status()
        stats = {v["id"]: v["statistics"] for v in stats_resp.json().get("items", [])}
    except requests.RequestException as e:
        print(f"[youtube] stats fetch failed: {e}", file=sys.stderr)
        stats = {}

    posts = []
    for video_id in video_ids:
        snippet = snippets[video_id]
        s = stats.get(video_id, {})
        published = snippet.get("publishedAt")
        created_utc = (
            datetime.fromisoformat(published.replace("Z", "+00:00")).timestamp()
            if published else None
        )
        posts.append({
            "source": "youtube",
            "title": snippet.get("title"),
            "subreddit": None,
            "score": int(s.get("likeCount") or 0),
            "num_comments": int(s.get("commentCount") or 0),
            "url": f"https://www.youtube.com/watch?v={video_id}",
            "created_utc": created_utc,
            "selftext": (snippet.get("description") or "")[:500],
        })
    return posts


def fetch_x(topic: str, limit: int = 10):
    bearer_token = os.environ.get("X_BEARER_TOKEN")
    if not bearer_token:
        return []

    try:
        resp = requests.get(X_SEARCH_URL, params={
            "query": f"{topic} -is:retweet lang:en",
            "max_results": max(10, min(limit, 100)),
            "tweet.fields": "public_metrics,created_at,text",
        }, headers={"Authorization": f"Bearer {bearer_token}"}, timeout=10)
        resp.raise_for_status()
    except requests.RequestException as e:
        print(f"[x] fetch failed: {e}", file=sys.stderr)
        return []

    posts = []
    for tweet in resp.json().get("data", []):
        metrics = tweet.get("public_metrics", {})
        created_at = tweet.get("created_at")
        created_utc = (
            datetime.fromisoformat(created_at.replace("Z", "+00:00")).timestamp()
            if created_at else None
        )
        text = tweet.get("text", "")
        posts.append({
            "source": "x",
            "title": text[:120] + ("…" if len(text) > 120 else ""),
            "subreddit": None,
            "score": metrics.get("like_count", 0),
            "num_comments": metrics.get("reply_count", 0),
            "url": f"https://x.com/i/web/status/{tweet['id']}",
            "created_utc": created_utc,
            "selftext": text,
        })
    return posts


# ---------------------------------------------------------------------------
# Clustering (Step 2)
# ---------------------------------------------------------------------------

def _normalize_url(url: str) -> str:
    return url.rstrip("/").lower()


def _title_similarity(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


def _should_merge(c1: list, c2: list) -> bool:
    urls1 = {_normalize_url(p["url"]) for p in c1}
    urls2 = {_normalize_url(p["url"]) for p in c2}
    if urls1 & urls2:
        return True
    for p1 in c1:
        for p2 in c2:
            if _title_similarity(p1["title"] or "", p2["title"] or "") >= TITLE_SIMILARITY_THRESHOLD:
                return True
    return False


def cluster_posts(posts: list) -> list:
    """Merge near-duplicate posts (same URL or similar title) into clusters."""
    clusters = [[p] for p in posts]

    # Iteratively merge until no more merges are possible.
    merged = True
    while merged:
        merged = False
        for i in range(len(clusters)):
            for j in range(i + 1, len(clusters)):
                if _should_merge(clusters[i], clusters[j]):
                    clusters[i].extend(clusters[j])
                    clusters.pop(j)
                    merged = True
                    break
            if merged:
                break

    return clusters


# ---------------------------------------------------------------------------
# Scoring (Step 3)
# ---------------------------------------------------------------------------

def _recency_decay(created_utc) -> float:
    if not created_utc:
        return 0.5
    age_days = (
        datetime.now(timezone.utc)
        - datetime.fromtimestamp(created_utc, tz=timezone.utc)
    ).total_seconds() / 86400
    lam = math.log(2) / RECENCY_HALF_LIFE_DAYS
    return math.exp(-lam * age_days)


def _post_engagement(post: dict) -> float:
    # Comments weighted 2× — they signal active discussion, not just upvotes.
    return post["score"] + 2 * post["num_comments"]


def score_cluster(cluster: list) -> float:
    return sum(_post_engagement(p) * _recency_decay(p["created_utc"]) for p in cluster)


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------

def _format_age(created_utc) -> str:
    if not created_utc:
        return "unknown"
    delta = datetime.now(timezone.utc) - datetime.fromtimestamp(created_utc, tz=timezone.utc)
    hours = delta.total_seconds() / 3600
    if hours < 24:
        return f"{int(hours)}h ago"
    return f"{int(hours // 24)}d ago"


def _cluster_representative(cluster: list) -> dict:
    """Post with the highest raw engagement — used as the cluster headline."""
    return max(cluster, key=_post_engagement)


def print_clusters(clusters: list) -> None:
    if not clusters:
        print("  (nothing found)")
        return

    ranked = sorted(clusters, key=score_cluster, reverse=True)

    for rank, cluster in enumerate(ranked, start=1):
        rep = _cluster_representative(cluster)
        sources = sorted({p["source"] for p in cluster})
        source_tag = "+".join(sources)
        multi_source = len(sources) > 1
        total_engagement = sum(_post_engagement(p) for p in cluster)
        composite = score_cluster(cluster)

        flag = " [cross-platform]" if multi_source else " [single-source]"
        print(f"  #{rank}  score={composite:.0f}  engagement={total_engagement:.0f}  [{source_tag}]{flag}")
        print(f"    {rep['title']}")

        # Show alternate titles if the cluster spans multiple distinct titles.
        alt_titles = [
            p["title"] for p in cluster
            if p is not rep and _title_similarity(p["title"] or "", rep["title"] or "") < 0.9
        ]
        for t in alt_titles:
            print(f"    ~ {t}")

        print(f"    {rep['url']}  ({_format_age(rep['created_utc'])})")
        if rep.get("selftext"):
            print(f"    > {rep['selftext'][:200].strip()}...")
        print()


# ---------------------------------------------------------------------------
# Seen cache (Step 4)
# ---------------------------------------------------------------------------

def _cluster_key(cluster: list) -> str:
    return _normalize_url(_cluster_representative(cluster)["url"])


def load_seen() -> dict:
    if not SEEN_CACHE.exists():
        return {}
    try:
        return json.loads(SEEN_CACHE.read_text())
    except (json.JSONDecodeError, OSError):
        return {}


def save_seen(seen: dict) -> None:
    cutoff = datetime.now(timezone.utc).timestamp() - SEEN_TTL_DAYS * 86400
    pruned = {k: v for k, v in seen.items() if v >= cutoff}
    SEEN_CACHE.write_text(json.dumps(pruned, indent=2))


def mark_seen(clusters: list, seen: dict) -> None:
    now = datetime.now(timezone.utc).timestamp()
    for cluster in clusters:
        seen[_cluster_key(cluster)] = now
    save_seen(seen)


def load_topics() -> list:
    if not TOPICS_CONFIG.exists():
        return []
    try:
        data = yaml.safe_load(TOPICS_CONFIG.read_text()) or {}
        return data.get("topics", [])
    except Exception as e:
        print(f"[config] failed to load {TOPICS_CONFIG}: {e}", file=sys.stderr)
        return []


# ---------------------------------------------------------------------------
# LLM synthesis (Step 3)
# ---------------------------------------------------------------------------

def _format_post_for_llm(post: dict) -> str:
    source = post["source"]
    sub = f" r/{post['subreddit']}" if post.get("subreddit") else ""
    age = _format_age(post["created_utc"])
    eng = f"{post['score']} pts, {post['num_comments']} comments"
    text = f"[{source}{sub}] {post['title']}\n  {eng} | {age} | {post['url']}"
    if post.get("selftext"):
        text += f"\n  > {post['selftext'][:300].strip()}"
    return text


def synthesize_cluster(client: anthropic.Anthropic, cluster: list, rank: int, focus: str = "") -> str:
    posts_text = "\n\n".join(
        _format_post_for_llm(p)
        for p in sorted(cluster, key=_post_engagement, reverse=True)
    )
    focus_line = f"\nReader preference: {focus}" if focus else ""
    prompt = (
        f"You are writing a personal digest entry.{focus_line} Based ONLY on the posts below, "
        f"write 2–3 sentences summarizing what people are actually discussing. "
        f"Cite concrete signals (upvote counts, comment counts) where they add weight. "
        f"Do not add any facts not present in the posts.\n\n"
        f"POSTS:\n{posts_text}\n\n"
        f"Summary:"
    )
    with client.messages.stream(
        model=MODEL,
        max_tokens=256,
        messages=[{"role": "user", "content": prompt}],
    ) as stream:
        return stream.get_final_message().content[0].text.strip()


def synthesize_digest(client: anthropic.Anthropic, summaries: list, topic: str) -> str:
    joined = "\n\n".join(f"Cluster {rank}: {s}" for rank, s in summaries)
    prompt = (
        f"Below are summaries of the top discussion clusters about \"{topic}\". "
        f"In 3–5 sentences identify the 2–3 most important cross-cutting themes, "
        f"tensions, or patterns. Be specific — only draw on what the summaries say.\n\n"
        f"SUMMARIES:\n{joined}\n\n"
        f"Themes:"
    )
    with client.messages.stream(
        model=MODEL,
        max_tokens=400,
        messages=[{"role": "user", "content": prompt}],
    ) as stream:
        return stream.get_final_message().content[0].text.strip()


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def run_topic(client, seen: dict, topic: str, limit: int, focus: str = "") -> None:
    print(f"\n{'=' * 60}")
    print(f"TOPIC: {topic}")
    print("=" * 60)

    reddit_posts = fetch_reddit(topic, limit)
    hn_posts = fetch_hn(topic, limit)
    youtube_posts = fetch_youtube(topic, limit)
    x_posts = fetch_x(topic, limit)
    all_posts = reddit_posts + hn_posts + youtube_posts + x_posts

    if not all_posts:
        print("  (no posts found)")
        return

    clusters = cluster_posts(all_posts)
    print_clusters(clusters)
    counts = (f"{len(reddit_posts)} Reddit, {len(hn_posts)} HN, "
              f"{len(youtube_posts)} YouTube, {len(x_posts)} X")
    print(f"  {len(all_posts)} posts → {len(clusters)} clusters ({counts}).")

    if client is None:
        return

    ranked = sorted(clusters, key=score_cluster, reverse=True)
    new_clusters = [c for c in ranked if _cluster_key(c) not in seen]
    skipped = len(ranked) - len(new_clusters)

    if skipped:
        print(f"  ({skipped} cluster(s) already seen — skipping)")

    if not new_clusters:
        print("  Nothing new since your last run.")
        return

    top = new_clusters[:5]

    print("\n  DIGEST")
    print("  " + "-" * 40)

    summaries = []
    for rank, cluster in enumerate(top, start=1):
        rep = _cluster_representative(cluster)
        print(f"\n  #{rank} — {rep['title']}")
        print("    Summarizing...", end="\r")
        summary = synthesize_cluster(client, cluster, rank, focus)
        print(f"    {summary}")
        summaries.append((rank, summary))

    mark_seen(top, seen)

    if len(summaries) > 1:
        print("\n  THEMES")
        print("  " + "-" * 40 + "\n")
        themes = synthesize_digest(client, summaries, topic)
        print(f"  {themes}")


def main():
    parser = argparse.ArgumentParser(
        description="Fetch and digest discussion about topics from Reddit and HN."
    )
    parser.add_argument(
        "topic", nargs="?",
        help="Topic to search (omit to use topics.yaml)"
    )
    parser.add_argument("--limit", type=int, default=10, help="Max results per source (default: 10)")
    args = parser.parse_args()

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    client = anthropic.Anthropic(api_key=api_key) if api_key else None
    if not client:
        print("(Set ANTHROPIC_API_KEY to enable LLM synthesis.)", file=sys.stderr)

    seen = load_seen()

    if args.topic:
        run_topic(client, seen, args.topic, args.limit)
    else:
        topics = load_topics()
        if not topics:
            print(f"No topics configured. Create {TOPICS_CONFIG} or pass a topic as an argument.\n"
                  f"Example topics.yaml:\n\n"
                  f"  topics:\n"
                  f"    - query: \"AI safety\"\n"
                  f"      focus: \"focus on technical research, skip hype\"\n")
            return
        for entry in topics:
            run_topic(client, seen, entry["query"], args.limit, entry.get("focus", ""))


if __name__ == "__main__":
    main()
