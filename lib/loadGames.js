// Add this to your project as: lib/loadGames.js

import { supabase } from './supabase.js';

// Function to load NFL games from ESPN API
export async function loadNFLGames() {
  try {
    // Get current season games from ESPN
    const response = await fetch('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard');
    const data = await response.json();
    
    console.log('Fetched games from ESPN:', data.events?.length || 0);
    
    if (!data.events) {
      console.log('No games found in API response');
      return;
    }

    // Process each game
    for (const game of data.events) {
      const gameData = {
        game_id: game.id,
        home_team: game.competitions[0].competitors.find(c => c.homeAway === 'home').team.abbreviation,
        away_team: game.competitions[0].competitors.find(c => c.homeAway === 'away').team.abbreviation,
        game_date: game.date,
        status: game.status.type.name.toLowerCase(),
        week_number: game.week?.number || 1,
        season_type: game.season?.type || 2 // 1=preseason, 2=regular, 3=postseason
      };

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
        console.log('Updated game:', gameData.home_team, 'vs', gameData.away_team);
      }
    }

    console.log('Finished loading games');
  } catch (error) {
    console.error('Error loading NFL games:', error);
  }
}

// Function to create a current week if none exists
export async function ensureCurrentWeek() {
  try {
    // Check if there's a current week
    const { data: currentWeek } = await supabase
      .from('weeks')
      .select('*')
      .eq('is_current', true)
      .single();

    if (!currentWeek) {
      // Create a current week (preseason week 1)
      const { error } = await supabase
        .from('weeks')
        .insert({
          week_number: 1,
          year: 2025,
          deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 1 week from now
          picks_locked: false,
          is_current: true,
          pick_count: 4,
          tease_points: 14
        });

      if (error) {
        console.error('Error creating current week:', error);
      } else {
        console.log('Created current week');
      }
    }
  } catch (error) {
    console.error('Error ensuring current week:', error);
  }
}

// Main function to run both
export async function initializeGames() {
  await ensureCurrentWeek();
  await loadNFLGames();
}
