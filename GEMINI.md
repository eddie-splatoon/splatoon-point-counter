# GEMINI Project Analysis: Splatoon Point Counter

## Project Overview

This is a [Next.js](https://nextjs.org/) application built with TypeScript and the App Router. Its primary purpose is to function as a real-time data overlay system for live streaming, designed for use with software like OBS.

The system has four main parts:
1.  A **Control Panel** for the streamer to update scores and other data in real-time.
2.  A **Score and Message Overlay** (`/obs-overlay`) that displays general scores and scrolling messages.
3.  A **Burndown Chart Overlay** (`/burndown-overlay`) that displays progress towards a specific numerical goal.
4.  A **Backend API** that manages a central data object and pushes updates to the overlays.

## Core Technologies

-   **Framework**: Next.js 14+ (App Router)
-   **Language**: TypeScript
-   **UI/Styling**: Material-UI (MUI) and Tailwind CSS.
-   **Real-time Communication**: The backend uses a simple in-memory store, updated via REST API calls from the control panel. The overlays poll the backend periodically to fetch the latest data.
-   **Browser APIs**: The [Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API) is used for the voice-to-effect feature.

## Data Model

The core data structure, `StreamData`, is defined in `/app/api/stream-data/route.ts`. It represents all information shared between the control panel and the overlays.

```typescript
// From /app/api/stream-data/route.ts

export interface BurndownData {
    label: string;
    targetValue: number;
    entries: number[]; // Point history
}

export interface StreamData {
    scoreLabel: string;
    scoreValue: string;
    // ... other properties for fonts, messages, etc.
    lastEvent: {
        name: string;
        timestamp: number;
    } | null;
    burndown: BurndownData; // Data for the burndown chart
}
```

## Key Directories and Files

### `/app`
This directory contains the application's routes and core logic.

#### `/app/control-panel/page.tsx`
-   **Purpose**: The main UI for the streamer. It features a tabbed interface to manage different parts of the overlays.
    -   **Score Display Tab**: For updating the main score label and value.
    -   **Burndown Tab**: For managing the burndown chart's label, target value, and point history.
    -   **Message Tab**: For controlling the scrolling messages on the main overlay.
    -   **Common Settings Tab**: For global settings like font and font size, as well as enabling the **Voice-to-Effect** feature. This feature uses the Web Speech API to listen for keywords ("ナイス", "ありがとう", etc.) and trigger visual effects automatically.

#### `/app/obs-overlay/page.tsx`
-   **Purpose**: The main overlay for OBS. It displays the primary score and scrolling messages by fetching data from the backend. It also renders visual effects (`Heart`, `Star`, etc.) when triggered.

#### `/app/burndown-overlay/page.tsx`
-   **Purpose**: A dedicated overlay for the burndown chart. It has a 250x584 resolution and displays the progress towards a target, including a line chart and a progress bar.
-   **Features**: It triggers a `FireworksEffect` when the goal is reached (remaining points <= 0).

#### `/app/api/stream-data/route.ts`
-   **Purpose**: A server-side API route that manages the state of the `StreamData` object. It handles `GET` requests from the overlays and `POST` requests from the Control Panel.

### `/components`
This directory holds reusable React components.

-   `ScoreDisplay.tsx`: Renders the main score and label. Includes an animation when the score value changes.
-   `BurndownChart.tsx`: Renders the burndown chart, including the target, remaining value, a line chart visualization, and a burn-up progress bar.
-   `MessageScroller.tsx` / `RandomTipScroller.tsx`: Components for displaying scrolling text.
-   **Effect Components** (`HeartEffect.tsx`, `StarEffect.tsx`, `FireworksEffect.tsx`, etc.): Components responsible for rendering the visual effects on the overlays.

### `/public`
This directory contains static assets, including images and the `tips.tsv` file used by the `RandomTipScroller`.
