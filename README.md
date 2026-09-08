# Lowpass

> **A calmer way to keep up.** Turn the internet's loudest conversations into a focused briefing you can read or listen to.

Lowpass is a mobile news discovery and briefing app. Choose what matters to you, swipe through what is happening now, and generate a short AI-narrated update from stories gathered across multiple sources.

## The Problem

Keeping up with a topic usually means opening several feeds, comparing overlapping headlines, judging which links are worth your time, and still missing the bigger picture. News apps often optimize for more content, while the real need is a clear answer to: “What actually matters about this topic right now?”

Lowpass reduces that decision fatigue by combining source discovery, story clustering, concise synthesis, and audio playback in one focused workflow.

## How It Works

### 1. Choose a topic

Create an account and add the subjects you want to follow. A topic can include an optional focus, such as a company, technology, event, or question you want the digest to emphasize.

### 2. Set the context

Choose how far back Lowpass should look. The digest request supports a configurable time window, so a topic can be treated as a recent update or a broader briefing.

### 3. Discover stories

Browse a daily card feed one story at a time. Start with `What's Hot` or focus on a category such as technology, business, world, science, health, or culture.

### 4. Read the signal

For a topic digest, Lowpass gathers posts from several sources, groups related coverage, ranks the strongest clusters, and presents up to five stories with source links, engagement scores, and concise summaries. A themes section connects the individual stories into one overview.

### 5. Listen to the briefing

Turn a topic or a selection of daily cards into a podcast-style briefing. Choose the narration length and preferred voice, then play the generated audio in the app.

### 6. Keep a record

Digest runs are kept in local history so a previous briefing can be revisited. The app also tracks seen story clusters for the signed-in user to reduce repeated coverage.

## AI Integration

### Story synthesis

**Technology:** Anthropic Claude

**Purpose:** Summarize each ranked story cluster and synthesize the common themes across a digest.

Lowpass sends grouped source context to the model rather than asking it to summarize an isolated headline. This preserves the relationship between multiple reports while keeping the returned briefing short and readable.

### Speech generation

**Technology:** Google Cloud text-to-speech

**Purpose:** Convert topic and card summaries into playable narrated audio.

The client can request different briefing lengths and voices. Audio is returned as base64 data and played through the mobile podcast player.

### Ranking and clustering

**Technology:** Source normalization and custom ranking pipeline in `digest.py`

**Purpose:** Make stories from different platforms comparable before synthesis.

The backend normalizes source engagement signals, groups related posts, applies recency and engagement scoring, and selects representative links for the highest-ranked clusters. This gives the model a focused set of stories instead of an unfiltered feed.

## Tech Stack

### Mobile

- **Framework:** Expo and React Native
- **Language:** TypeScript and JSX
- **Navigation:** React Navigation native stack and bottom tabs
- **State:** React context providers for auth, history, theme, and voice preferences
- **Storage:** AsyncStorage for session persistence and local app state
- **Audio:** Expo AV

### Backend / API

- **Framework:** FastAPI with Uvicorn
- **Language:** Python
- **Authentication and database:** Supabase Auth and Postgres
- **AI summarization:** Anthropic Claude
- **Speech:** Google Cloud text-to-speech
- **Validation:** Pydantic request and response models

### Content sources

- Hacker News Algolia API
- YouTube Data API
- X API
- New York Times API

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

## Project Structure

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

## Known Challenges & Solutions

### Challenge: Different sources measure attention differently

**Problem:** A YouTube result, Hacker News post, X post, and newspaper article do not share the same engagement scale.

**Solution:** Lowpass normalizes source scores before clusters are compared, then combines engagement with recency when ranking them.

### Challenge: Duplicate coverage creates noise

**Problem:** The same event can appear as several links across different platforms.

**Solution:** Related posts are clustered before summaries are generated. The API stores per-user seen-cluster keys in Supabase so already-consumed coverage can be recognized.

### Challenge: Briefings are expensive to generate

**Problem:** A request may need source fetching, clustering, multiple model calls, and text-to-speech, especially after a cold server start.

**Solution:** The mobile client uses route-specific timeouts, daily cards are cached for one hour, and popular feeds are prewarmed in the API process.

### Challenge: AI summaries need source context

**Problem:** A short headline alone is not enough to produce a useful briefing.

**Solution:** The backend keeps representative URLs and source names alongside clustered content, then returns summaries that remain linked to the underlying stories.

## Design & UX

- **Card-first discovery:** Daily stories are presented in a swipe-based flow for quick decisions.
- **Focused reading:** Digest results emphasize a small number of ranked clusters instead of an endless list.
- **Listen when convenient:** Every podcast request supports configurable length and voice.
- **Personal controls:** Topic focus, timeframe, narration preference, history, and light/dark theme are available from the mobile app.
- **Mobile-first interaction:** Navigation, playback, and discovery are designed for touch devices while remaining available through Expo web.

## Performance Considerations

- Daily and category card pools are cached in process for one hour.
- The API prewarms popular card feeds in a background loop.
- Engagement normalization and clustering reduce the amount of content sent to the summarization model.
- The mobile client uses longer timeouts for digest, podcast, and text-to-speech routes to accommodate cold starts.
- Access and refresh tokens are persisted locally so returning users can restore a session.

## Architecture Details

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