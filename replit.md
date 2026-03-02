# Book Illustration Planner

## Overview
A web app that helps authors plan illustrations for children's books. It reads PDFs, detects book boundaries via AI, calculates illustration placement (every 3 pages), generates OpenArt-optimized image prompts, and extracts character references.

## Architecture
- **Frontend**: React + Vite + TypeScript + Tailwind CSS + shadcn/ui
- **Backend**: Express.js with in-memory storage
- **AI**: OpenAI via Replit AI Integrations (no API key needed)
- **PDF Parsing**: pdf-parse library

## Key Features
1. **Upload Tab**: PDF upload with AI-detected book boundaries (start/end pages), manual override
2. **Illustrations Tab**: Auto-calculated illustration blocks (every 3 pages), 3 prompt variations per block (moment/atmosphere/emotion), copy-to-clipboard
3. **Characters Tab**: AI-extracted character references with editable fields, copy-ready
4. **Settings Tab**: Model selector, forbidden phrase list, prompt tone presets

## File Structure
```
shared/schema.ts          - Type definitions
server/routes.ts          - API endpoints (upload, illustrations, characters, settings)
server/storage.ts         - In-memory project storage
server/pdf.ts             - PDF parsing
server/prompts.ts         - AI prompt generation and character extraction
server/openai.ts          - OpenAI client
client/src/App.tsx         - Main app with tab routing
client/src/pages/home.tsx  - Home page with tab layout
client/src/components/     - Tab components (upload, illustrations, characters, settings)
```

## API Endpoints
- `POST /api/upload` - Upload PDF (multipart)
- `GET /api/projects/:id` - Get project data
- `PATCH /api/projects/:id/boundaries` - Update book boundaries
- `POST /api/projects/:id/illustrations/generate` - Generate all prompts
- `POST /api/projects/:id/illustrations/:index/regenerate` - Regenerate single block
- `POST /api/projects/:id/characters/extract` - Extract characters
- `PATCH /api/projects/:id/characters` - Update characters
- `PATCH /api/projects/:id/settings` - Update settings
