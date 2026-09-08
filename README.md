# Lowpass

Lowpass is a mobile news briefing app that turns a noisy stream of online conversation into a short, listenable update. Users choose topics, set a focus and time window, review ranked story clusters, and listen to an AI-generated podcast-style briefing instead of checking several feeds individually.

The repository contains the Expo/React Native mobile client and the FastAPI service that collects stories, clusters related coverage, generates summaries, and synthesizes speech.

## Capabilities

### Mobile app

- Create an account, sign in, refresh sessions, and sign out.
- Add, edit through selection, and remove personal topics.
- Generate a topic digest with an optional focus and a configurable lookback window.
- See up to five ranked story clusters per digest, including a representative title, source list, score, URL, and synthesized summary.
- Read an overall themes summary for the digest.
- Browse daily cards in a swipe-based discovery flow.
- Browse a general `What's Hot` feed or category feeds such as technology, business, world, science, health, and culture.
- Select cards and turn them into a narrated briefing.
- Generate a topic podcast directly from a topic and choose its length and voice.
- Play generated audio in the built-in podcast player.
- Keep a local history of digest runs and return to previous results.
- Choose a preferred narration voice and switch between light and dark themes.
- Persist authentication tokens and refresh tokens locally with AsyncStorage.

### Backend

- Authenticate users through Supabase Auth and scope protected data to the signed-in user.
- Fetch topic stories from Hacker News, YouTube, and X for topic digests.
- Fetch trending and category stories from Hacker News and the New York Times for daily cards.
- Normalize engagement scores across sources, cluster related posts, rank clusters, and select representative links.
- Use Anthropic models to summarize story clusters and synthesize a digest-level themes section.
- Generate speech audio for topic and card briefings with Google Cloud text-to-speech.
- Cache daily and category card pools for one hour and prewarm popular feeds in the background.
- Store per-user seen-cluster state in Supabase to support deduplication.

## Architecture

```text
Expo / React Native app
	|
	| JSON over HTTPS, Bearer access token
	v
FastAPI service (api.py)
	|
	+--> Supabase Auth and Postgres
	+--> Hacker News Algolia API
	+--> YouTube Data API
	+--> X API
	+--> New York Times API
	+--> Anthropic Claude
	+--> Google Cloud text-to-speech
```

The deployed mobile client currently points at `https://lowpass-demo.onrender.com`. To use a different service, update `BASE_URL` in `mobile/src/api.ts`.

## Repository layout

```text
api.py                 FastAPI routes and server-side orchestration
digest.py              Source adapters, clustering, ranking, and synthesis helpers
topics.yaml            CLI topic configuration
requirements.txt       Python server dependencies
mobile/App.tsx         Expo navigation and providers
mobile/src/api.ts       Mobile-to-server API client
mobile/src/screens/     Authentication, cards, digest, history, and settings UI
mobile/src/components/ Shared mobile UI, including audio playback
mobile/src/context/     Auth, history, theme, and voice state
```

## Requirements

- Python 3.10 or newer
- Node.js and npm
- An Expo-compatible device, simulator, or web browser
- A Supabase project with Auth enabled
- API credentials for the providers used by the server

## Backend setup

Create a Python virtual environment, install dependencies, and provide the server environment variables:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_ANON_KEY="your-supabase-anon-key"
export ANTHROPIC_API_KEY="your-anthropic-key"
export GOOGLE_TTS_API_KEY="your-google-tts-key"
export YOUTUBE_API_KEY="your-youtube-key"
export NYT_API_KEY="your-nytimes-key"
export X_BEARER_TOKEN="your-x-bearer-token"
```

The application requires `SUPABASE_URL` and `SUPABASE_ANON_KEY` at startup. `ANTHROPIC_API_KEY` is required for digest and summary generation. `GOOGLE_TTS_API_KEY` is required for narration. YouTube, NYT, and X keys enable their corresponding sources; source adapters may return fewer stories when an optional provider is not configured.

Start the API locally with Uvicorn:

```bash
uvicorn api:app --reload
```

The FastAPI app exposes interactive documentation at `http://127.0.0.1:8000/docs`.

### Supabase data

The API expects a Supabase table named `seen_clusters` with at least these columns:

- `user_id`
- `cluster_key`

The pair should be unique so the API can upsert each user’s seen story clusters. Row-level security should be configured for the deployment’s access model.

## Mobile setup

Install the JavaScript dependencies from the mobile project and start Expo:

```bash
cd mobile
npm install
npm start
```

Useful scripts:

```bash
npm run android
npm run ios
npm run web
```

When running against a local API, change `BASE_URL` in `mobile/src/api.ts` to a host reachable from the selected device or simulator. For a physical device, this is usually the development machine’s LAN address rather than `localhost`.

## API reference

### Authentication

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/auth/signup` | No | Create an account; Supabase may require email confirmation. |
| `POST` | `/auth/login` | No | Return an access token and refresh token. |
| `POST` | `/auth/refresh` | No | Exchange a refresh token for a new session. |

### Topics and digests

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/topics` | Bearer | List the current user’s topics. |
| `POST` | `/topics` | Bearer | Add a topic with a query and optional focus. |
| `DELETE` | `/topics/{id}` | Bearer | Remove a saved topic. |
| `POST` | `/digest` | Bearer | Fetch, cluster, rank, and summarize stories for a topic. |
| `POST` | `/topic/podcast` | Bearer | Create a narrated briefing for a topic. |

`/digest` accepts `topic`, `focus`, and `timeframe_days`. It returns digest objects containing ranked clusters with `title`, `url`, `sources`, `composite_score`, and `summary`, plus a `themes` string.

### Daily cards and audio

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/cards/daily?category=WHATS_HOT` | No | Return cached daily discovery cards. |
| `POST` | `/cards/summarize` | No | Turn selected cards into narrated audio. |

Supported card categories are `WHATS_HOT`, `TECH`, `BUSINESS`, `WORLD`, `SCIENCE`, `HEALTH`, `CULTURE`, and `OTHER`. Audio responses contain base64-encoded audio when speech synthesis succeeds.

## Digest pipeline

1. The client submits a topic, focus, and time window.
2. The API gathers source posts and normalizes their engagement signals.
3. Similar posts are grouped into clusters and ranked using engagement and recency.
4. The top five clusters are summarized by Claude, with source links retained.
5. Claude synthesizes the common themes across the selected stories.
6. For podcast requests, the resulting briefing is converted to speech and returned as base64 audio.

Long-running routes have deliberately generous client timeouts because a cold server start, source fetches, model calls, and text-to-speech can take several minutes.

## Development notes

- `digest.py` can also be used as a standalone command-line digest utility when its configured source and Anthropic credentials are available.
- Daily cards are cached in process memory for one hour; restarting the API clears those caches.
- Authentication and seen-cluster state are server-backed, while the mobile history and audio files are managed by the client context and device storage.
- Do not commit API keys, Supabase credentials, `local.env`, or generated audio.

## License

The mobile package includes its own `mobile/LICENSE` file. Review that file for the applicable license terms.