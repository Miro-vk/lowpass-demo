#!/usr/bin/env python3
"""
api.py — FastAPI server wrapping the digest logic.

Endpoints:
  POST /auth/signup       — create a new account
  POST /auth/login        — sign in, returns access_token
  GET  /topics            — list the user's topics
  POST /topics            — add a topic
  DELETE /topics/{id}     — remove a topic
  POST /digest            — run digest for the authenticated user's topics
"""

import os
import sys
import base64
import requests
from dotenv import load_dotenv
load_dotenv("local.env")

import anthropic
from fastapi import FastAPI, Depends, HTTPException, Header
from pydantic import BaseModel
from supabase import create_client, Client

from digest import (
    fetch_hn, fetch_youtube, fetch_x,
    fetch_hn_trending, fetch_nyt_trending,
    cluster_posts, score_cluster, _cluster_key,
    _cluster_representative, synthesize_cluster, synthesize_digest,
    normalize_source_scores,
)

CLAUDE_MODEL = "claude-sonnet-4-6"
CLAUDE_MODEL_FAST = "claude-haiku-4-5-20251001"

app = FastAPI(title="Lowpass Digest API")

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_ANON_KEY = os.environ["SUPABASE_ANON_KEY"]

# Auth endpoints need the bare project URL (no /rest/v1 path suffix).
# Support both "https://x.supabase.co" and "https://x.supabase.co/rest/v1/".
from urllib.parse import urlparse as _urlparse
_parsed = _urlparse(SUPABASE_URL)
SUPABASE_AUTH_URL = f"{_parsed.scheme}://{_parsed.netloc}"


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

class AuthIn(BaseModel):
    email: str
    password: str


def _auth_headers() -> dict:
    return {"apikey": SUPABASE_ANON_KEY, "Content-Type": "application/json"}


@app.post("/auth/signup", status_code=201)
def signup(body: AuthIn):
    r = requests.post(
        f"{SUPABASE_AUTH_URL}/auth/v1/signup",
        json={"email": body.email, "password": body.password},
        headers=_auth_headers(),
        timeout=10,
    )
    if not r.ok:
        data = r.json()
        msg = data.get("error_description") or data.get("msg") or data.get("error") or "Signup failed"
        raise HTTPException(status_code=400, detail=msg)
    return {"message": "Account created. Check your email to confirm before logging in."}


@app.post("/auth/login")
def login(body: AuthIn):
    r = requests.post(
        f"{SUPABASE_AUTH_URL}/auth/v1/token?grant_type=password",
        json={"email": body.email, "password": body.password},
        headers=_auth_headers(),
        timeout=10,
    )
    if not r.ok:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    data = r.json()
    return {
        "access_token": data["access_token"],
        "refresh_token": data.get("refresh_token", ""),
        "token_type": "bearer",
    }


class RefreshIn(BaseModel):
    refresh_token: str


@app.post("/auth/refresh")
def refresh(body: RefreshIn):
    r = requests.post(
        f"{SUPABASE_AUTH_URL}/auth/v1/token?grant_type=refresh_token",
        json={"refresh_token": body.refresh_token},
        headers=_auth_headers(),
        timeout=10,
    )
    if not r.ok:
        raise HTTPException(status_code=401, detail="Session expired, please log in again")
    data = r.json()
    return {
        "access_token": data["access_token"],
        "refresh_token": data.get("refresh_token", ""),
        "token_type": "bearer",
    }


class AuthedUser:
    def __init__(self, user_id: str, sb: Client):
        self.user_id = user_id
        self.sb = sb


def get_current_user(authorization: str = Header(...)) -> AuthedUser:
    """Validate the Bearer token and return a Supabase client scoped to that user."""
    token = authorization.removeprefix("Bearer ").strip()
    r = requests.get(
        f"{SUPABASE_AUTH_URL}/auth/v1/user",
        headers={**_auth_headers(), "Authorization": f"Bearer {token}"},
        timeout=10,
    )
    if not r.ok:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user_id = r.json().get("id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    sb = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    sb.postgrest.auth(token)
    return AuthedUser(user_id=user_id, sb=sb)


# ---------------------------------------------------------------------------
# Seen cache (Supabase-backed)
# ---------------------------------------------------------------------------

def load_seen_db(sb: Client, user_id: str) -> set:
    rows = sb.table("seen_clusters").select("cluster_key").eq("user_id", user_id).execute()
    return {r["cluster_key"] for r in rows.data}


def mark_seen_db(sb: Client, user_id: str, clusters: list) -> None:
    rows = [{"user_id": user_id, "cluster_key": _cluster_key(c)} for c in clusters]
    sb.table("seen_clusters").upsert(rows, on_conflict="user_id,cluster_key").execute()


# ---------------------------------------------------------------------------
# Digest endpoint
# ---------------------------------------------------------------------------

class DigestIn(BaseModel):
    topic: str
    focus: str = ""
    timeframe_days: int = 30


class ClusterSummary(BaseModel):
    rank: int
    title: str
    url: str
    sources: list[str]
    composite_score: float
    summary: str


class DigestResponse(BaseModel):
    topic: str
    clusters: list[ClusterSummary]
    themes: str


@app.post("/digest", response_model=list[DigestResponse])
def run_digest(body: DigestIn, user: AuthedUser = Depends(get_current_user)):
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY not configured on server")

    claude = anthropic.Anthropic(api_key=api_key)

    all_posts = (
        fetch_hn(body.topic, 10, body.timeframe_days) +
        fetch_youtube(body.topic, 10) +
        fetch_x(body.topic, 10)
    )
    if not all_posts:
        raise HTTPException(status_code=404, detail=f"No posts found for '{body.topic}'")

    clusters = cluster_posts(all_posts)
    ranked = sorted(clusters, key=score_cluster, reverse=True)
    top = ranked[:5]

    summaries = []
    cluster_out = []

    for rank, cluster in enumerate(top, start=1):
        rep = _cluster_representative(cluster)
        summary = synthesize_cluster(claude, cluster, rank, body.focus)
        summaries.append((rank, summary))
        cluster_out.append(ClusterSummary(
            rank=rank,
            title=rep["title"] or "",
            url=rep["url"],
            sources=sorted({p["source"] for p in cluster}),
            composite_score=round(score_cluster(cluster), 1),
            summary=summary,
        ))

    themes = synthesize_digest(claude, summaries, body.topic) if len(summaries) > 1 else ""
    return [DigestResponse(topic=body.topic, clusters=cluster_out, themes=themes)]


# ---------------------------------------------------------------------------
# Cards endpoints
# ---------------------------------------------------------------------------

class CardItem(BaseModel):
    id: str
    title: str
    tag: str
    snippet: str
    image_url: str | None = None
    source: str = ""


class SummarizeCardsIn(BaseModel):
    cards: list[dict]
    length_minutes: int = 5


_VALID_TAGS = {"AI", "TECH", "SCIENCE", "BUSINESS", "POLICY", "WORLD", "HEALTH", "CULTURE", "SECURITY", "OTHER"}
_BAD_SNIPPET_SIGNALS = ("unclear", "insufficient", "cannot determine", "no information", "not enough information")

_cards_cache: list | None = None
_cards_cache_ts: float = 0
_CARDS_TTL = 3600  # 1 hour


@app.get("/cards/daily", response_model=list[CardItem])
def get_daily_cards():
    """Top 10 most-engaged stories from the past 24 hours. No auth required."""
    import json as _json
    import time

    global _cards_cache, _cards_cache_ts
    if _cards_cache is not None and (time.time() - _cards_cache_ts) < _CARDS_TTL:
        return _cards_cache

    hn_posts = fetch_hn_trending(35)
    nyt_posts = fetch_nyt_trending(25)
    all_posts = (
        normalize_source_scores(hn_posts) +
        normalize_source_scores(nyt_posts)
    )

    if not all_posts:
        raise HTTPException(status_code=503, detail="Could not fetch stories right now")

    clusters = cluster_posts(all_posts)
    all_ranked = sorted(clusters, key=score_cluster, reverse=True)
    # Pre-filter clusters whose representative title is too short to be a real headline
    ranked = [
        c for c in all_ranked
        if len((_cluster_representative(c).get("title") or "").strip()) >= 8
    ][:20]

    titles = [_cluster_representative(c).get("title") or "" for c in ranked]

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    annotations = [{"tag": "OTHER", "snippet": ""}] * len(titles)

    if api_key:
        claude = anthropic.Anthropic(api_key=api_key)
        prompt = (
            "For each story title, return a JSON array (one object per story, same order).\n"
            "Each object must have:\n"
            '  "tag": one of AI, TECH, SCIENCE, BUSINESS, POLICY, WORLD, HEALTH, CULTURE, SECURITY, OTHER\n'
            '  "snippet": one sentence (max 25 words) explaining why this story matters\n\n'
            "If a title is too vague or unclear to summarize meaningfully, set snippet to an empty string — do NOT write that the title is unclear.\n"
            "Return ONLY valid JSON, no markdown, no explanation.\n\n"
            "TITLES:\n"
            + "\n".join(f"{i+1}. {t}" for i, t in enumerate(titles))
        )
        try:
            with claude.messages.stream(
                model=CLAUDE_MODEL_FAST,
                max_tokens=1200,
                messages=[{"role": "user", "content": prompt}],
            ) as stream:
                raw = stream.get_final_message().content[0].text.strip()
            # Haiku often wraps JSON in ```json ... ``` — strip fences before parsing
            if raw.startswith("```"):
                raw = raw.split("\n", 1)[-1]
                raw = raw.rsplit("```", 1)[0].strip()
            parsed = _json.loads(raw)
            for i, obj in enumerate(parsed[:len(titles)]):
                tag = (obj.get("tag") or "OTHER").upper()
                annotations[i] = {
                    "tag": tag if tag in _VALID_TAGS else "OTHER",
                    "snippet": (obj.get("snippet") or "").strip(),
                }
        except Exception:
            pass  # Fall back to defaults

    cards = []
    for i, cluster in enumerate(ranked):
        if len(cards) >= 20:
            break
        ann = annotations[i]
        snippet = ann["snippet"]
        if not snippet or any(sig in snippet.lower() for sig in _BAD_SNIPPET_SIGNALS):
            continue
        rep = _cluster_representative(cluster)
        has_nyt = any(p.get("source") == "nyt" for p in cluster)
        # Don't use NYT-hosted images — they're licensed from wire services
        # and the NYT API doesn't grant rights to reproduce them.
        safe_image = None if rep.get("source") == "nyt" else rep.get("image_url")
        cards.append(CardItem(
            id=str(len(cards)),
            title=rep.get("title") or "",
            tag=ann["tag"],
            snippet=snippet,
            image_url=safe_image,
            source="nyt" if has_nyt else "",
        ))

    _cards_cache = cards
    _cards_cache_ts = time.time()
    return cards


_LENGTH_CFG = {
    2:  {"target_words": 280,  "max_tokens": 600},
    5:  {"target_words": 700,  "max_tokens": 1400},
    10: {"target_words": 1400, "max_tokens": 2600},
}


def _tts_chunk(text: str, api_key: str) -> str | None:
    """Single TTS call for one chunk of text (must be under 4900 bytes)."""
    try:
        resp = requests.post(
            f"https://texttospeech.googleapis.com/v1/text:synthesize?key={api_key}",
            json={
                "input": {"text": text},
                "voice": {"languageCode": "en-US", "name": "en-US-Chirp-HD-D"},
                "audioConfig": {"audioEncoding": "MP3"},
            },
            timeout=60,
        )
        resp.raise_for_status()
        return resp.json().get("audioContent")
    except Exception as e:
        print(f"[tts] chunk failed: {e}", file=sys.stderr)
        return None


def _synthesize_speech(text: str, api_key: str) -> str | None:
    """Split text into <4900-byte chunks, synthesize each, return concatenated base64 MP3."""
    max_bytes = 4800
    encoded = text.encode("utf-8")
    if len(encoded) <= max_bytes:
        return _tts_chunk(text, api_key)

    # Split at a sentence boundary near the midpoint
    chunks: list[str] = []
    remaining = text
    while len(remaining.encode("utf-8")) > max_bytes:
        mid = max_bytes // 2
        split_at = mid
        for i in range(mid, len(remaining)):
            if remaining[i] in ".!?" and i + 1 < len(remaining) and remaining[i + 1] == " ":
                split_at = i + 1
                break
        chunks.append(remaining[:split_at].strip())
        remaining = remaining[split_at:].strip()
    if remaining:
        chunks.append(remaining)

    audio_parts: list[bytes] = []
    for chunk in chunks:
        b64 = _tts_chunk(chunk, api_key)
        if b64 is None:
            return None
        audio_parts.append(base64.b64decode(b64))

    return base64.b64encode(b"".join(audio_parts)).decode()


class TopicPodcastIn(BaseModel):
    topic: str
    length_minutes: int = 5
    timeframe_days: int = 30


@app.post("/topic/podcast")
def topic_podcast(body: TopicPodcastIn, user: AuthedUser = Depends(get_current_user)):
    """Fetch stories about a topic, generate a podcast script, and synthesize audio."""
    import json as _json

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY not configured on server")

    import time as _time
    all_posts = (
        fetch_hn(body.topic, 15, body.timeframe_days) +
        fetch_youtube(body.topic, 10, body.timeframe_days) +
        fetch_x(body.topic, 10, body.timeframe_days)
    )
    # Hard cutoff: drop any post whose timestamp falls outside the selected timeframe
    cutoff = _time.time() - body.timeframe_days * 86400
    all_posts = [p for p in all_posts if p.get("created_utc") and p["created_utc"] >= cutoff]
    if not all_posts:
        raise HTTPException(status_code=404, detail=f"No stories found for '{body.topic}' in the last {body.timeframe_days} day(s)")

    clusters = cluster_posts(all_posts)
    all_ranked = sorted(clusters, key=score_cluster, reverse=True)
    ranked = [
        c for c in all_ranked
        if len((_cluster_representative(c).get("title") or "").strip()) >= 8
    ][:15]

    if not ranked:
        raise HTTPException(status_code=404, detail=f"No quality stories found for '{body.topic}'")

    titles = [_cluster_representative(c).get("title") or "" for c in ranked]
    claude = anthropic.Anthropic(api_key=api_key)
    annotations = [{"tag": "OTHER", "snippet": ""}] * len(titles)

    try:
        annotation_prompt = (
            "For each story title, return a JSON array (one object per story, same order).\n"
            "Each object must have:\n"
            '  "tag": one of AI, TECH, SCIENCE, BUSINESS, POLICY, WORLD, HEALTH, CULTURE, SECURITY, OTHER\n'
            f'  "snippet": one sentence (max 25 words) explaining why this story matters for the topic: {body.topic}\n\n'
            "If a title is too vague or unclear to summarize meaningfully, set snippet to an empty string.\n"
            "Return ONLY valid JSON, no markdown, no explanation.\n\n"
            "TITLES:\n"
            + "\n".join(f"{i+1}. {t}" for i, t in enumerate(titles))
        )
        with claude.messages.stream(
            model=CLAUDE_MODEL_FAST,
            max_tokens=1200,
            messages=[{"role": "user", "content": annotation_prompt}],
        ) as stream:
            raw = stream.get_final_message().content[0].text.strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[-1]
            raw = raw.rsplit("```", 1)[0].strip()
        parsed = _json.loads(raw)
        for i, obj in enumerate(parsed[:len(titles)]):
            tag = (obj.get("tag") or "OTHER").upper()
            annotations[i] = {
                "tag": tag if tag in _VALID_TAGS else "OTHER",
                "snippet": (obj.get("snippet") or "").strip(),
            }
    except Exception:
        pass

    cards = []
    for i, cluster in enumerate(ranked):
        if len(cards) >= 10:
            break
        ann = annotations[i]
        snippet = ann["snippet"]
        if not snippet or any(sig in snippet.lower() for sig in _BAD_SNIPPET_SIGNALS):
            continue
        rep = _cluster_representative(cluster)
        title = (rep.get("title") or "").strip()
        if len(title) < 10:
            continue
        cards.append({"title": title, "snippet": snippet})

    if not cards:
        raise HTTPException(status_code=404, detail=f"Couldn't find enough quality stories about '{body.topic}'")

    cfg = _LENGTH_CFG.get(body.length_minutes, _LENGTH_CFG[5])
    target = cfg["target_words"]
    stories_text = "\n\n".join(
        f"{i + 1}. {c['title']}\n   {c['snippet']}"
        for i, c in enumerate(cards)
    )

    script_prompt = (
        'You are a podcast writer for a daily news show called "Lowpass." '
        f'Write a solo-host script for a {body.length_minutes}-minute episode '
        f'focused on "{body.topic}" based on the stories below.\n\n'
        f"LENGTH: Your script must be {target} words — not shorter, not longer. "
        f"This is a hard requirement. A {body.length_minutes}-minute episode at normal speaking pace is {target} words.\n\n"
        "TONE AND STYLE:\n"
        "- Conversational and intelligent — like a trusted friend who reads everything so you don't have to\n"
        "- Present tense, active voice\n"
        "- No bullet points, no headers in the script itself — flowing speech only\n"
        "- Vary sentence length to sound natural when read aloud\n"
        "- Avoid saying \"firstly,\" \"secondly,\" etc. — transition naturally between stories\n\n"
        "STRUCTURE:\n"
        f"1. Brief cold open (1-2 sentences) hooking the listener on the biggest development in {body.topic}\n"
        "2. Cover each story with 2-4 sentences: what happened, why it matters, what to watch for\n"
        "3. Tie the stories together at the end — what pattern or tension runs through today's coverage\n"
        "4. Close with a single memorable line the listener will carry with them\n\n"
        "RULES:\n"
        '- Never say "In today\'s episode" or "Welcome back" — start immediately with the hook\n'
        "- Don't read out URLs or source names\n"
        "- Speak directly to \"you\" (the listener) occasionally to keep it personal\n"
        "- Write exactly as it should be spoken — no stage directions, no [PAUSE], no formatting\n"
        f"- Write until you reach {target} words; do not stop early\n\n"
        f"STORIES:\n{stories_text}\n\n"
        f"Write the full {target}-word script now, starting with the cold open."
    )

    with claude.messages.stream(
        model=CLAUDE_MODEL,
        max_tokens=cfg["max_tokens"],
        messages=[{"role": "user", "content": script_prompt}],
    ) as stream:
        script = stream.get_final_message().content[0].text.strip()

    audio_b64 = None
    gcp_key = os.environ.get("GOOGLE_TTS_API_KEY")
    if gcp_key:
        audio_b64 = _synthesize_speech(script, gcp_key)

    return {"audio_b64": audio_b64, "stories": cards}


@app.post("/cards/summarize")
def summarize_saved_cards(body: SummarizeCardsIn):
    """Generate a podcast script from swiped-right cards and synthesize audio."""
    if not body.cards:
        raise HTTPException(status_code=400, detail="No cards to summarize")

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY not configured on server")

    cfg = _LENGTH_CFG.get(body.length_minutes, _LENGTH_CFG[5])

    claude = anthropic.Anthropic(api_key=api_key)

    stories_text = "\n\n".join(
        f"{i + 1}. {c.get('title', '')}\n   {c.get('snippet', '') or '(no excerpt)'}"
        for i, c in enumerate(body.cards)
    )

    target = cfg["target_words"]
    prompt = (
        'You are a podcast writer for a daily news show called "Lowpass." '
        f'Write a solo-host script for a {body.length_minutes}-minute episode based on the stories below '
        "that the listener saved today.\n\n"
        f"LENGTH: Your script must be {target} words — not shorter, not longer. "
        f"This is a hard requirement. A {body.length_minutes}-minute episode at normal speaking pace is {target} words.\n\n"
        "TONE AND STYLE:\n"
        "- Conversational and intelligent — like a trusted friend who reads everything so you don't have to\n"
        "- Present tense, active voice\n"
        "- No bullet points, no headers in the script itself — flowing speech only\n"
        "- Vary sentence length to sound natural when read aloud\n"
        "- Avoid saying \"firstly,\" \"secondly,\" etc. — transition naturally between stories\n\n"
        "STRUCTURE:\n"
        "1. Brief cold open (1-2 sentences) that hooks with the biggest theme connecting these stories\n"
        "2. Cover each story with 2-4 sentences: what happened, why it matters, what to watch for\n"
        "3. Tie the stories together at the end — what pattern or tension runs through today's news\n"
        "4. Close with a single memorable line the listener will carry with them\n\n"
        "RULES:\n"
        '- Never say "In today\'s episode" or "Welcome back" — start immediately with the hook\n'
        "- Don't read out URLs or source names\n"
        "- Speak directly to \"you\" (the listener) occasionally to keep it personal\n"
        "- Write exactly as it should be spoken — no stage directions, no [PAUSE], no formatting\n"
        f"- Write until you reach {target} words; do not stop early\n\n"
        f"STORIES:\n{stories_text}\n\n"
        f"Write the full {target}-word script now, starting with the cold open."
    )

    with claude.messages.stream(
        model=CLAUDE_MODEL,
        max_tokens=cfg["max_tokens"],
        messages=[{"role": "user", "content": prompt}],
    ) as stream:
        script = stream.get_final_message().content[0].text.strip()

    audio_b64 = None
    gcp_key = os.environ.get("GOOGLE_TTS_API_KEY")
    if gcp_key:
        audio_b64 = _synthesize_speech(script, gcp_key)

    return {"audio_b64": audio_b64}
