# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BrewMaster AI is a TypeScript/React PWA for brewery inventory management with Google Gemini AI integration. The entire application is contained in a single `index.tsx` file (~1900 lines).

## Development Commands

```bash
npm install          # Install dependencies (required first)
npm run dev          # Start Vite dev server on port 3000
npm run build        # Production build to dist/
npm run preview      # Preview production build
```

## Environment Setup

Set `GEMINI_API_KEY` in `.env.local` with a valid Google Gemini API key.

## Architecture

### Monolithic Single-File Structure

All React components, types, and logic are in `index.tsx`. Key sections:
- Type definitions (InventoryItem, Recipe, ScheduledBrew, UserAccount, etc.)
- Custom hooks (`useStickyState` for localStorage persistence)
- AI configuration with Gemini function calling
- Components: Root (auth), BreweryApp (main), NotificationBell, InventoryActionButtons

### Multi-Tenant Data Model

Data is scoped per brewery using localStorage keys: `{breweryName}_{dataType}`. Each brewery has isolated inventory, recipes, schedules, and users.

### Authentication & Roles

Simple credential-based auth with 4 roles: admin, brewer, assistant, tester. Role-based access controls feature visibility.

### AI Integration

Google Gemini 2.5 Flash with function calling tools:
- `updateInventory` - Modify inventory quantities
- `getInventory` - Query current stock levels

AI uses Russian language system prompts. Conversation context limited to last 6 messages.

### PWA Features

- Service Worker (`sw.js`) for offline caching
- `manifest.json` for installable app metadata
- Before-install-prompt handling for app installation

### Dependencies

React, React-DOM, Lucide icons, and Tailwind CSS are served via CDN (not bundled). The `@google/genai` package is the only npm dependency used at runtime.

## Key Business Logic

- **Inventory Reservation**: Quantities are reserved when brews are scheduled
- **Low-Stock Alerts**: Triggered when items fall below minimum level thresholds
- **Audit Logging**: All inventory changes are logged with timestamps and user attribution
- **Production Workflow**: Check ingredients → Execute brew → Update inventory → Log action
