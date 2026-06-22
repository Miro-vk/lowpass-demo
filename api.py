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

CLAUDE_MODEL = "claude-opus-4-8"

app = FastAPI(title="Lowpass Digest API")

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_ANON_KEY = os.environ["SUPABASE_ANON_KEY"]


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

class AuthIn(BaseModel):
    email: str
    password: str


@app.post("/auth/signup", status_code=201)
def signup(body: AuthIn):
    sb = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    try:
        sb.auth.sign_up({"email": body.email, "password": body.password})
        return {"message": "Account created. Check your email to confirm before logging in."}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/auth/login")
def login(body: AuthIn):
    sb = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    try:
        res = sb.auth.sign_in_with_password({"email": body.email, "password": body.password})
        return {
            "access_token": res.session.access_token,
            "token_type": "bearer",
        }
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid email or password")


class AuthedUser:
    def __init__(self, user_id: str, sb: Client):
        self.user_id = user_id
        self.sb = sb


def get_current_user(authorization: str = Header(...)) -> AuthedUser:
    """Validate the Bearer token and return a Supabase client scoped to that user."""
    token = authorization.removeprefix("Bearer ").strip()
    sb = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    try:
        res = sb.auth.get_user(token)
        if not res or not res.user:
            raise HTTPException(status_code=401, detail="Invalid or expired token")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    sb.postgrest.auth(token)
    return AuthedUser(user_id=res.user.id, sb=sb)


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


class SummarizeCardsIn(BaseModel):
    cards: list[dict]


_VALID_TAGS = {"AI", "TECH", "SCIENCE", "BUSINESS", "POLICY", "WORLD", "HEALTH", "CULTURE", "SECURITY", "OTHER"}


@app.get("/cards/daily", response_model=list[CardItem])
def get_daily_cards():
    """Top 10 most-engaged stories from the past 24 hours. No auth required."""
    import json as _json

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
                model=CLAUDE_MODEL,
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
        ))

    return cards


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
        f"Story {i + 1}: {c.get('title', '')}\n{c.get('snippet', '') or '(no excerpt)'}"
        for i, c in enumerate(body.cards)
    )

    prompt = (
        f"The user saved {len(body.cards)} stories today. Write a concise, engaging briefing "
        f"(5–8 sentences) that ties these stories together — highlight patterns, tensions, or "
        f"big-picture themes worth paying attention to. Write in a clear, intelligent tone like "
        f"a trusted analyst. Flowing prose only, no bullet points.\n\n"
        f"STORIES:\n{stories_text}\n\nBRIEFING:"
    )

    with claude.messages.stream(
        model=CLAUDE_MODEL,
        max_tokens=500,
        messages=[{"role": "user", "content": prompt}],
    ) as stream:
        report = stream.get_final_message().content[0].text.strip()

    return {"report": report}
