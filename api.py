#!/usr/bin/env python3
"""
api.py — FastAPI server wrapping the digest logic.

Endpoints:
  POST /digest          — run digest for the authenticated user's topics
  GET  /topics          — list the user's topics
  POST /topics          — add a topic
  DELETE /topics/{id}   — remove a topic
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
    print_clusters,
)

app = FastAPI(title="Lowpass Digest API")

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_ANON_KEY = os.environ["SUPABASE_ANON_KEY"]


# ---------------------------------------------------------------------------
# Auth helper
# ---------------------------------------------------------------------------

def get_supabase(authorization: str = Header(...)) -> Client:
    """Return a Supabase client scoped to the requesting user's JWT."""
    token = authorization.removeprefix("Bearer ").strip()
    client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    client.auth.set_session(token, "")
    return client


def current_user_id(sb: Client) -> str:
    user = sb.auth.get_user()
    if not user or not user.user:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return user.user.id


# ---------------------------------------------------------------------------
# Seen cache (Supabase-backed, replaces ~/.lowpass_seen.json)
# ---------------------------------------------------------------------------

def load_seen_db(sb: Client, user_id: str) -> set:
    rows = sb.table("seen_clusters").select("cluster_key").eq("user_id", user_id).execute()
    return {r["cluster_key"] for r in rows.data}


def mark_seen_db(sb: Client, user_id: str, clusters: list) -> None:
    rows = [{"user_id": user_id, "cluster_key": _cluster_key(c)} for c in clusters]
    sb.table("seen_clusters").upsert(rows, on_conflict="user_id,cluster_key").execute()


# ---------------------------------------------------------------------------
# Topics endpoints
# ---------------------------------------------------------------------------

class TopicIn(BaseModel):
    query: str
    focus: str = ""


@app.get("/topics")
def list_topics(sb: Client = Depends(get_supabase)):
    uid = current_user_id(sb)
    rows = sb.table("topics").select("*").eq("user_id", uid).execute()
    return rows.data


@app.post("/topics", status_code=201)
def add_topic(body: TopicIn, sb: Client = Depends(get_supabase)):
    uid = current_user_id(sb)
    row = sb.table("topics").insert({
        "user_id": uid, "query": body.query, "focus": body.focus
    }).execute()
    return row.data[0]


@app.delete("/topics/{topic_id}", status_code=204)
def delete_topic(topic_id: str, sb: Client = Depends(get_supabase)):
    uid = current_user_id(sb)
    sb.table("topics").delete().eq("id", topic_id).eq("user_id", uid).execute()


# ---------------------------------------------------------------------------
# Digest endpoint
# ---------------------------------------------------------------------------

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
def run_digest(limit: int = 10, sb: Client = Depends(get_supabase)):
    uid = current_user_id(sb)

    topics = sb.table("topics").select("*").eq("user_id", uid).execute().data
    if not topics:
        raise HTTPException(status_code=404, detail="No topics configured for this user")

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY not configured")

    claude = anthropic.Anthropic(api_key=api_key)
    seen = load_seen_db(sb, uid)
    results = []

    for entry in topics:
        topic = entry["query"]
        focus = entry.get("focus") or ""

        all_posts = (
            fetch_reddit(topic, limit) +
            fetch_hn(topic, limit) +
            fetch_youtube(topic, limit) +
            fetch_x(topic, limit)
        )
        if not all_posts:
            continue

        clusters = cluster_posts(all_posts)
        ranked = sorted(clusters, key=score_cluster, reverse=True)
        new_clusters = [c for c in ranked if _cluster_key(c) not in seen]

        if not new_clusters:
            continue

        top = new_clusters[:5]
        summaries = []
        cluster_out = []

        for rank, cluster in enumerate(top, start=1):
            rep = _cluster_representative(cluster)
            summary = synthesize_cluster(claude, cluster, rank, focus)
            summaries.append((rank, summary))
            cluster_out.append(ClusterSummary(
                rank=rank,
                title=rep["title"] or "",
                url=rep["url"],
                sources=sorted({p["source"] for p in cluster}),
                composite_score=round(score_cluster(cluster), 1),
                summary=summary,
            ))

        mark_seen_db(sb, uid, top)

        themes = synthesize_digest(claude, summaries, topic) if len(summaries) > 1 else ""
        results.append(DigestResponse(topic=topic, clusters=cluster_out, themes=themes))

    return results
