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

## Key Directories and Files

### `/app`
This directory contains the application's routes and core logic, following the Next.js App Router conventions.

-   `layout.tsx`: The root layout of the application.
-   `page.tsx`: The main landing page of the application.
-   `globals.css`: Global stylesheets, likely including Tailwind CSS base styles.

#### `/app/control-panel/page.tsx`
-   **Purpose**: This is the user interface for the streamer. From here, they can likely control the information displayed on the overlay, such as team scores, player names, or game status.

#### `/app/obs-overlay/page.tsx`
-   **Purpose**: This page is designed to be used as a browser source in OBS or similar streaming software. It listens for real-time updates from the server and displays them visually. It likely contains the `ScoreDisplay` component.

#### `/app/api/stream-data/route.ts`
-   **Purpose**: This is a server-side API route. The name `stream-data` strongly suggests it implements a streaming connection, most likely using [Server-Sent Events (SSE)](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events). The Control Panel sends updates to this endpoint, which then pushes them to any connected clients (i.e., the OBS Overlay page).

### `/components`
This directory holds the reusable React components used across the application.

-   `ScoreDisplay.tsx`: A React component responsible for the visual presentation of the score data. This is likely a key component on the `obs-overlay` page.
-   `MessageScroller.tsx`: A component that probably displays a scrolling list of messages, announcements, or events.

### `/public`
This directory contains static assets that are served publicly. The current files (`next.svg`, `vercel.svg`, etc.) are default assets from a standard Next.js installation.

## Configuration Files

-   `next.config.ts`: Configuration for the Next.js framework.
-   `tsconfig.json`: TypeScript compiler options.
-   `package.json`: Project dependencies and scripts.
-   `postcss.config.mjs`: Configuration for PostCSS, used by Tailwind CSS.
-   `eslint.config.mjs`: ESLint configuration for code linting.
