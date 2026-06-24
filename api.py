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
import requests
from dotenv import load_dotenv
load_dotenv("local.env")

import anthropic
from fastapi import FastAPI, Depends, HTTPException, Header
from pydantic import BaseModel
from supabase import create_client, Client

from digest import (
    fetch_reddit, fetch_hn, fetch_youtube, fetch_x,
    fetch_reddit_trending, fetch_hn_trending,
    cluster_posts, score_cluster, _cluster_key,
    _cluster_representative, synthesize_cluster, synthesize_digest,
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
    return {"access_token": data["access_token"], "token_type": "bearer"}


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
        fetch_reddit(body.topic, 10) +
        fetch_hn(body.topic, 10) +
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


class SummarizeCardsIn(BaseModel):
    cards: list[dict]


_VALID_TAGS = {"AI", "TECH", "SCIENCE", "BUSINESS", "POLICY", "WORLD", "HEALTH", "CULTURE", "SECURITY", "OTHER"}

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

    reddit_posts = fetch_reddit_trending(25)
    hn_posts = fetch_hn_trending(25)
    all_posts = reddit_posts + hn_posts

    if not all_posts:
        raise HTTPException(status_code=503, detail="Could not fetch stories right now")

    clusters = cluster_posts(all_posts)
    ranked = sorted(clusters, key=score_cluster, reverse=True)[:10]

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
            "Return ONLY valid JSON, no markdown, no explanation.\n\n"
            "TITLES:\n"
            + "\n".join(f"{i+1}. {t}" for i, t in enumerate(titles))
        )
        try:
            with claude.messages.stream(
                model=CLAUDE_MODEL_FAST,
                max_tokens=600,
                messages=[{"role": "user", "content": prompt}],
            ) as stream:
                raw = stream.get_final_message().content[0].text.strip()
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
        rep = _cluster_representative(cluster)
        cards.append(CardItem(
            id=str(i),
            title=rep.get("title") or "",
            tag=annotations[i]["tag"],
            snippet=annotations[i]["snippet"],
            image_url=rep.get("image_url"),
        ))

    _cards_cache = cards
    _cards_cache_ts = time.time()
    return cards


def _synthesize_speech(text: str, api_key: str) -> str | None:
    """Call Google Cloud TTS REST API. Returns base64-encoded MP3 or None on failure."""
    try:
        resp = requests.post(
            f"https://texttospeech.googleapis.com/v1/text:synthesize?key={api_key}",
            json={
                "input": {"text": text},
                "voice": {
                    "languageCode": "en-US",
                    "name": "en-US-Neural2-D",
                    "ssmlGender": "MALE",
                },
                "audioConfig": {
                    "audioEncoding": "MP3",
                    "speakingRate": 1.05,
                    "pitch": 0.0,
                },
            },
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json().get("audioContent")  # GCP returns base64 directly
    except Exception as e:
        print(f"[tts] synthesis failed: {e}", file=sys.stderr)
        return None


@app.post("/cards/summarize")
def summarize_saved_cards(body: SummarizeCardsIn):
    """Summarize swiped-right cards into a brief report. No auth required."""
    if not body.cards:
        raise HTTPException(status_code=400, detail="No cards to summarize")

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY not configured on server")

    claude = anthropic.Anthropic(api_key=api_key)

    stories_text = "\n\n".join(
        f"{i + 1}. {c.get('title', '')}\n   {c.get('snippet', '') or '(no excerpt)'}"
        for i, c in enumerate(body.cards)
    )

    prompt = (
        'You are a podcast writer for a daily news show called "Lowpass." '
        "Write a 5-minute solo-host script (approximately 750 words) based on the stories below "
        "that the listener saved today.\n\n"
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
        "- Write exactly as it should be spoken — no stage directions, no [PAUSE], no formatting\n\n"
        f"STORIES:\n{stories_text}\n\n"
        "Write the full script now, starting with the cold open."
    )

    with claude.messages.stream(
        model=CLAUDE_MODEL,
        max_tokens=800,
        messages=[{"role": "user", "content": prompt}],
    ) as stream:
        script = stream.get_final_message().content[0].text.strip()

    audio_b64 = None
    gcp_key = os.environ.get("GOOGLE_TTS_API_KEY")
    if gcp_key:
        audio_b64 = _synthesize_speech(script, gcp_key)

    return {"audio_b64": audio_b64}
