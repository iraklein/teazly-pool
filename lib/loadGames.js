// Updated lib/loadGames.js - Use week_number instead of week_id

import { supabase } from './supabase.js';

// Team name standardization mapping (full names to abbreviations)
const TEAM_NAME_MAP = {
  // AFC East
  'Buffalo Bills': 'BUF',
  'Miami Dolphins': 'MIA', 
  'New England Patriots': 'NE',
  'New York Jets': 'NYJ',
  
  // AFC North  
  'Baltimore Ravens': 'BAL',
  'Cincinnati Bengals': 'CIN',
  'Cleveland Browns': 'CLE',
  'Pittsburgh Steelers': 'PIT',
  
  // AFC South
  'Houston Texans': 'HOU',
  'Indianapolis Colts': 'IND',
  'Jacksonville Jaguars': 'JAX',
  'Tennessee Titans': 'TEN',
  
  // AFC West
  'Denver Broncos': 'DEN',
  'Kansas City Chiefs': 'KC',
  'Las Vegas Raiders': 'LV',
  'Los Angeles Chargers': 'LAC',
  
  // NFC East
  'Dallas Cowboys': 'DAL',
  'New York Giants': 'NYG',
  'Philadelphia Eagles': 'PHI',
  'Washington Commanders': 'WSH',
  
  // NFC North
  'Chicago Bears': 'CHI',
  'Detroit Lions': 'DET',
  'Green Bay Packers': 'GB',
  'Minnesota Vikings': 'MIN',
  
  // NFC South
  'Atlanta Falcons': 'ATL',
  'Carolina Panthers': 'CAR',
  'New Orleans Saints': 'NO',
  'Tampa Bay Buccaneers': 'TB',
  
  // NFC West
  'Arizona Cardinals': 'ARI',
  'Los Angeles Rams': 'LAR',
  'San Francisco 49ers': 'SF',
  'Seattle Seahawks': 'SEA'
};

// Function to standardize team names to abbreviations
function standardizeTeamName(teamName) {
  // If it's already an abbreviation (2-3 chars), return as-is
  if (teamName && teamName.length <= 3) {
    return teamName.toUpperCase();
  }
  
  // Look up full name in mapping
  const standardized = TEAM_NAME_MAP[teamName];
  if (standardized) {
    return standardized;
  }
  
  // If not found, log it and return original (for debugging new names)
  console.warn(`⚠️  Unknown team name: "${teamName}" - please add to TEAM_NAME_MAP`);
  return teamName;
}

// Function to load NFL games from ESPN API for all weeks
export async function loadNFLGames() {
  try {
    let totalGamesLoaded = 0;
    
    // Load preseason weeks - ESPN uses offset numbering (week 2=preseason week 1, etc.)
    for (let espnWeek = 2; espnWeek <= 4; espnWeek++) {
      const actualWeek = espnWeek - 1; // Convert ESPN week to our week numbering
      console.log(`Loading preseason week ${actualWeek} (ESPN week ${espnWeek})...`);
      
      const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=1&week=${espnWeek}`);
      const data = await response.json();
      
      console.log(`Fetched ${data.events?.length || 0} games from preseason week ${actualWeek}`);
      
      if (data.events) {
        // Process each game
        for (const game of data.events) {
          const homeCompetitor = game.competitions[0].competitors.find(c => c.homeAway === 'home');
          const awayCompetitor = game.competitions[0].competitors.find(c => c.homeAway === 'away');
          
          const gameData = {
            game_id: game.id,
            home_team: standardizeTeamName(homeCompetitor.team.abbreviation || homeCompetitor.team.displayName || homeCompetitor.team.name),
            away_team: standardizeTeamName(awayCompetitor.team.abbreviation || awayCompetitor.team.displayName || awayCompetitor.team.name),
            game_date: game.date,
            status: game.status.type.name.toLowerCase(),
            week_number: actualWeek, // Use our week numbering (1, 2, 3)
            season_type: 1, // Force preseason since we're explicitly querying seasontype=1
            home_score: null,
            away_score: null
          };

          // Extract scores if available
          if (homeCompetitor.score) {
            gameData.home_score = parseInt(homeCompetitor.score) || null;
          }
          if (awayCompetitor.score) {
            gameData.away_score = parseInt(awayCompetitor.score) || null;
          }

          // Insert or update game in database
          const { error } = await supabase
            .from('games')
            .upsert(gameData, { 
              onConflict: 'game_id',
              ignoreDuplicates: false 
            });

          if (error) {
            console.error('Error inserting game:', gameData.game_id, error);
          } else {
            console.log(`Updated week ${actualWeek} game: ${gameData.away_team} @ ${gameData.home_team} (${gameData.home_score || 0}-${gameData.away_score || 0})`);
            totalGamesLoaded++;
          }
        }
      }
      
      // Small delay between requests to be nice to ESPN's API
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`Finished loading ${totalGamesLoaded} total games from all preseason weeks`);
    return { totalGamesLoaded };
  } catch (error) {
    console.error('Error loading NFL games:', error);
    throw error;
  }
}

// Function to load the entire NFL season (preseason, regular season, playoffs)
export async function loadEntireNFLSeason() {
  try {
    let totalGamesLoaded = 0;
    
    console.log('Loading entire 2025 NFL season from ESPN...');
    
    // 1. Load Preseason (weeks 1-3, ESPN weeks 2-4)
    console.log('Loading preseason games...');
    for (let espnWeek = 2; espnWeek <= 4; espnWeek++) {
      const actualWeek = espnWeek - 1;
      console.log(`Loading preseason week ${actualWeek} (ESPN week ${espnWeek})...`);
      
      const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=1&week=${espnWeek}`);
      const data = await response.json();
      
      if (data.events) {
        for (const game of data.events) {
          const gameData = await processESPNGame(game, actualWeek, 1);
          const result = await upsertGame(gameData);
          if (result.success) totalGamesLoaded++;
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // 2. Load Regular Season (weeks 1-18)
    console.log('Loading regular season games...');
    for (let week = 1; week <= 18; week++) {
      console.log(`Loading regular season week ${week}...`);
      
      const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=2&week=${week}`);
      const data = await response.json();
      
      if (data.events) {
        for (const game of data.events) {
          const gameData = await processESPNGame(game, week, 2);
          const result = await upsertGame(gameData);
          if (result.success) totalGamesLoaded++;
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // 3. Load Playoffs (weeks 1-5: Wild Card, Divisional, Conference, Pro Bowl, Super Bowl)
    console.log('Loading playoff games...');
    for (let week = 1; week <= 5; week++) {
      console.log(`Loading playoff week ${week}...`);
      
      const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=3&week=${week}`);
      const data = await response.json();
      
      if (data.events) {
        for (const game of data.events) {
          const gameData = await processESPNGame(game, week, 3);
          const result = await upsertGame(gameData);
          if (result.success) totalGamesLoaded++;
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`Finished loading entire season: ${totalGamesLoaded} total games loaded`);
    return { totalGamesLoaded };
  } catch (error) {
    console.error('Error loading entire NFL season:', error);
    throw error;
  }
}

// Helper function to process ESPN game data
async function processESPNGame(game, weekNumber, seasonType) {
  const homeCompetitor = game.competitions[0].competitors.find(c => c.homeAway === 'home');
  const awayCompetitor = game.competitions[0].competitors.find(c => c.homeAway === 'away');
  
  // Use team.abbreviation first, fall back to team.displayName if needed
  const rawHomeTeam = homeCompetitor.team.abbreviation || homeCompetitor.team.displayName || homeCompetitor.team.name;
  const rawAwayTeam = awayCompetitor.team.abbreviation || awayCompetitor.team.displayName || awayCompetitor.team.name;
  
  // Extract quarter and clock info for live games
  let quarter = null;
  let clock = null;
  
  if (game.status && game.status.period) {
    quarter = game.status.period;
  }
  
  if (game.status && game.status.clock) {
    clock = game.status.clock;
  }

  return {
    game_id: game.id,
    home_team: standardizeTeamName(rawHomeTeam),
    away_team: standardizeTeamName(rawAwayTeam),
    game_date: game.date,
    status: game.status.type.name.toLowerCase(),
    week_number: weekNumber,
    season_type: seasonType,
    home_score: parseInt(homeCompetitor.score) || null,
    away_score: parseInt(awayCompetitor.score) || null,
    spread: null, // ESPN doesn't provide spreads
    quarter: quarter,
    clock: clock
  };
}

// Helper function to upsert game data
async function upsertGame(gameData) {
  try {
    const { error } = await supabase
      .from('games')
      .upsert(gameData, { 
        onConflict: 'game_id',
        ignoreDuplicates: false 
      });

    if (error) {
      console.error('Error upserting game:', gameData.game_id, error);
      return { success: false, error };
    } else {
      console.log(`Upserted game: ${gameData.away_team} @ ${gameData.home_team} (Week ${gameData.week_number}, Season ${gameData.season_type})`);
      return { success: true };
    }
  } catch (error) {
    console.error('Error in upsertGame:', error);
    return { success: false, error };
  }
}

// Function to check if odds should be locked (Wednesday 10am PT or later)
function areOddsLocked() {
  const now = new Date();
  const pst = new Date(now.toLocaleString("en-US", {timeZone: "America/Los_Angeles"}));
  
  const dayOfWeek = pst.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
  
  // Find this week's Wednesday 10am PT
  const thisWednesday = new Date(pst);
  const daysToWednesday = (3 - dayOfWeek + 7) % 7;
  
  if (dayOfWeek <= 3) {
    // If it's Monday, Tuesday, or Wednesday - use this week's Wednesday
    thisWednesday.setDate(pst.getDate() + daysToWednesday);
  } else {
    // If it's Thursday, Friday, Saturday, Sunday - we're past this week's Wednesday
    // Go back to this week's Wednesday
    thisWednesday.setDate(pst.getDate() - (dayOfWeek - 3));
  }
  
  thisWednesday.setHours(10, 0, 0, 0);
  
  // Odds are locked if current time is after this week's Wednesday 10am PT
  return pst >= thisWednesday;
}

// Function to detect if any games are currently live
export async function hasLiveGames() {
  try {
    const { data: liveGames, error } = await supabase
      .from('games')
      .select('id')
      .in('status', ['in_progress', 'live', 'halftime', 'overtime', 'status_in_progress'])
      .limit(1);
      
    if (error) {
      console.error('Error checking for live games:', error);
      return false;
    }
    
    console.log('🔍 Checking for live games:', liveGames?.length || 0, 'found');
    return liveGames && liveGames.length > 0;
  } catch (error) {
    console.error('Error in hasLiveGames:', error);
    return false;
  }
}

// Function to fetch odds from The Odds API and match to current week games only
async function fetchAndMatchOdds() {
  try {
    // Odds locking disabled per user request
    
    console.log('📊 Fetching odds for current week only...');
    
    const oddsUpdated = {
      preseason: 0,
      regular: 0,
      errors: 0
    };
    
    // Only fetch odds for current season type (preseason right now)
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    
    if (currentMonth >= 7 && currentMonth <= 9) {
      // During preseason, only fetch preseason odds
      try {
        const preseasonResponse = await fetch(`https://api.the-odds-api.com/v4/sports/americanfootball_nfl_preseason/odds?regions=us&markets=spreads&oddsFormat=american&apiKey=${process.env.NEXT_PUBLIC_ODDS_API_KEY}`);
        if (preseasonResponse.ok) {
          const preseasonOdds = await preseasonResponse.json();
          oddsUpdated.preseason = await matchOddsToCurrentWeekOnly(preseasonOdds, 1, 2); // season_type 1, week 2
        }
      } catch (error) {
        console.warn('⚠️  Could not fetch preseason odds:', error.message);
        oddsUpdated.errors++;
      }
    } else if (currentMonth >= 9 && currentMonth <= 1) {
      // During regular season, only fetch regular season odds
      try {
        const regularResponse = await fetch(`https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds?regions=us&markets=spreads&oddsFormat=american&apiKey=${process.env.NEXT_PUBLIC_ODDS_API_KEY}`);
        if (regularResponse.ok) {
          const regularOdds = await regularResponse.json();
          // Would need to determine current regular season week
          oddsUpdated.regular = await matchOddsToCurrentWeekOnly(regularOdds, 2, 1); // season_type 2, week 1 (example)
        }
      } catch (error) {
        console.warn('⚠️  Could not fetch regular season odds:', error.message);
        oddsUpdated.errors++;
      }
    }
    
    console.log(`📊 Odds sync complete: ${oddsUpdated.preseason} preseason + ${oddsUpdated.regular} regular season games updated (current week only)`);
    return oddsUpdated;
    
  } catch (error) {
    console.error('❌ Error fetching odds:', error);
    return { preseason: 0, regular: 0, errors: 1 };
  }
}

// Helper function to match odds to current week games only
async function matchOddsToCurrentWeekOnly(oddsData, seasonType, weekNumber) {
  let updated = 0;
  
  for (const oddsGame of oddsData) {
    try {
      // Standardize team names from odds API
      const homeTeam = standardizeTeamName(oddsGame.home_team);
      const awayTeam = standardizeTeamName(oddsGame.away_team);
      
      // Parse game date
      const gameDate = new Date(oddsGame.commence_time);
      
      // Find matching game in database by teams, date, season_type, AND week_number
      const { data: matchingGames, error } = await supabase
        .from('games')
        .select('id, home_team, away_team, game_date, spread')
        .eq('season_type', seasonType)
        .eq('week_number', weekNumber) // Only current week
        .eq('home_team', homeTeam)
        .eq('away_team', awayTeam)
        .gte('game_date', gameDate.toISOString().split('T')[0] + 'T00:00:00Z')
        .lt('game_date', new Date(gameDate.getTime() + 24*60*60*1000).toISOString());
      
      if (error) {
        console.error('Error querying games:', error);
        continue;
      }
      
      if (matchingGames && matchingGames.length > 0) {
        const game = matchingGames[0]; // Take first match
        
        // Extract spread from bookmakers
        let spread = null;
        for (const bookmaker of oddsGame.bookmakers) {
          const spreadMarket = bookmaker.markets.find(m => m.key === 'spreads');
          if (spreadMarket && spreadMarket.outcomes.length >= 2) {
            const homeOutcome = spreadMarket.outcomes.find(o => o.name === oddsGame.home_team);
            if (homeOutcome) {
              spread = homeOutcome.point;
              break;
            }
          }
        }
        
        // Update spread if we found one and it's different
        if (spread !== null && spread !== game.spread) {
          const { error: updateError } = await supabase
            .from('games')
            .update({ spread })
            .eq('id', game.id);
            
          if (updateError) {
            console.error('Error updating spread:', updateError);
          } else {
            console.log(`📊 Updated spread: ${awayTeam} @ ${homeTeam} → ${spread}`);
            updated++;
          }
        }
      }
    } catch (gameError) {
      console.error('Error processing odds for game:', oddsGame.id, gameError);
    }
  }
  
  return updated;
}

// Helper function to match odds to games by teams and date (LEGACY - not used)
async function matchOddsToGames(oddsData, seasonType) {
  let updated = 0;
  
  for (const oddsGame of oddsData) {
    try {
      // Standardize team names from odds API
      const homeTeam = standardizeTeamName(oddsGame.home_team);
      const awayTeam = standardizeTeamName(oddsGame.away_team);
      
      // Parse game date
      const gameDate = new Date(oddsGame.commence_time);
      const gameDateStr = gameDate.toISOString().split('T')[0]; // YYYY-MM-DD format
      
      // Find matching game in database by teams and date (within 24 hours)
      const { data: matchingGames, error } = await supabase
        .from('games')
        .select('id, home_team, away_team, game_date, spread')
        .eq('season_type', seasonType)
        .eq('home_team', homeTeam)
        .eq('away_team', awayTeam)
        .gte('game_date', gameDate.toISOString().split('T')[0] + 'T00:00:00Z')
        .lt('game_date', new Date(gameDate.getTime() + 24*60*60*1000).toISOString());
      
      if (error) {
        console.error('Error querying games:', error);
        continue;
      }
      
      if (matchingGames && matchingGames.length > 0) {
        const game = matchingGames[0]; // Take first match
        
        // Extract spread from bookmakers
        let spread = null;
        for (const bookmaker of oddsGame.bookmakers) {
          const spreadMarket = bookmaker.markets.find(m => m.key === 'spreads');
          if (spreadMarket && spreadMarket.outcomes.length >= 2) {
            const homeOutcome = spreadMarket.outcomes.find(o => o.name === oddsGame.home_team);
            if (homeOutcome) {
              spread = homeOutcome.point;
              break;
            }
          }
        }
        
        // Update spread if we found one and it's different
        if (spread !== null && spread !== game.spread) {
          const { error: updateError } = await supabase
            .from('games')
            .update({ spread })
            .eq('id', game.id);
            
          if (updateError) {
            console.error('Error updating spread:', updateError);
          } else {
            console.log(`📊 Updated spread: ${awayTeam} @ ${homeTeam} → ${spread}`);
            updated++;
          }
        }
      }
    } catch (gameError) {
      console.error('Error processing odds for game:', oddsGame.id, gameError);
    }
  }
  
  return updated;
}

// Separate function to sync just live scores (fast, for live games)
export async function syncLiveScoresOnly() {
  try {
    console.log('⚡ Quick sync: Updating live scores...');
    let updated = 0;
    let errors = 0;

    // Update scores for preseason weeks - ESPN uses offset numbering
    for (let espnWeek = 2; espnWeek <= 4; espnWeek++) {
      const actualWeek = espnWeek - 1;
      
      const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=1&week=${espnWeek}`);
      const data = await response.json();
      
      if (data.events) {
        for (const game of data.events) {
          // Only update if game is live/in-progress
          if (['in_progress', 'live', 'halftime', 'overtime'].includes(game.status.type.name.toLowerCase())) {
            const competition = game.competitions[0];
            const homeTeam = competition.competitors.find(c => c.homeAway === 'home');
            const awayTeam = competition.competitors.find(c => c.homeAway === 'away');
            
            const gameUpdate = {
              home_score: parseInt(homeTeam.score) || null,
              away_score: parseInt(awayTeam.score) || null,
              status: game.status.type.name.toLowerCase()
            };

            const { error } = await supabase
              .from('games')
              .update(gameUpdate)
              .eq('game_id', game.id);

            if (error) {
              console.error('Error updating live scores:', game.id, error);
              errors++;
            } else {
              console.log(`⚡ Live update: ${awayTeam.team.abbreviation} ${gameUpdate.away_score} - ${homeTeam.team.abbreviation} ${gameUpdate.home_score}`);
              updated++;
            }
          }
        }
      }
    }

    // Also check regular season games
    for (let week = 1; week <= 18; week++) {
      const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=2&week=${week}`);
      const data = await response.json();
      
      if (data.events) {
        for (const game of data.events) {
          if (['in_progress', 'live', 'halftime', 'overtime'].includes(game.status.type.name.toLowerCase())) {
            const competition = game.competitions[0];
            const homeTeam = competition.competitors.find(c => c.homeAway === 'home');
            const awayTeam = competition.competitors.find(c => c.homeAway === 'away');
            
            const gameUpdate = {
              home_score: parseInt(homeTeam.score) || null,
              away_score: parseInt(awayTeam.score) || null,
              status: game.status.type.name.toLowerCase()
            };

            const { error } = await supabase
              .from('games')
              .update(gameUpdate)
              .eq('game_id', game.id);

            if (error) {
              errors++;
            } else {
              updated++;
            }
          }
        }
      }
    }

    console.log(`⚡ Live scores sync complete: ${updated} games updated, ${errors} errors`);
    return { updated, errors };
  } catch (error) {
    console.error('❌ Error syncing live scores:', error);
    return { updated: 0, errors: 1 };
  }
}

// Auto-sync function that runs continuously in background - OPTIMIZED for current week only
export async function autoSyncNFLSchedule() {
  try {
    console.log('🔄 Auto-sync: Checking current week updates only...');
    let totalUpdated = 0;
    
    // Only sync current week for performance
    // Determine current week (simplified for now - can use detection logic later)
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    
    if (currentMonth >= 7 && currentMonth <= 9) {
      // During preseason, sync current preseason week only
      console.log('🏈 Auto-sync: Syncing current preseason week 2...');
      const result = await syncESPNWeek(1, 3, 2); // ESPN week 3 = our week 2
      totalUpdated += result.updated;
    } else if (currentMonth >= 9 && currentMonth <= 1) {
      // During regular season, would sync current regular week
      console.log('🏈 Auto-sync: Regular season sync (not implemented yet)');
    }
    
    // Always fetch odds for current games
    console.log('📊 Syncing odds...');
    const oddsResult = await fetchAndMatchOdds();
    
    console.log(`✅ Auto-sync complete: ${totalUpdated} games updated, ${oddsResult.preseason + oddsResult.regular} spreads updated`);
    return { 
      totalUpdated, 
      oddsUpdated: oddsResult.preseason + oddsResult.regular,
      success: true 
    };
    
  } catch (error) {
    console.error('❌ Auto-sync error:', error);
    return { totalUpdated: 0, success: false, error };
  }
}

// Helper function to sync a specific week from ESPN
async function syncESPNWeek(seasonType, espnWeek, actualWeek) {
  try {
    const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=${seasonType}&week=${espnWeek}`);
    
    if (!response.ok) {
      console.log(`⚠️  ESPN API error for season ${seasonType} week ${espnWeek}: ${response.status}`);
      return { updated: 0 };
    }
    
    const data = await response.json();
    let updated = 0;
    
    if (data.events) {
      for (const game of data.events) {
        const gameData = await processESPNGame(game, actualWeek, seasonType);
        const result = await upsertGame(gameData);
        if (result.success) updated++;
      }
    }
    
    return { updated };
  } catch (error) {
    console.error(`Error syncing season ${seasonType} week ${espnWeek}:`, error);
    return { updated: 0 };
  }
}

// Function to create a current week if none exists (simplified)
// Function to clear all games from database (for fresh start)
export async function clearAllGames() {
  try {
    console.log('🗑️  Clearing all games from database...');
    
    const { error } = await supabase
      .from('games')
      .delete()
      .neq('id', 0); // Delete all records (using neq with impossible condition)
      
    if (error) {
      throw error;
    }
    
    console.log('✅ All games cleared from database');
    return { success: true };
  } catch (error) {
    console.error('❌ Error clearing games:', error);
    throw error;
  }
}

// Function to standardize existing team names in database
export async function standardizeExistingTeamNames() {
  try {
    console.log('🔧 Standardizing existing team names in database...');
    
    // Get all games from database
    const { data: games, error: fetchError } = await supabase
      .from('games')
      .select('id, home_team, away_team');
      
    if (fetchError) {
      throw fetchError;
    }
    
    let updated = 0;
    
    for (const game of games) {
      const standardizedHome = standardizeTeamName(game.home_team);
      const standardizedAway = standardizeTeamName(game.away_team);
      
      // Only update if names actually changed
      if (standardizedHome !== game.home_team || standardizedAway !== game.away_team) {
        const { error: updateError } = await supabase
          .from('games')
          .update({
            home_team: standardizedHome,
            away_team: standardizedAway
          })
          .eq('id', game.id);
          
        if (updateError) {
          console.error('Error updating game:', game.id, updateError);
        } else {
          console.log(`✅ Standardized: ${game.home_team} → ${standardizedHome}, ${game.away_team} → ${standardizedAway}`);
          updated++;
        }
      }
    }
    
    console.log(`🎉 Standardization complete: ${updated} games updated`);
    return { updated };
  } catch (error) {
    console.error('❌ Error standardizing team names:', error);
    throw error;
  }
}

export async function ensureCurrentWeek() {
  try {
    // Check if there's a current week
    const { data: currentWeek } = await supabase
      .from('weeks')
      .select('*')
      .eq('is_current', true)
      .single();

    if (!currentWeek) {
      // Create a current week matching the games we loaded
      const { error } = await supabase
        .from('weeks')
        .insert({
          week_number: 3, // Match the preseason week 3 games we loaded
          year: 2025,
          deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          picks_locked: false,
          is_current: true,
          pick_count: 4,
          tease_points: 14
        });

      if (error) {
        console.error('Error creating current week:', error);
      } else {
        console.log('Created current week 3');
      }
    }
  } catch (error) {
    console.error('Error ensuring current week:', error);
  }
}

// Function to update live scores from ESPN API for all weeks
export async function updateLiveScores() {
  try {
    console.log('Fetching live scores from ESPN for all preseason weeks...');
    
    let updated = 0;
    let errors = 0;

    // Update scores for preseason weeks - ESPN uses offset numbering
    for (let espnWeek = 2; espnWeek <= 4; espnWeek++) {
      const actualWeek = espnWeek - 1; // Convert ESPN week to our week numbering  
      console.log(`Checking scores for preseason week ${actualWeek} (ESPN week ${espnWeek})...`);
      
      const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=1&week=${espnWeek}`);
      const data = await response.json();
      
      if (!data.events) {
        console.log(`No games found for week ${actualWeek}`);
        continue;
      }

      // Process each game for score updates
      for (const game of data.events) {
        try {
          const competition = game.competitions[0];
          const homeTeam = competition.competitors.find(c => c.homeAway === 'home');
          const awayTeam = competition.competitors.find(c => c.homeAway === 'away');
          
          // Extract scores and game status
          const gameUpdate = {
            home_score: parseInt(homeTeam.score) || null,
            away_score: parseInt(awayTeam.score) || null,
            status: game.status.type.name.toLowerCase()
          };

          // First check if game exists in database
          const { data: existingGame } = await supabase
            .from('games')
            .select('id')
            .eq('game_id', game.id)
            .single();

          if (existingGame) {
            // Game exists, update it if we have valid scores or status change
            if (gameUpdate.home_score !== null || gameUpdate.away_score !== null || gameUpdate.status) {
              const { error } = await supabase
                .from('games')
                .update(gameUpdate)
                .eq('game_id', game.id);

              if (error) {
                console.error('Error updating scores for game:', game.id, error);
                errors++;
              } else {
                console.log(`Updated week ${actualWeek} scores: ${awayTeam.team.abbreviation} ${gameUpdate.away_score} - ${homeTeam.team.abbreviation} ${gameUpdate.home_score} (${gameUpdate.status})`);
                updated++;
              }
            }
          } else {
            // Game doesn't exist, insert it
            const newGameData = {
              game_id: game.id,
              home_team: standardizeTeamName(homeTeam.team.abbreviation || homeTeam.team.displayName || homeTeam.team.name),
              away_team: standardizeTeamName(awayTeam.team.abbreviation || awayTeam.team.displayName || awayTeam.team.name),
              game_date: game.date,
              status: gameUpdate.status,
              week_number: actualWeek,
              season_type: 1, // Preseason
              home_score: gameUpdate.home_score,
              away_score: gameUpdate.away_score,
              spread: null // ESPN doesn't provide spreads
            };

            const { error } = await supabase
              .from('games')
              .insert(newGameData);

            if (error) {
              console.error('Error inserting new game:', game.id, error);
              errors++;
            } else {
              console.log(`Inserted new week ${actualWeek} game: ${awayTeam.team.abbreviation} ${gameUpdate.away_score} - ${homeTeam.team.abbreviation} ${gameUpdate.home_score} (${gameUpdate.status})`);
              updated++;
            }
          }
        } catch (gameError) {
          console.error('Error processing game:', game.id, gameError);
          errors++;
        }
      }
      
      // Small delay between week requests
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`Live score update complete: ${updated} games updated, ${errors} errors`);
    return { updated, errors };
    
  } catch (error) {
    console.error('Error fetching live scores:', error);
    return { updated: 0, errors: 1 };
  }
}

// Main function to run both
export async function initializeGames() {
  await ensureCurrentWeek();
  await loadNFLGames();
}
