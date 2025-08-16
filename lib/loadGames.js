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

          // Only update if we have valid scores or status change
          if (gameUpdate.home_score !== null || gameUpdate.away_score !== null || gameUpdate.status) {
            const { error } = await supabase
              .from('games')
              .update(gameUpdate)
              .eq('game_id', game.id); // ESPN game ID should match our stored game_id

            if (error) {
              console.error('Error updating scores for game:', game.id, error);
              errors++;
            } else {
              console.log(`Updated week ${actualWeek} scores: ${awayTeam.team.abbreviation} ${gameUpdate.away_score} - ${homeTeam.team.abbreviation} ${gameUpdate.home_score} (${gameUpdate.status})`);
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
