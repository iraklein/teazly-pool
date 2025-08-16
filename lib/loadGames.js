// Updated lib/loadGames.js - Use week_number instead of week_id

import { supabase } from './supabase.js';

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
          const gameData = {
            game_id: game.id,
            home_team: game.competitions[0].competitors.find(c => c.homeAway === 'home').team.abbreviation,
            away_team: game.competitions[0].competitors.find(c => c.homeAway === 'away').team.abbreviation,
            game_date: game.date,
            status: game.status.type.name.toLowerCase(),
            week_number: actualWeek, // Use our week numbering (1, 2, 3)
            season_type: 1, // Force preseason since we're explicitly querying seasontype=1
            home_score: null,
            away_score: null
          };

          // Extract scores if available
          const homeCompetitor = game.competitions[0].competitors.find(c => c.homeAway === 'home');
          const awayCompetitor = game.competitions[0].competitors.find(c => c.homeAway === 'away');
          
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
  
  return {
    game_id: game.id,
    home_team: homeCompetitor.team.abbreviation,
    away_team: awayCompetitor.team.abbreviation,
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
    
    console.log(`✅ Auto-sync complete: ${totalUpdated} games updated/added`);
    return { totalUpdated, success: true };
    
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
              home_team: homeTeam.team.abbreviation,
              away_team: awayTeam.team.abbreviation,
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
