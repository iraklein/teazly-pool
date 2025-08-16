# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
# Development server
npm run dev

# Production build
npm run build

# Start production server
npm start
```

## Environment Setup

This project requires environment variables in `.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key
- `NEXT_PUBLIC_ODDS_API_KEY` - The Odds API key for fetching NFL game data

## Architecture Overview

### Core Application Structure
- **Single-page application** built with Next.js using pages router
- **Main application**: `pages/index.js` contains the entire TeazlyPool component (~1000+ lines)
- **Admin interface**: `pages/admin.js` for loading NFL games from ESPN API
- **Database**: Supabase with PostgreSQL backend

### Key Database Tables
- `users` - User profiles with authentication IDs, usernames, winnings
- `weeks` - NFL weeks with current week tracking, pick deadlines
- `games` - NFL games with spreads, scores, status, week numbers
- `picks` - User picks (4 per week) with team selections and pick numbers

### Data Flow Architecture
1. **Authentication**: Supabase auth with email/password
2. **Game Loading**: Dual API integration:
   - ESPN API (via `lib/loadGames.js`) for basic game data
   - The Odds API (in main component) for spreads and betting lines
3. **Pick Management**: 4-team teaser system with 14-point spreads
4. **Scoring**: Real-time calculation of teased spreads and win/loss tracking

### NFL Season Structure
- **Preseason**: P1-P3 (weeks 1-3, August)
- **Regular Season**: W1-W18 (weeks 1-18, September-January)  
- **Playoffs**: WC, DIV, CONF, SB
- **Week Detection**: Hardcoded calendar in `NFL_CALENDAR_2025` object

### Component Architecture Patterns
- **State Management**: React useState for all state (no external store)
- **Data Loading**: useEffect hooks with Supabase queries
- **URL Routing**: Query parameter-based view switching (`?view=picks`)
- **Admin Functions**: Embedded within main component, conditionally rendered
- **Live Updates**: Real-time polling with useEffect intervals for active games
- **Standings Calculation**: Dynamic calculation of live standings with vig system

### Critical Business Logic
- **Pick Locking**: Time-based and manual deadline enforcement
- **Teaser Calculations**: 14-point spreads applied to all picks
- **Win Conditions**: All 4 picks must win for weekly success
- **Game Time Rounding**: API times rounded to standard NFL start times
- **Real-time Scoring**: Live standings calculation with $5 vig system
- **$5 Vig System**: Winners get $5 × losers, losers pay $5 × winners
- **Live Polling**: 30-second intervals for game score updates when games are active

### API Integration Points
- **Supabase Client**: `lib/supabase.js` - shared client instance
- **ESPN Games**: `lib/loadGames.js` - game loading utilities with live score updates
- **ESPN Live Scores**: `updateLiveScores()` function automatically fetches scores every 30 seconds
- **The Odds API**: Direct fetch calls in main component for spreads

### Security & Access Control
- **Authentication**: Supabase auth with automatic profile creation
- **Admin Rights**: `is_admin` flag in users table
- **Pick Deadlines**: Enforced at both UI and submission levels
- **Game Locking**: Prevents picks on started games