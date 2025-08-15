// Add this as: pages/admin.js

import { useState } from 'react';
import { loadNFLGames, ensureCurrentWeek, initializeGames } from '../lib/loadGames';

export default function AdminPage() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleLoadGames = async () => {
    setLoading(true);
    setMessage('Loading games from ESPN...');
    
    try {
      await initializeGames();
      setMessage('Games loaded successfully! Check your database.');
    } catch (error) {
      setMessage('Error loading games: ' + error.message);
    }
    
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Admin Panel</h1>
        
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">Load NFL Games</h2>
          
          <button
            onClick={handleLoadGames}
            disabled={loading}
            className="bg-blue-600 text-white px-6 py-3 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Load Games from ESPN API'}
          </button>
          
          {message && (
            <div className="mt-4 p-4 bg-gray-100 rounded">
              {message}
            </div>
          )}
          
          <div className="mt-6 text-sm text-gray-600">
            <p>This will:</p>
            <ul className="list-disc list-inside mt-2">
              <li>Fetch current NFL games from ESPN</li>
              <li>Create a current week if none exists</li>
              <li>Update your database with real game data</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
