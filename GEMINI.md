# GEMINI Project Analysis: Splatoon Point Counter

## Project Overview

This is a [Next.js](https://nextjs.org/) application built with TypeScript and the App Router. Based on the file structure and names, its primary purpose is to function as a real-time point and score counter for the game Splatoon, designed to be used in live streaming environments with software like OBS (Open Broadcaster Software).

The system appears to have three main parts:
1.  A **Control Panel** for the streamer to update scores and other data.
2.  An **OBS Overlay** page that displays the live data, intended to be captured and shown on a stream.
3.  A **Backend API** that uses Server-Sent Events (SSE) to push real-time updates from the Control Panel to the OBS Overlay.

## Core Technologies

-   **Framework**: Next.js 14+ (App Router)
-   **Language**: TypeScript
-   **Styling**: Tailwind CSS (inferred from `postcss.config.mjs` and `globals.css`)
-   **Linting**: ESLint

## Data Model

The core data structure for this application is defined in `/app/api/stream-data/route.ts`. This object, `StreamData`, represents all the information that is displayed on the OBS overlay.

```typescript
export interface StreamData {
    scoreLabel: string;
    scoreValue: string; // Can be a number or a string like "300+"
    transitionEffect: string;
    transitionDuration: number;
    fontFamily: string;
    fontSize: number;
    messagePresets: MessagePreset[];
    activePresetName: string;
    lastEvent: {
        name: string;
        timestamp: number;
    } | null;
}
```

## Key Directories and Files

### `/app`
This directory contains the application's routes and core logic, following the Next.js App Router conventions.

-   `layout.tsx`: The root layout of the application.
-   `page.tsx`: The main landing page of the application.
-   `globals.css`: Global stylesheets, likely including Tailwind CSS base styles.

#### `/app/control-panel/page.tsx`
-   **Purpose**: This is the user interface for the streamer. It provides input fields to modify the `StreamData` object, including the score's label and value, fonts, and messages. The `scoreLabel` field is a two-row text area, and `scoreValue` accepts strings (e.g., "300+"). When the streamer submits the form, it sends a `POST` request to the backend API.

#### `/app/obs-overlay/page.tsx`
-   **Purpose**: This page is designed to be used as a browser source in OBS or similar streaming software. It listens for real-time updates from the server and displays them visually. It likely contains the `ScoreDisplay` component.

#### `/app/api/stream-data/route.ts`
-   **Purpose**: This is a server-side API route that manages the state of the `StreamData` object. It handles `GET` requests to provide the current data to clients (like the OBS overlay) and `POST` requests from the Control Panel to update the data.

### `/components`
This directory holds the reusable React components used across the application.

-   `ScoreDisplay.tsx`: A React component responsible for the visual presentation of the score data. This is a key component on the `obs-overlay` page.
-   `MessageScroller.tsx`: A component that displays a scrolling list of messages, announcements, or events.

### `/public`
This directory contains static assets that are served publicly. The current files (`next.svg`, `vercel.svg`, etc.) are default assets from a standard Next.js installation.

## Configuration Files

-   `next.config.ts`: Configuration for the Next.js framework.
-   `tsconfig.json`: TypeScript compiler options.
-   `package.json`: Project dependencies and scripts.
-   `postcss.config.mjs`: Configuration for PostCSS, used by Tailwind CSS.
-   `eslint.config.mjs`: ESLint configuration for code linting.