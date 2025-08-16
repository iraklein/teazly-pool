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
    spread: null // ESPN doesn't provide spreads
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

// Function to fetch odds from The Odds API and match to games
async function fetchAndMatchOdds() {
  try {
    console.log('📊 Fetching odds from The Odds API...');
    
    const oddsUpdated = {
      preseason: 0,
      regular: 0,
      errors: 0
    };
    
    // Fetch preseason odds
    try {
      const preseasonResponse = await fetch(`https://api.the-odds-api.com/v4/sports/americanfootball_nfl_preseason/odds?regions=us&markets=spreads&oddsFormat=american&apiKey=${process.env.NEXT_PUBLIC_ODDS_API_KEY}`);
      if (preseasonResponse.ok) {
        const preseasonOdds = await preseasonResponse.json();
        oddsUpdated.preseason = await matchOddsToGames(preseasonOdds, 1); // season_type 1 = preseason
      }
    } catch (error) {
      console.warn('⚠️  Could not fetch preseason odds:', error.message);
      oddsUpdated.errors++;
    }
    
    // Fetch regular season odds  
    try {
      const regularResponse = await fetch(`https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds?regions=us&markets=spreads&oddsFormat=american&apiKey=${process.env.NEXT_PUBLIC_ODDS_API_KEY}`);
      if (regularResponse.ok) {
        const regularOdds = await regularResponse.json();
        oddsUpdated.regular = await matchOddsToGames(regularOdds, 2); // season_type 2 = regular season
      }
    } catch (error) {
      console.warn('⚠️  Could not fetch regular season odds:', error.message);
      oddsUpdated.errors++;
    }
    
    console.log(`📊 Odds sync complete: ${oddsUpdated.preseason} preseason + ${oddsUpdated.regular} regular season games updated`);
    return oddsUpdated;
    
  } catch (error) {
    console.error('❌ Error fetching odds:', error);
    return { preseason: 0, regular: 0, errors: 1 };
  }
}

// Helper function to match odds to games by teams and date
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

// Auto-sync function that runs continuously in background
export async function autoSyncNFLSchedule() {
  try {
    console.log('🔄 Auto-sync: Checking for NFL schedule updates...');
    let totalUpdated = 0;
    
    // Get current date to determine what to sync
    const now = new Date();
    const currentMonth = now.getMonth() + 1; // 1-12
    
    // Determine what parts of season to sync based on current date
    let shouldSyncPreseason = currentMonth >= 7 && currentMonth <= 9; // July-September
    let shouldSyncRegularSeason = currentMonth >= 8 && currentMonth <= 1; // August-January
    let shouldSyncPlayoffs = currentMonth >= 1 && currentMonth <= 2; // January-February
    
    // Always sync current period plus adjacent periods for schedule changes
    if (currentMonth >= 7) shouldSyncPreseason = true;
    if (currentMonth >= 8 || currentMonth <= 2) shouldSyncRegularSeason = true;
    if (currentMonth >= 12 || currentMonth <= 3) shouldSyncPlayoffs = true;
    
    // 1. Sync Preseason if in/near preseason
    if (shouldSyncPreseason) {
      console.log('🏈 Auto-sync: Syncing preseason...');
      for (let espnWeek = 2; espnWeek <= 4; espnWeek++) {
        const actualWeek = espnWeek - 1;
        const result = await syncESPNWeek(1, espnWeek, actualWeek);
        totalUpdated += result.updated;
        await new Promise(resolve => setTimeout(resolve, 200)); // Slower for background
      }
    }
    
    // 2. Sync Regular Season if in/near regular season
    if (shouldSyncRegularSeason) {
      console.log('🏈 Auto-sync: Syncing regular season...');
      for (let week = 1; week <= 18; week++) {
        const result = await syncESPNWeek(2, week, week);
        totalUpdated += result.updated;
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    // 3. Sync Playoffs if in/near playoffs
    if (shouldSyncPlayoffs) {
      console.log('🏆 Auto-sync: Syncing playoffs...');
      for (let week = 1; week <= 5; week++) {
        const result = await syncESPNWeek(3, week, week);
        totalUpdated += result.updated;
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    // After syncing games, fetch and match odds
    console.log('📊 Syncing odds...');
    const oddsResult = await fetchAndMatchOdds();
    
    console.log(`✅ Auto-sync complete: ${totalUpdated} games updated/added, ${oddsResult.preseason + oddsResult.regular} spreads updated`);
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
