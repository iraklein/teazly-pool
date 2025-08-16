import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabase';
import { autoSyncNFLSchedule, syncLiveScoresOnly, hasLiveGames } from '../lib/loadGames';

const TeazlyPool = () => {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState('dashboard');
  const [currentWeek, setCurrentWeek] = useState(null);
  const [games, setGames] = useState([]);
  const [picks, setPicks] = useState([]);
  const [standings, setStandings] = useState([]);
  const [userPicks, setUserPicks] = useState({ pick1: '', pick2: '', pick3: '', pick4: '' });
  const [currentUserProfile, setCurrentUserProfile] = useState(null);
  const [liveStandings, setLiveStandings] = useState([]);
  const [allUserPicks, setAllUserPicks] = useState([]);
  const [isPolling, setIsPolling] = useState(false);

  // Helper function to round game times to normal NFL start times
  const roundToNormalGameTime = (apiTime) => {
    const date = new Date(apiTime);
    const minutes = date.getMinutes();
    
    // Round :01 to :00, keep other common NFL times (:15, :25, :30)
    if (minutes === 1) {
      date.setMinutes(0);
    }
    
    return date.toISOString();
  };

// NFL Calendar Configuration - Step 1: Read-only detection
const NFL_CALENDAR_2025 = {
  preseason: {
    week1: { start: '2025-08-08', end: '2025-08-14' },
    week2: { start: '2025-08-15', end: '2025-08-21' },
    week3: { start: '2025-08-22', end: '2025-08-28' }
  },
  regular: {
    week1: { start: '2025-09-04', end: '2025-09-10' },
    week2: { start: '2025-09-11', end: '2025-09-17' },
    // ... we can add more weeks later
  }
};

// Step 1: Detect current week using Tuesday-Monday periods
const getCurrentNFLWeek = () => {
  const now = new Date();
  
  // Get the current Tuesday-Monday week period
  // If today is Monday, we're still in the same week
  // If today is Tuesday or later, we might be in a new week
  
  const dayOfWeek = now.getDay(); // 0=Sunday, 1=Monday, 2=Tuesday, etc.
  
  // Calculate the Tuesday that starts the current week
  let weekStartTuesday = new Date(now);
  
  if (dayOfWeek === 0) {
    // Sunday - go back 5 days to get Tuesday
    weekStartTuesday.setDate(now.getDate() - 5);
  } else if (dayOfWeek === 1) {
    // Monday - go back 6 days to get Tuesday  
    weekStartTuesday.setDate(now.getDate() - 6);
  } else {
    // Tuesday (2) through Saturday (6) - go back to most recent Tuesday
    weekStartTuesday.setDate(now.getDate() - (dayOfWeek - 2));
  }
  
  const weekStart = weekStartTuesday.toISOString().split('T')[0];
  
  // Determine what NFL week this maps to based on preseason schedule
  // Preseason 2025: 
  // P1: Tuesday Aug 6 - Monday Aug 12  
  // P2: Tuesday Aug 13 - Monday Aug 19
  // P3: Tuesday Aug 20 - Monday Aug 26
  
  if (weekStart >= '2025-08-06' && weekStart <= '2025-08-12') {
    return {
      season_type: 1,
      week_number: 1,
      week_name: 'Preseason Week 1',
      week_start: weekStart,
      detected: true
    };
  } else if (weekStart >= '2025-08-13' && weekStart <= '2025-08-19') {
    return {
      season_type: 1,
      week_number: 2,
      week_name: 'Preseason Week 2',
      week_start: weekStart,
      detected: true
    };
  } else if (weekStart >= '2025-08-20' && weekStart <= '2025-08-26') {
    return {
      season_type: 1,
      week_number: 3, 
      week_name: 'Preseason Week 3',
      week_start: weekStart,
      detected: true
    };
  }
  
  // For now, default to P2 since we're in preseason
  return {
    season_type: 1,
    week_number: 2,
    week_name: 'Preseason Week 2', 
    week_start: weekStart,
    detected: false
  };
};

// Step 1: Test function - just shows what week it detects
const handleTestWeekDetection = () => {
  const detectedWeek = getCurrentNFLWeek();
  alert(`Detected: ${detectedWeek.week_name} (${detectedWeek.season_type} week ${detectedWeek.week_number})\nAuto-detected: ${detectedWeek.detected}`);
};

// Step 3: Simple function to just toggle is_current
const handleUpdateCurrentWeek = async () => {
  try {
    const detectedWeek = getCurrentNFLWeek();
    console.log('Updating current week to:', detectedWeek);
    
    // Set all weeks to not current
    await supabase
      .from('weeks')
      .update({ is_current: false })
      .neq('id', '00000000-0000-0000-0000-000000000000');
    
    // Set the detected week to current
    const { error } = await supabase
      .from('weeks')
      .update({ is_current: true })
      .eq('week_number', detectedWeek.week_number)
      .eq('season_type', detectedWeek.season_type);
    
    if (error) {
      console.error('Error updating current week:', error);
      alert(`Error: ${error.message}`);
      return;
    }
    
    // Reload the page data
    await loadCurrentWeek();
    
    alert(`✅ Updated current week to: ${detectedWeek.week_name}`);
    
  } catch (error) {
    console.error('Error in handleUpdateCurrentWeek:', error);
    alert(`Error: ${error.message}`);
  }
};


// Smart polling system with different intervals
useEffect(() => {
  let scheduleInterval;
  let liveScoreInterval;
  
  const startSmartPolling = async () => {
    console.log('🚀 Starting smart NFL polling system...');
    
    // Run initial sync
    await autoSyncNFLSchedule();
    
    // 1. Schedule/Odds sync every 5 minutes + auto week detection
    scheduleInterval = setInterval(async () => {
      try {
        // Auto-detect and update current week if needed
        const detectedWeek = getCurrentNFLWeek();
        if (currentWeek && (detectedWeek.week_number !== currentWeek.week_number || detectedWeek.season_type !== currentWeek.season_type)) {
          console.log(`📅 Week change detected: ${currentWeek.week_number} → ${detectedWeek.week_number}, updating database`);
          
          // Set all weeks to not current
          await supabase
            .from('weeks')
            .update({ is_current: false })
            .neq('id', '00000000-0000-0000-0000-000000000000');
          
          // Set the detected week to current (create if doesn't exist)
          const { data: existingWeek } = await supabase
            .from('weeks')
            .select('*')
            .eq('week_number', detectedWeek.week_number)
            .eq('season_type', detectedWeek.season_type)
            .single();
            
          if (existingWeek) {
            await supabase
              .from('weeks')
              .update({ is_current: true })
              .eq('id', existingWeek.id);
          } else {
            // Create new week
            await supabase
              .from('weeks')
              .insert({
                week_number: detectedWeek.week_number,
                season_type: detectedWeek.season_type,
                year: 2025,
                deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                picks_locked: false,
                is_current: true,
                pick_count: 4,
                tease_points: 14
              });
          }
          
          // Reload current week data
          await loadCurrentWeek();
          console.log(`✅ Auto-updated to ${detectedWeek.week_name}`);
        }
        
        const result = await autoSyncNFLSchedule();
        
        // If games were updated and we're viewing current week, refresh the display
        if ((result.totalUpdated > 0 || result.oddsUpdated > 0) && currentWeek) {
          console.log(`🔄 Schedule sync updated ${result.totalUpdated} games + ${result.oddsUpdated} odds, refreshing display`);
          await loadGames(currentWeek.week_number);
        }
      } catch (error) {
        console.error('Schedule sync error:', error);
      }
    }, 5 * 60 * 1000); // 5 minutes
    
    // 2. Live score polling function
    const pollLiveScores = async () => {
      try {
        const hasLive = await hasLiveGames();
        
        if (hasLive) {
          if (!isPolling) {
            setIsPolling(true);
            console.log('⚡ Live games detected - starting live polling indicator');
          }
          
          console.log('⚡ Live games detected - polling scores every 30 seconds');
          const result = await syncLiveScoresOnly();
          
          if (result.updated > 0 && currentWeek) {
            console.log(`⚡ Live scores updated ${result.updated} games, refreshing display`);
            await loadGames(currentWeek.week_number);
          }
        } else {
          if (isPolling) {
            setIsPolling(false);
            console.log('🛑 No live games - stopping live polling indicator');
          }
        }
      } catch (error) {
        console.error('Live score polling error:', error);
      }
    };
    
    // 3. Smart live score interval - checks every 30 seconds when games are live
    liveScoreInterval = setInterval(pollLiveScores, 30 * 1000); // 30 seconds
  };
  
  // Start smart polling when component mounts and user is authenticated
  if (user) {
    startSmartPolling();
  }
  
  // Cleanup intervals on unmount
  return () => {
    if (scheduleInterval) {
      console.log('🛑 Stopping schedule sync');
      clearInterval(scheduleInterval);
    }
    if (liveScoreInterval) {
      console.log('🛑 Stopping live score polling');
      clearInterval(liveScoreInterval);
    }
  };
}, [user, currentWeek]); // Depend on user and currentWeek

  
  // Handle URL routing
  useEffect(() => {
    const { view } = router.query;
    if (view && ['dashboard', 'picks', 'scoring', 'admin'].includes(view)) {
      setCurrentView(view);
    }
  }, [router.query]);

  // Navigation function that updates URL
  const navigateTo = (view) => {
    setCurrentView(view);
    router.push(`/?view=${view}`, undefined, { shallow: true });
  };

  // Simple authentication state - back to working version
  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      setLoading(false);
    };

    checkUser();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        const user = session?.user || null;
        setUser(user);
        setLoading(false);
      }
    );

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (user) {
      loadCurrentWeek();
      loadStandings();
      loadUserProfile();
    }
  }, [user]);

  // Load current week data
  const loadCurrentWeek = async () => {
    const { data: week } = await supabase
      .from('weeks')
      .select('*')
      .eq('is_current', true)
      .single();

    if (week) {
      setCurrentWeek(week);
      loadGames(week.week_number);
      loadUserPicks(week.week_number);
    }
  };

  // Load games for current week
  const loadGames = async (weekNumber) => {
    const { data: games } = await supabase
      .from('games')
      .select('*')
      .eq('week_number', weekNumber)
      .eq('season_type', currentWeek?.season_type || 1) // Filter by season type too
      .order('game_date');

    setGames(games || []);
    console.log(`📋 Loaded ${games?.length || 0} games for week ${weekNumber}, season_type ${currentWeek?.season_type || 1}`);
  };

  // Load user's picks for current week
  const loadUserPicks = async (weekNumber) => {
    const { data: picks } = await supabase
      .from('picks')
      .select('*')
      .eq('user_id', user.id)
      .eq('week_number', weekNumber)
      .order('pick_number');

    const pickMap = { pick1: '', pick2: '', pick3: '', pick4: '' };
    picks?.forEach(pick => {
      pickMap[`pick${pick.pick_number}`] = pick.picked_team;
    });
    setUserPicks(pickMap);
  };

  const loadStandings = async () => {
    const { data: users } = await supabase
      .from('users')
      .select('*')
      .order('total_winnings', { ascending: false });

    setStandings(users || []);
  };

  const loadUserProfile = async () => {
    const { data: profile } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();

    setCurrentUserProfile(profile);
  };

  // NFL API Integration Function with Preseason Support
  const loadNFLGames = async (weekNumber, gameType = 'regular') => {
    try {
      const sportKey = gameType === 'preseason' ? 'americanfootball_nfl_preseason' : 'americanfootball_nfl';
      console.log(`Loading NFL ${gameType} games for week`, weekNumber);
      
      // Fetch games from The Odds API
      const response = await fetch(
        `https://api.the-odds-api.com/v4/sports/${sportKey}/odds?regions=us&markets=spreads&oddsFormat=american&apiKey=${process.env.NEXT_PUBLIC_ODDS_API_KEY}`
      );
      
      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }
      
      const gamesData = await response.json();
      console.log(`Fetched ${gameType} games from API:`, gamesData.length);
      
      // Log the first few raw game times to debug
      if (gamesData.length > 0) {
        console.log('Sample raw API times:');
        gamesData.slice(0, 3).forEach(game => {
          console.log(`${game.away_team} @ ${game.home_team}: ${game.commence_time}`);
        });
      }
      
      // Transform API data to your database format
      const gamesToInsert = gamesData.map(game => {
        // Find the spread from bookmakers (use first available)
        let spread = null;
        for (const bookmaker of game.bookmakers) {
          const spreadMarket = bookmaker.markets.find(m => m.key === 'spreads');
          if (spreadMarket && spreadMarket.outcomes.length >= 2) {
            // Get home team spread (negative means they're favored)
            const homeOutcome = spreadMarket.outcomes.find(o => o.name === game.home_team);
            if (homeOutcome) {
              spread = homeOutcome.point;
              break;
            }
          }
        }
        
        // Standardize team names (The Odds API usually returns abbreviations, but let's be safe)
        const standardizeTeamName = (name) => {
          if (!name) return name;
          // Common mapping for The Odds API variations
          const nameMap = {
            'Las Vegas Raiders': 'LV',
            'Los Angeles Rams': 'LAR', 
            'Los Angeles Chargers': 'LAC',
            'New York Giants': 'NYG',
            'New York Jets': 'NYJ',
            'New England Patriots': 'NE',
            'San Francisco 49ers': 'SF',
            'Tampa Bay Buccaneers': 'TB',
            'Green Bay Packers': 'GB',
            'Kansas City Chiefs': 'KC'
          };
          return nameMap[name] || name;
        };

        return {
          id: game.id,
          week_number: weekNumber,
          home_team: standardizeTeamName(game.home_team),
          away_team: standardizeTeamName(game.away_team),
          spread: spread,
          game_date: roundToNormalGameTime(game.commence_time),
          status: 'upcoming',
          home_score: null,
          away_score: null,
          season_type: gameType === 'preseason' ? 1 : 2 // Set correct season type
        };
      });
      
      console.log('Transformed games:', gamesToInsert);
      
      // Insert games into database
      const { data, error } = await supabase
        .from('games')
        .upsert(gamesToInsert, { 
          onConflict: 'id',
          ignoreDuplicates: false 
        });
      
      if (error) {
        console.error('Error inserting games:', error);
        throw error;
      }
      
      console.log(`Successfully loaded ${gamesToInsert.length} ${gameType} games`);
      return gamesToInsert;
      
    } catch (error) {
      console.error(`Error loading NFL ${gameType} games:`, error);
      throw error;
    }
  };


  // Simple signup function - just for auth, profile created separately
  const signUp = async (email, password, username, fullName) => {
    try {
      // Create auth user
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) return { data, error };

      // IMPORTANT: Use data.user.id (not data.session.user.id or anything else)
      if (data.user && data.user.id) {
        console.log('Creating profile with auth ID:', data.user.id);
        
        const { error: profileError } = await supabase.from('users').insert({
          id: data.user.id, // This exact ID from auth signup
          email: email,
          username: username,
          full_name: fullName,
          is_admin: false,
          total_winnings: 0
        });

        if (profileError) {
          console.error('Profile creation failed:', profileError);
          // Don't return error if it's just a duplicate key error (user already exists)
          if (profileError.code === '23505') {
            console.log('User profile already exists, continuing...');
          } else {
            return { 
              data: null, 
              error: { message: `Profile creation failed: ${profileError.message}` } 
            };
          }
        }
        
        console.log('Profile created successfully with ID:', data.user.id);
      }

      return { data, error };
    } catch (error) {
      console.error('Signup error:', error);
      return { data: null, error: { message: 'Signup failed' } };
    }
  };

  const signIn = async (email, password) => {
    return await supabase.auth.signInWithPassword({ email, password });
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  // Check if a specific game is locked (game has started)
  const isGameLocked = (game) => {
    return new Date() > new Date(game.game_date);
  };

  // Check if picks are completely locked for the week
  const arePicksLocked = () => {
    if (!currentWeek) return false;
    if (currentWeek.picks_locked) return true;
    if (currentWeek.pick_deadline && new Date() > new Date(currentWeek.pick_deadline)) return true;
    return false;
  };

  // Pick submission with deadline check
  const submitPicks = async () => {
    if (!currentWeek || !user) return;

    // Check if picks are locked
    if (currentWeek.picks_locked) {
      alert('Picks are locked for this week. No changes allowed.');
      return;
    }

    // Check deadline
    if (currentWeek.pick_deadline && new Date() > new Date(currentWeek.pick_deadline)) {
      alert('Pick deadline has passed. No changes allowed.');
      return;
    }

    // Check if any selected games have already started
    const selectedGames = Object.values(userPicks)
      .filter(Boolean)
      .map(team => games.find(g => g.home_team === team || g.away_team === team))
      .filter(Boolean);

    const lockedGames = selectedGames.filter(game => isGameLocked(game));
    if (lockedGames.length > 0) {
      const lockedTeams = lockedGames.map(g => `${g.away_team} @ ${g.home_team}`).join(', ');
      alert(`Cannot submit picks. These games have already started: ${lockedTeams}`);
      return;
    }

    const pickEntries = Object.entries(userPicks)
      .filter(([_, team]) => team)
      .map(([pickKey, team], index) => ({
        user_id: user.id,
        week_number: currentWeek.week_number,
        game_id: games.find(g => g.home_team === team || g.away_team === team)?.id,
        picked_team: team,
        pick_number: parseInt(pickKey.replace('pick', '')),
      }));

    // Delete existing picks first
    await supabase
      .from('picks')
      .delete()
      .eq('user_id', user.id)
      .eq('week_number', currentWeek.week_number);

    // Insert new picks
    const { error } = await supabase.from('picks').insert(pickEntries);

    if (!error) {
      alert('Picks submitted successfully!');
    } else {
      console.error('Error submitting picks:', error);
      alert('Error submitting picks. Please try again.');
    }
  };

  // Admin function to set pick deadline
  const handleSetPickDeadline = async () => {
    if (!currentWeek) return;

    const deadlineStr = prompt('Enter pick deadline (YYYY-MM-DD HH:MM format, e.g., 2025-08-18 17:00):');
    if (!deadlineStr) return;

    try {
      const deadline = new Date(deadlineStr).toISOString();
      const { error } = await supabase
        .from('weeks')
        .update({ pick_deadline: deadline })
        .eq('id', currentWeek.id);

      if (!error) {
        setCurrentWeek(prev => ({ ...prev, pick_deadline: deadline }));
        alert(`Pick deadline set to: ${new Date(deadline).toLocaleString()}`);
      } else {
        alert('Error setting deadline');
      }
    } catch (error) {
      alert('Invalid date format. Use YYYY-MM-DD HH:MM');
    }
  };

  // Admin function to clear pick deadline
  const handleClearPickDeadline = async () => {
    if (!currentWeek) return;

    const { error } = await supabase
      .from('weeks')
      .update({ pick_deadline: null })
      .eq('id', currentWeek.id);

    if (!error) {
      setCurrentWeek(prev => ({ ...prev, pick_deadline: null }));
      alert('Pick deadline cleared');
    } else {
      alert('Error clearing deadline');
    }
  };

  // Calculate teased spread
  const getTeaseSpread = (team, game, teasePoints = 14) => {
    if (team === game.home_team) {
      return game.spread ? game.spread + teasePoints : teasePoints;
    } else {
      return game.spread ? -game.spread + teasePoints : teasePoints;
    }
  };

  // Check if pick won
  const didPickWin = (team, game, teasePoints = 14) => {
    if (!game.home_score || !game.away_score) return null;

    const teaseSpread = getTeaseSpread(team, game, teasePoints);
    
    if (team === game.home_team) {
      return (game.home_score + teaseSpread) > game.away_score;
    } else {
      return (game.away_score + teaseSpread) > game.home_score;
    }
  };

  // Live standings calculation logic
  const calculateLiveStandings = () => {
    if (!allUserPicks.length || !games.length || !currentWeek) return [];

    // Get all users who made picks for this week
    const usersWithPicks = allUserPicks.reduce((acc, pick) => {
      if (!acc[pick.user_id]) {
        acc[pick.user_id] = {
          user_id: pick.user_id,
          picks: [],
          user_info: standings.find(s => s.id === pick.user_id) || { username: 'Unknown', full_name: 'Unknown' }
        };
      }
      acc[pick.user_id].picks.push(pick);
      return acc;
    }, {});

    // Calculate win/loss status for each user
    const userResults = Object.values(usersWithPicks).map(userData => {
      const { user_id, picks, user_info } = userData;
      
      // Check if all games for this user's picks have started
      const userGames = picks.map(pick => 
        games.find(g => g.id === pick.game_id)
      ).filter(Boolean);

      const allGamesStarted = userGames.every(game => 
        new Date() > new Date(game.game_date)
      );

      // If not all games started, user is still alive
      if (!allGamesStarted) {
        return {
          user_id,
          user_info,
          isAlive: true,
          completedPicks: 0,
          totalPicks: picks.length,
          status: 'waiting'
        };
      }

      // Check how many picks are winning
      let completedPicks = 0;
      let winningPicks = 0;

      picks.forEach(pick => {
        const game = games.find(g => g.id === pick.game_id);
        if (game && game.home_score !== null && game.away_score !== null) {
          completedPicks++;
          const isWinning = didPickWin(pick.picked_team, game);
          if (isWinning) winningPicks++;
        }
      });

      // User is alive if all completed picks are winning
      const isAlive = winningPicks === completedPicks && completedPicks <= picks.length;
      
      return {
        user_id,
        user_info,
        isAlive,
        completedPicks,
        totalPicks: picks.length,
        winningPicks,
        status: completedPicks === picks.length ? 'completed' : 'in_progress'
      };
    });

    // Calculate $5 vig winnings
    const aliveUsers = userResults.filter(user => user.isAlive);
    const eliminatedUsers = userResults.filter(user => !user.isAlive);
    
    const numWinners = aliveUsers.length;
    const numLosers = eliminatedUsers.length;

    // Each winner gets $5 × number of losers
    // Each loser pays $5 × number of winners
    const winnerPayout = numLosers * 5;
    const loserPayout = -numWinners * 5;

    return userResults.map(user => ({
      ...user,
      liveWinnings: user.isAlive ? winnerPayout : loserPayout,
      projectedTotal: (user.user_info.total_winnings || 0) + (user.isAlive ? winnerPayout : loserPayout)
    }));
  };

  // Load all user picks for the current week
  const loadAllUserPicks = async (weekNumber) => {
    if (!weekNumber) return;

    const { data: picks } = await supabase
      .from('picks')
      .select('*')
      .eq('week_number', weekNumber);

    setAllUserPicks(picks || []);
  };


  // Load all picks when week changes
  useEffect(() => {
    if (currentWeek && user) {
      loadAllUserPicks(currentWeek.week_number);
    }
  }, [currentWeek, user]);

  // Recalculate live standings when data changes
  useEffect(() => {
    if (allUserPicks.length && games.length) {
      const liveResults = calculateLiveStandings();
      setLiveStandings(liveResults);
    }
  }, [allUserPicks, games, standings]);

  // Auth forms
  const [authMode, setAuthMode] = useState('signin');
  const [authForm, setAuthForm] = useState({
    email: '',
    password: '',
    username: '',
    fullName: ''
  });

  const handleAuth = async (e) => {
    e.preventDefault();
    
    if (authMode === 'signin') {
      const { error } = await signIn(authForm.email, authForm.password);
      if (error) alert(error.message);
    } else {
      const { error } = await signUp(
        authForm.email,
        authForm.password,
        authForm.username,
        authForm.fullName
      );
      if (error) {
        alert(error.message);
      } else {
        alert('Check your email for verification link!');
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
          <h1 className="text-2xl font-bold text-center mb-6">Teazly Pool</h1>
          
          <form onSubmit={handleAuth} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Email</label>
              <input
                type="email"
                required
                value={authForm.email}
                onChange={(e) => setAuthForm({...authForm, email: e.target.value})}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Password</label>
              <input
                type="password"
                required
                value={authForm.password}
                onChange={(e) => setAuthForm({...authForm, password: e.target.value})}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {authMode === 'signup' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Username</label>
                  <input
                    type="text"
                    required
                    value={authForm.username}
                    onChange={(e) => setAuthForm({...authForm, username: e.target.value})}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Full Name</label>
                  <input
                    type="text"
                    required
                    value={authForm.fullName}
                    onChange={(e) => setAuthForm({...authForm, fullName: e.target.value})}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </>
            )}

            <button
              type="submit"
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              {authMode === 'signin' ? 'Sign In' : 'Sign Up'}
            </button>
          </form>

          <div className="mt-4 text-center">
            <button
              onClick={() => setAuthMode(authMode === 'signin' ? 'signup' : 'signin')}
              className="text-blue-600 hover:text-blue-500"
            >
              {authMode === 'signin' ? 'Need an account? Sign up' : 'Already have an account? Sign in'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Main application
  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold text-gray-900">Teazly Pool</h1>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">Welcome, {user.email}</span>
              <button
                onClick={signOut}
                className="text-sm text-red-600 hover:text-red-500"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex space-x-8">
            <button
              onClick={() => navigateTo('dashboard')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                currentView === 'dashboard' 
                  ? 'border-blue-500 text-blue-600' 
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Standings
            </button>
            <button
              onClick={() => navigateTo('picks')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                currentView === 'picks' 
                  ? 'border-blue-500 text-blue-600' 
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Make Picks
            </button>
            <button
              onClick={() => navigateTo('scoring')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                currentView === 'scoring' 
                  ? 'border-blue-500 text-blue-600' 
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Live Scoring
            </button>
            {/* Admin Tab - Only show for admins */}
            {currentUserProfile?.is_admin && (
              <button
                onClick={() => navigateTo('admin')}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  currentView === 'admin' 
                    ? 'border-blue-500 text-blue-600' 
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Admin
              </button>
            )}
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {currentView === 'dashboard' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <div className="font-medium text-blue-800">
                  Week {currentWeek?.week_number || 'N/A'}
                </div>
                <p className="text-sm text-blue-600 mt-1">Current Week</p>
              </div>
              
              <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                <div className="font-medium text-green-800">
                  {standings.length} Players
                </div>
                <p className="text-sm text-green-600 mt-1">Active Players</p>
              </div>
              
              <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                <div className="font-medium text-purple-800">
                  {(() => {
                    const userLiveResult = liveStandings.find(ls => ls.user_id === user?.id);
                    if (userLiveResult) {
                      return `$${userLiveResult.projectedTotal >= 0 ? '+' : ''}${userLiveResult.projectedTotal}`;
                    }
                    return `$${currentUserProfile?.total_winnings >= 0 ? '+' : ''}${currentUserProfile?.total_winnings || 0}`;
                  })()}
                </div>
                <p className="text-sm text-purple-600 mt-1">
                  {liveStandings.find(ls => ls.user_id === user?.id) ? 'Projected Total' : 'Your Net Win/Loss'}
                </p>
              </div>
            </div>


            {/* Live Standings for Current Week */}
            {liveStandings.length > 0 && (
              <div className="bg-white rounded-lg shadow border">
                <div className="p-4 border-b border-gray-200">
                  <div className="flex justify-between items-center">
                    <h2 className="text-lg font-semibold">Live Standings - Week {currentWeek?.week_number}</h2>
                    {isPolling && (
                      <div className="flex items-center gap-2 text-green-600">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                        <span className="text-sm font-medium">Live Updates</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="p-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {liveStandings
                      .sort((a, b) => b.liveWinnings - a.liveWinnings)
                      .map((userResult) => {
                        const isCurrentUser = userResult.user_id === user?.id;
                        return (
                          <div 
                            key={userResult.user_id}
                            className={`border rounded-lg p-4 ${
                              isCurrentUser ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                            } ${userResult.isAlive ? 'bg-green-50' : 'bg-red-50'}`}
                          >
                            <div className="flex justify-between items-center mb-2">
                              <div>
                                <div className="font-medium">{userResult.user_info.full_name}</div>
                                <div className="text-xs text-gray-600">@{userResult.user_info.username}</div>
                              </div>
                              <div className={`px-2 py-1 rounded text-xs font-medium ${
                                userResult.isAlive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                              }`}>
                                {userResult.isAlive ? 'ALIVE' : 'ELIMINATED'}
                              </div>
                            </div>
                            
                            <div className="space-y-1">
                              <div className="text-sm">
                                Picks: {userResult.winningPicks || 0}/{userResult.completedPicks} complete, {userResult.totalPicks} total
                              </div>
                              <div className="text-sm">
                                Status: {userResult.status === 'waiting' ? 'Waiting for games' : 
                                        userResult.status === 'completed' ? 'All games final' : 'Games in progress'}
                              </div>
                              <div className={`text-lg font-bold ${
                                userResult.liveWinnings > 0 ? 'text-green-600' : 
                                userResult.liveWinnings < 0 ? 'text-red-600' : 'text-gray-600'
                              }`}>
                                ${userResult.liveWinnings >= 0 ? '+' : ''}{userResult.liveWinnings}
                              </div>
                              <div className="text-xs text-gray-600">
                                Projected Total: ${userResult.projectedTotal >= 0 ? '+' : ''}{userResult.projectedTotal}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                  
                  <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                    <div className="text-sm text-gray-600">
                      <strong>How it works:</strong> Winners get $5 × number of losers. Losers pay $5 × number of winners.
                      {liveStandings.filter(u => u.isAlive).length > 0 && liveStandings.filter(u => !u.isAlive).length > 0 && (
                        <span className="ml-2">
                          Currently: {liveStandings.filter(u => u.isAlive).length} winners getting $
                          {liveStandings.filter(u => !u.isAlive).length * 5} each, {liveStandings.filter(u => !u.isAlive).length} losers paying $
                          {liveStandings.filter(u => u.isAlive).length * 5} each.
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-white rounded-lg shadow border">
              <div className="p-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold">Season Standings</h2>
              </div>
              <div className="p-4 overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 px-3 font-medium text-gray-900 sticky left-0 bg-white">Player</th>
                      <th className="text-center py-2 px-3 font-medium text-gray-900">P1</th>
                      <th className="text-center py-2 px-3 font-medium text-gray-900">P2</th>
                      <th className="text-center py-2 px-3 font-medium text-gray-900">P3</th>
                      <th className="text-center py-2 px-3 font-medium text-gray-900">W1</th>
                      <th className="text-center py-2 px-3 font-medium text-gray-900">W2</th>
                      <th className="text-center py-2 px-3 font-medium text-gray-900">W3</th>
                      <th className="text-center py-2 px-3 font-medium text-gray-900">W4</th>
                      <th className="text-center py-2 px-3 font-medium text-gray-900">W5</th>
                      <th className="text-center py-2 px-3 font-medium text-gray-900">W6</th>
                      <th className="text-center py-2 px-3 font-medium text-gray-900">W7</th>
                      <th className="text-center py-2 px-3 font-medium text-gray-900">W8</th>
                      <th className="text-center py-2 px-3 font-medium text-gray-900">W9</th>
                      <th className="text-center py-2 px-3 font-medium text-gray-900">W10</th>
                      <th className="text-center py-2 px-3 font-medium text-gray-900">W11</th>
                      <th className="text-center py-2 px-3 font-medium text-gray-900">W12</th>
                      <th className="text-center py-2 px-3 font-medium text-gray-900">W13</th>
                      <th className="text-center py-2 px-3 font-medium text-gray-900">W14</th>
                      <th className="text-center py-2 px-3 font-medium text-gray-900">W15</th>
                      <th className="text-center py-2 px-3 font-medium text-gray-900">W16</th>
                      <th className="text-center py-2 px-3 font-medium text-gray-900">W17</th>
                      <th className="text-center py-2 px-3 font-medium text-gray-900">W18</th>
                      <th className="text-center py-2 px-3 font-medium text-gray-900">WC</th>
                      <th className="text-center py-2 px-3 font-medium text-gray-900">DIV</th>
                      <th className="text-center py-2 px-3 font-medium text-gray-900">CONF</th>
                      <th className="text-center py-2 px-3 font-medium text-gray-900">SB</th>
                      <th className="text-center py-2 px-3 font-medium text-gray-900 sticky right-0 bg-white">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {standings.map((player, index) => (
                      <tr key={player.id} className={`border-b border-gray-100 ${player.id === user?.id ? 'bg-blue-50' : ''}`}>
                        <td className="py-2 px-3 sticky left-0 bg-white">
                          <div className="flex items-center gap-2">
                            <span className="w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs font-medium">
                              {index + 1}
                            </span>
                            <div>
                              <div className="font-medium">{player.full_name}</div>
                              <div className="text-xs text-gray-600">@{player.username}</div>
                            </div>
                          </div>
                        </td>
                        {/* Week columns - Preseason (P1-P3) + Regular Season (W1-W18) + Playoffs (WC, DIV, CONF, SB) */}
                        {Array.from({length: 25}, (_, weekIndex) => (
                          <td key={weekIndex} className="text-center py-2 px-3 text-sm">
                            {/* This will show win/loss for each week once we have the data */}
                            <span className="text-gray-400">-</span>
                          </td>
                        ))}
                        <td className="text-center py-2 px-3 font-bold sticky right-0 bg-white">
                          <span className={`${player.total_winnings >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            ${player.total_winnings >= 0 ? '+' : ''}{player.total_winnings}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {currentView === 'picks' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow border">
              <div className="p-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold">
                  {currentWeek?.week_name || `Week ${currentWeek?.week_number || 'N/A'}`}
                </h2>
              </div>
              
              <div className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {games.map((game) => {
                    const gameIsLocked = isGameLocked(game);
                    const weekIsLocked = arePicksLocked();
                    
                    return (
                      <div key={game.id} className="border border-gray-200 rounded-lg p-4">
                        <div className="flex justify-between items-center mb-3">
                          <div className="text-sm text-gray-600">
                            {new Date(game.game_date).toLocaleDateString('en-US', { 
                              weekday: 'short', 
                              month: 'short', 
                              day: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit',
                              timeZoneName: 'short'
                            })}
                            {gameIsLocked && <span className="ml-2 text-red-600 font-bold">LOCKED</span>}
                          </div>
                          <div className="text-sm font-medium">
                            Spread: {game.home_team} {game.spread > 0 ? '+' : ''}{game.spread || 'N/A'}
                          </div>
                        </div>
                        
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <button
                              onClick={() => {
                                if (gameIsLocked || weekIsLocked) return;
                                const pickNum = Object.keys(userPicks).find(key => userPicks[key] === '') || 'pick1';
                                setUserPicks(prev => ({
                                  ...prev,
                                  [pickNum]: game.away_team
                                }));
                              }}
                              disabled={gameIsLocked || weekIsLocked}
                              className={`flex-1 p-2 rounded border text-left mr-2 ${
                                gameIsLocked || weekIsLocked
                                  ? 'bg-gray-200 border-gray-300 text-gray-500 cursor-not-allowed'
                                  : Object.values(userPicks).includes(game.away_team) 
                                    ? 'bg-blue-100 border-blue-500' 
                                    : 'bg-gray-50 border-gray-300 hover:bg-gray-100'
                              }`}
                            >
                              <div className="font-medium">{game.away_team}</div>
                              <div className="text-sm text-gray-600">
                                +{getTeaseSpread(game.away_team, game)} (teased)
                              </div>
                              {game.status === 'final' && (
                                <div className="text-sm font-medium">{game.away_score}</div>
                              )}
                            </button>
                            
                            <button
                              onClick={() => {
                                if (gameIsLocked || weekIsLocked) return;
                                const pickNum = Object.keys(userPicks).find(key => userPicks[key] === '') || 'pick1';
                                setUserPicks(prev => ({
                                  ...prev,
                                  [pickNum]: game.home_team
                                }));
                              }}
                              disabled={gameIsLocked || weekIsLocked}
                              className={`flex-1 p-2 rounded border text-left ${
                                gameIsLocked || weekIsLocked
                                  ? 'bg-gray-200 border-gray-300 text-gray-500 cursor-not-allowed'
                                  : Object.values(userPicks).includes(game.home_team) 
                                    ? 'bg-blue-100 border-blue-500' 
                                    : 'bg-gray-50 border-gray-300 hover:bg-gray-100'
                              }`}
                            >
                              <div className="font-medium">{game.home_team}</div>
                              <div className="text-sm text-gray-600">
                                {getTeaseSpread(game.home_team, game) > 0 ? '+' : ''}{getTeaseSpread(game.home_team, game)} (teased)
                              </div>
                              {game.status === 'final' && (
                                <div className="text-sm font-medium">{game.home_score}</div>
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow border">
              <div className="p-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold">Your Picks</h3>
              </div>
              <div className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  {Object.entries(userPicks).map(([pickNum, team], index) => {
                    const game = games.find(g => g.home_team === team || g.away_team === team);
                    const result = game ? didPickWin(team, game) : null;
                    
                    return (
                      <div key={pickNum} className="border border-gray-200 rounded-lg p-3">
                        <div className="text-sm text-gray-600 mb-1">Pick {index + 1}</div>
                        {team ? (
                          <div className="space-y-1">
                            <div className="font-medium flex items-center gap-2">
                              {team}
                              {result === true && <span className="text-green-500">✓</span>}
                              {result === false && <span className="text-red-500">✗</span>}
                            </div>
                            {game && (
                              <div className="text-sm text-gray-600">
                                vs {team === game.home_team ? game.away_team : game.home_team}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-gray-400 italic">No pick selected</div>
                        )}
                      </div>
                    );
                  })}
                </div>
                
                <div className="mt-4 flex gap-2">
                  <button 
                    onClick={() => setUserPicks({ pick1: '', pick2: '', pick3: '', pick4: '' })}
                    disabled={arePicksLocked()}
                    className={`px-4 py-2 border border-gray-300 rounded ${
                      arePicksLocked() 
                        ? 'text-gray-400 cursor-not-allowed' 
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    Clear Picks
                  </button>
                  <button 
                    onClick={submitPicks}
                    disabled={Object.values(userPicks).filter(Boolean).length !== 4 || arePicksLocked()}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Submit Picks
                  </button>
                  {arePicksLocked() && currentWeek.pick_deadline && (
                    <div className="flex items-center ml-3 text-red-600 font-medium">
                      🔒 Pick deadline has passed ({new Date(currentWeek.pick_deadline).toLocaleString()})
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {currentView === 'scoring' && (
          <div className="space-y-6">
            {/* Live Standings Summary */}
            {liveStandings.length > 0 && (
              <div className="bg-white rounded-lg shadow border">
                <div className="p-4 border-b border-gray-200">
                  <div className="flex justify-between items-center">
                    <h2 className="text-lg font-semibold">Live Standings Summary</h2>
                    {isPolling && (
                      <div className="flex items-center gap-2 text-green-600">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                        <span className="text-sm font-medium">Live Updates</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="p-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                    <div className="bg-green-50 p-3 rounded-lg">
                      <div className="text-2xl font-bold text-green-600">
                        {liveStandings.filter(u => u.isAlive).length}
                      </div>
                      <div className="text-sm text-green-600">Still Alive</div>
                    </div>
                    <div className="bg-red-50 p-3 rounded-lg">
                      <div className="text-2xl font-bold text-red-600">
                        {liveStandings.filter(u => !u.isAlive).length}
                      </div>
                      <div className="text-sm text-red-600">Eliminated</div>
                    </div>
                    <div className="bg-blue-50 p-3 rounded-lg">
                      <div className="text-2xl font-bold text-blue-600">
                        ${liveStandings.filter(u => u.isAlive).length > 0 ? 
                          liveStandings.filter(u => !u.isAlive).length * 5 : 0}
                      </div>
                      <div className="text-sm text-blue-600">Winner Payout</div>
                    </div>
                    <div className="bg-orange-50 p-3 rounded-lg">
                      <div className="text-2xl font-bold text-orange-600">
                        ${liveStandings.filter(u => !u.isAlive).length > 0 ? 
                          liveStandings.filter(u => u.isAlive).length * 5 : 0}
                      </div>
                      <div className="text-sm text-orange-600">Loser Payment</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-white rounded-lg shadow border">
              <div className="p-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold">Week {currentWeek?.week_number || 'N/A'} - Live Scoring</h2>
              </div>
              <div className="p-4">
                <div className="space-y-4">
                  {games.map((game) => {
                    const gameTime = new Date(game.game_date);
                    const now = new Date();
                    const hasStarted = now > gameTime;
                    const hasScores = game.home_score !== null && game.away_score !== null;
                    
                    return (
                      <div key={game.id} className="border border-gray-200 rounded-lg p-4">
                        <div className="flex justify-between items-center mb-2">
                          <div className="font-medium">{game.away_team} @ {game.home_team}</div>
                          <div className="text-right">
                            {!hasStarted ? (
                              <div className="text-sm text-gray-600">
                                {gameTime.toLocaleDateString('en-US', { 
                                  weekday: 'short', 
                                  month: 'short', 
                                  day: 'numeric',
                                  hour: 'numeric',
                                  minute: '2-digit',
                                  timeZoneName: 'short'
                                })}
                              </div>
                            ) : (
                              <div className={`px-2 py-1 rounded text-sm ${
                                game.status === 'final' ? 'bg-gray-100 text-gray-800' : 
                                hasStarted ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
                              }`}>
                                {game.status.toUpperCase()}
                              </div>
                            )}
                          </div>
                        </div>
                      
                        <div className="grid grid-cols-2 gap-4">
                          <div className="text-center">
                            <div className="text-2xl font-bold">
                              {hasStarted && hasScores ? game.away_score : '-'}
                            </div>
                            <div className="font-medium">{game.away_team}</div>
                            <div className="text-sm text-gray-600">
                              +{getTeaseSpread(game.away_team, game)} (teased)
                            </div>
                            {hasStarted && hasScores && (
                              <div className="text-sm font-medium">
                                Teased Score: {game.away_score + getTeaseSpread(game.away_team, game)}
                              </div>
                            )}
                          </div>
                          
                          <div className="text-center">
                            <div className="text-2xl font-bold">
                              {hasStarted && hasScores ? game.home_score : '-'}
                            </div>
                            <div className="font-medium">{game.home_team}</div>
                            <div className="text-sm text-gray-600">
                              {getTeaseSpread(game.home_team, game) > 0 ? '+' : ''}{getTeaseSpread(game.home_team, game)} (teased)
                            </div>
                            {hasStarted && hasScores && (
                              <div className="text-sm font-medium">
                                Teased Score: {game.home_score + getTeaseSpread(game.home_team, game)}
                              </div>
                            )}
                          </div>
                        </div>
                      
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <div className="text-sm text-gray-600 mb-2">
                          Original Spread: {game.home_team} {game.spread > 0 ? '+' : ''}{game.spread || 'N/A'}
                        </div>
                        
                        {/* Show which users picked teams in this game */}
                        {allUserPicks.length > 0 && (
                          <div className="space-y-2">
                            {[game.away_team, game.home_team].map(team => {
                              const teamPickers = allUserPicks.filter(pick => pick.picked_team === team);
                              if (teamPickers.length === 0) return null;
                              
                              return (
                                <div key={team} className="text-xs">
                                  <span className="font-medium">{team} picks:</span>
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {teamPickers.map(pick => {
                                      const userInfo = standings.find(s => s.id === pick.user_id);
                                      const isWinning = game.home_score !== null && game.away_score !== null ? 
                                        didPickWin(pick.picked_team, game) : null;
                                      
                                      return (
                                        <span
                                          key={pick.user_id}
                                          className={`px-2 py-1 rounded text-xs ${
                                            isWinning === true ? 'bg-green-100 text-green-800' :
                                            isWinning === false ? 'bg-red-100 text-red-800' :
                                            'bg-gray-100 text-gray-800'
                                          }`}
                                        >
                                          {userInfo?.username || 'Unknown'}
                                          {isWinning === true && ' ✓'}
                                          {isWinning === false && ' ✗'}
                                        </span>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Admin View - Only accessible by admin users */}
        {currentView === 'admin' && !currentUserProfile?.is_admin && (
          <div className="space-y-6">
            <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
              <h2 className="text-xl font-semibold text-red-800 mb-2">Access Denied</h2>
              <p className="text-red-600 mb-4">You don't have permission to access the admin panel.</p>
              <button
                onClick={() => navigateTo('dashboard')}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Return to Dashboard
              </button>
            </div>
          </div>
        )}

        {currentView === 'admin' && currentUserProfile?.is_admin && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow border">
              <div className="p-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold">Game Management</h2>
              </div>
              <div className="p-4">
                <div className="grid grid-cols-1 gap-4 mb-6">
                  <button
                    onClick={handleTestWeekDetection}
                    className="px-4 py-3 bg-purple-600 text-white rounded hover:bg-purple-700 text-center"
                  >
                    Test Week Detection
                  </button>
                </div>
                <p className="text-sm text-gray-600">
                  Game Management: {games.length} games currently loaded for week {currentWeek?.week_number}
                  <br />
                  NFL schedule auto-syncs every 5 minutes. Current week auto-updates every Tuesday.
                </p>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow border">
              <div className="p-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold">Pick Management</h2>
              </div>
              <div className="p-4">
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleSetPickDeadline}
                      className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700"
                    >
                      Set Pick Deadline
                    </button>
                    {currentWeek?.pick_deadline && (
                      <button
                        onClick={handleClearPickDeadline}
                        className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                      >
                        Clear Deadline
                      </button>
                    )}
                  </div>
                  {currentWeek?.pick_deadline && (
                    <div className="text-sm">
                      <span className={`font-medium ${arePicksLocked() ? 'text-red-600' : 'text-green-600'}`}>
                        Current Deadline: {new Date(currentWeek.pick_deadline).toLocaleString()}
                        {arePicksLocked() && ' (LOCKED)'}
                      </span>
                    </div>
                  )}
                  <p className="text-sm text-gray-600">
                    Manage pick deadlines and game locking for the current week
                  </p>
                </div>
              </div>
            </div>

            {currentWeek && (
              <div className="bg-white rounded-lg shadow border">
                <div className="p-4 border-b border-gray-200">
                  <h2 className="text-lg font-semibold">Current Week Status</h2>
                </div>
                <div className="p-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600">
                        {currentWeek.week_number}
                      </div>
                      <div className="text-sm text-gray-600">Week Number</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">
                        {games.length}
                      </div>
                      <div className="text-sm text-gray-600">Games Loaded</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-purple-600">
                        {currentWeek.tease_points || 14}
                      </div>
                      <div className="text-sm text-gray-600">Tease Points</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default TeazlyPool;
