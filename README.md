# Chatly — Full Free-Tier Messenger (Phases 1–6)

React 18 + Vite 6 · Tailwind CSS v4 · Ant Design 5 · TanStack Query · React Router v6 · Firebase (Auth + Firestore, Spark Free Plan) · Cloudinary (Unsigned Media & Voice Uploads)

## Architecture & Free-Tier Optimizations

1. **Zero Firebase Storage / Zero Cloud Functions (Spark Plan Ready)**:
   - Images, files, avatars, cover photos, and voice notes (`audio/webm` uploaded under Cloudinary's `video` resource type) use **Cloudinary unsigned uploads**.
   - **Web Audio API** synthesizes notification chimes and message-send sounds with zero external assets.
   - **Firestore Offline Persistence** (`persistentLocalCache` + `persistentMultipleTabManager`) caches documents across tabs to minimize daily reads.
   - **Paginated Messages & Throttled Presence**: Only the latest 30 messages use a live listener; older history loads via `startAfter` pagination on scroll. Presence heartbeats and typing indicators are throttled.
2. **Serverless Security via `firestore.rules`**:
   - Atomic `@username` reservation on signup (`usernames/{name}` + `users/{uid}`).
   - Strict membership, block checks, wall privacy, and group invite validation enforced in `firestore.rules`.

## Features Included (Phases 1–6)

- **Phase 1 — Foundation & Auth**:
  - Sign up with live `@username` availability check, atomic transaction reservation, login, logout, password reset, email verification banner, dark/light glassmorphic UI shell.
- **Phase 2 — Profiles, Privacy & Wall**:
  - Edit display name, bio, birthday, location, website links, avatar & cover photo (`EditProfileModal`).
  - Private account switch + per-field visibility toggles (`email`, `birthday`, `location`, `links`, `lastSeen`, `onlineStatus`).
  - Public/contact-aware profile viewer at `/u/:username` with Add, Accept/Decline, Message, Block/Unblock, and Report buttons.
  - Status & photo wall posts (`ProfileWall`) with likes and deletion.
- **Phase 3 — Search, Contacts & Blocking**:
  - Debounced `@username` prefix search.
  - Contact requests: send, accept, decline, cancel with real-time badge counts.
  - Contact list & Blocked users list + user reporting modal.
- **Phase 4 — Core 1:1 Messaging**:
  - Real-time 1:1 conversations, unread badges on navigation & browser tab title, infinite scroll pagination for older history, date dividers.
- **Phase 5 — Rich Chat Features**:
  - Text, Emoji picker, Images (with Lightbox), Files (with size & download), and Voice Notes (`MediaRecorder` + custom audio player).
  - Reply with quote jump, Edit (`(edited)`), Unsend for everyone, Delete for me, Emoji Reactions, Message Forwarding, and In-chat Search.
  - Live Typing indicator, Online dot / Last Seen status, and Sent / Delivered / Seen checkmarks.
  - URL detection & inline Link Preview cards.
- **Phase 6 — Group Chats, Roles, Pinned Messages & Polish**:
  - Group creation with custom photo, description, and member picker.
  - Group roles (`Admin` / `Member`), promote/demote/remove members, add contacts, and shareable invite links (`/join/:inviteCode`).
  - Pin messages inside a chat (up to 10 pinned messages banner & popover).
  - Pin, Mute, and Archive conversations with sidebar filters (`All`, `Unread`, `Groups`, `Archived`).
  - Account deletion & full Firestore data cleanup in Settings.

## Setup & Run

1. Copy `.env.example` to `.env` and fill in your `VITE_FIREBASE_*` and `VITE_CLOUDINARY_*` keys.
2. Deploy rules and indexes (or paste `firestore.rules` in the Firebase Console):
   ```bash
   firebase deploy --only firestore:rules,firestore:indexes
   ```
3. Install and start:
   ```bash
   npm install
   npm run dev
   ```
