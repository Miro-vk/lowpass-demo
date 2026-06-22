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
    cluster_posts, score_cluster, _cluster_key,
    _cluster_representative, synthesize_cluster, synthesize_digest,
)

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
