import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const TeazlyPool = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState('dashboard');
  const [currentWeek, setCurrentWeek] = useState(null);
  const [games, setGames] = useState([]);
  const [picks, setPicks] = useState([]);
  const [standings, setStandings] = useState([]);
  const [userPicks, setUserPicks] = useState({ pick1: '', pick2: '', pick3: '', pick4: '' });

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
      .order('game_date');

    setGames(games || []);
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

  // Simple but correct signup function
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
          return { 
            data: null, 
            error: { message: `Profile creation failed: ${profileError.message}` } 
          };
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

  // Pick submission
  const submitPicks = async () => {
    if (!currentWeek || !user) return;

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
              onClick={() => setCurrentView('dashboard')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                currentView === 'dashboard' 
                  ? 'border-blue-500 text-blue-600' 
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Dashboard
            </button>
            <button
              onClick={() => setCurrentView('picks')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                currentView === 'picks' 
                  ? 'border-blue-500 text-blue-600' 
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Make Picks
            </button>
            <button
              onClick={() => setCurrentView('scoring')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                currentView === 'scoring' 
                  ? 'border-blue-500 text-blue-600' 
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Live Scoring
            </button>
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
                  ${standings[0]?.total_winnings || 0}
                </div>
                <p className="text-sm text-purple-600 mt-1">Leader Total</p>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow border">
              <div className="p-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold">Current Standings</h2>
              </div>
              <div className="p-4">
                <div className="space-y-2">
                  {standings.map((player, index) => (
                    <div key={player.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <span className="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-medium">
                          {index + 1}
                        </span>
                        <div>
                          <div className="font-medium">{player.full_name}</div>
                          <div className="text-sm text-gray-600">@{player.username}</div>
                        </div>
                      </div>
                      <div className={`font-bold text-lg ${player.total_winnings >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        ${player.total_winnings >= 0 ? '+' : ''}{player.total_winnings}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {currentView === 'picks' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow border">
              <div className="p-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold">
                  Week {currentWeek?.week_number || 'N/A'} - 4-Team Teaser (+14 Points)
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  Pick 4 teams. All must win (with 14-point tease) to win the week.
                </p>
              </div>
              
              <div className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {games.map((game) => (
                    <div key={game.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex justify-between items-center mb-3">
                        <div className="text-sm text-gray-600">
                          {game.status === 'final' ? 'FINAL' : 'Upcoming'}
                        </div>
                        <div className="text-sm font-medium">
                          Spread: {game.home_team} {game.spread > 0 ? '+' : ''}{game.spread || 'N/A'}
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <button
                            onClick={() => {
                              const pickNum = Object.keys(userPicks).find(key => userPicks[key] === '') || 'pick1';
                              setUserPicks(prev => ({
                                ...prev,
                                [pickNum]: game.away_team
                              }));
                            }}
                            className={`flex-1 p-2 rounded border text-left mr-2 ${
                              Object.values(userPicks).includes(game.away_team) 
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
                              const pickNum = Object.keys(userPicks).find(key => userPicks[key] === '') || 'pick1';
                              setUserPicks(prev => ({
                                ...prev,
                                [pickNum]: game.home_team
                              }));
                            }}
                            className={`flex-1 p-2 rounded border text-left ${
                              Object.values(userPicks).includes(game.home_team) 
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
                  ))}
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
                    className="px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50"
                  >
                    Clear Picks
                  </button>
                  <button 
                    onClick={submitPicks}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                    disabled={Object.values(userPicks).filter(Boolean).length !== 4}
                  >
                    Submit Picks
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {currentView === 'scoring' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow border">
              <div className="p-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold">Week {currentWeek?.week_number || 'N/A'} - Live Scoring</h2>
              </div>
              <div className="p-4">
                <div className="space-y-4">
                  {games.map((game) => (
                    <div key={game.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex justify-between items-center mb-2">
                        <div className="font-medium">{game.away_team} @ {game.home_team}</div>
                        <div className={`px-2 py-1 rounded text-sm ${
                          game.status === 'final' ? 'bg-gray-100 text-gray-800' : 'bg-green-100 text-green-800'
                        }`}>
                          {game.status.toUpperCase()}
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div className="text-center">
                          <div className="text-2xl font-bold">{game.away_score || '-'}</div>
                          <div className="font-medium">{game.away_team}</div>
                          <div className="text-sm text-gray-600">
                            +{getTeaseSpread(game.away_team, game)} (teased)
                          </div>
                          <div className="text-sm font-medium">
                            Teased Score: {game.away_score ? game.away_score + getTeaseSpread(game.away_team, game) : '-'}
                          </div>
                        </div>
                        
                        <div className="text-center">
                          <div className="text-2xl font-bold">{game.home_score || '-'}</div>
                          <div className="font-medium">{game.home_team}</div>
                          <div className="text-sm text-gray-600">
                            {getTeaseSpread(game.home_team, game) > 0 ? '+' : ''}{getTeaseSpread(game.home_team, game)} (teased)
                          </div>
                          <div className="text-sm font-medium">
                            Teased Score: {game.home_score ? game.home_score + getTeaseSpread(game.home_team, game) : '-'}
                          </div>
                        </div>
                      </div>
                      
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <div className="text-sm text-gray-600">
                          Original Spread: {game.home_team} {game.spread > 0 ? '+' : ''}{game.spread || 'N/A'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default TeazlyPool;
