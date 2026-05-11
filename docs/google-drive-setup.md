# Google Drive Integration Setup

This document covers creating the Google Cloud project, enabling the Drive API,
configuring OAuth 2.0 credentials, and wiring the resulting values into the app.

---

## 1 — Create a Google Cloud Project

1. Open [https://console.cloud.google.com](https://console.cloud.google.com) and sign in with the Google account that owns the Drive files you want to process.
2. Click the project selector in the top bar → **New Project**.
3. Name it something like `Infinite Kodex` and click **Create**.
4. Make sure the new project is selected in the top bar before continuing.

---

## 2 — Enable the APIs

Navigate to **APIs & Services → Library** and enable both of these:

| API | Why |
|---|---|
| **Google Drive API** | Server-side file download and upload |
| **Google Picker API** | Client-side file/folder picker widget |

Search for each by name, open it, and click **Enable**.

---

## 3 — Configure the OAuth Consent Screen

1. Go to **APIs & Services → OAuth consent screen**.
2. User type: **External** (required for personal Google accounts — you will be the only test user).
3. Fill in the required fields:
   - **App name**: `Infinite Kodex`
   - **User support email**: your email
   - **Developer contact email**: your email
4. Click **Save and Continue**.
5. On the **Scopes** step, click **Add or Remove Scopes** and add:
   - `https://www.googleapis.com/auth/drive.file`
     *(grants access only to files the user explicitly opens via the Picker or files the app creates — the minimal safe scope)*
6. Click **Save and Continue**.
7. On the **Test Users** step, add your own Google account email. While the app is in *Testing* mode only test users can authenticate.
8. Click **Save and Continue** → **Back to Dashboard**.

> **Note:** You can leave the app in Testing mode indefinitely for personal/private use. Publishing requires Google verification, which is not needed here.

---

## 4 — Create OAuth 2.0 Client Credentials

1. Go to **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
2. Application type: **Web application**.
3. Name: `Infinite Kodex-web`.
4. Under **Authorized redirect URIs**, add:
   ```
   https://kodex.pakgroup.org/api/auth/google/callback
   ```
   (Add `http://localhost:3000/api/auth/google/callback` as well if you run locally.)
5. Click **Create**.
6. Copy the **Client ID** and **Client Secret** from the confirmation dialog.

---

## 5 — Create an API Key (for the Picker widget)

The Google Picker JavaScript widget requires a browser-facing API key (separate from OAuth).

1. Go to **APIs & Services → Credentials → Create Credentials → API Key**.
2. Name it (e.g. `Infinite Kodex API Key`).
3. Under **APIs that can be accessed using this key**, select **Restrict to specific APIs** and choose:
   - **Google Picker API**
   - **Google Drive API**
4. Under **Application restrictions**, select **Websites** and add:
   ```
   https://kodex.pakgroup.org/*
   ```
5. Click **Create** and copy the generated key.

---

## 6 — Add Credentials to the App

Add the following environment variables to your Portainer stack (or `.env` for local dev):

```env
# Google Drive OAuth 2.0
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret

# Google Picker API key (browser-facing, restricted to Picker API)
GOOGLE_API_KEY=your-api-key

# URL the OAuth callback redirects to (must match step 4)
APP_URL=https://kodex.pakgroup.org
```

`GOOGLE_API_KEY` is passed to the frontend at runtime via the `/api/config` endpoint
(same pattern used for OAuth portal URL) — it is **not** baked into the Docker image.

---

## 7 — Authorize the App (first run)

After deploying:

1. Navigate to **Settings → Connections** (or the designated OAuth page) in the console.
2. Click **Connect Google Drive**.
3. You will be redirected to Google's consent screen — sign in with the Drive account.
4. Grant the requested permissions.
5. You are redirected back to the console. The refresh token is stored server-side and
   reused automatically going forward.

Re-authorization is only needed if the token is revoked (via
[Google Account permissions](https://myaccount.google.com/permissions)) or if you
change the OAuth scopes.

---

## Architecture Notes

- **OAuth flow**: Authorization Code flow (server-side). The server exchanges the
  authorization code for access + refresh tokens. The refresh token is persisted in
  the database and used to mint fresh access tokens as needed.
- **Scope**: `drive.file` — the app can only access files the user explicitly opened
  via the Picker or files the app itself created. It cannot enumerate the entire Drive.
- **Picker**: Runs client-side. The Picker widget uses the API key for initialization
  and the user's OAuth access token to show their Drive files. The server never sees
  raw file listings — only the file ID the user selected.
- **Local fallback**: If `GOOGLE_CLIENT_ID` is not set, the pipeline falls back to
  reading from `PIPELINE_INPUT_DIR` (default `/app/input`) on the container filesystem.
