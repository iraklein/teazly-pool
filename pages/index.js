// Replace the Admin Actions section in your dashboard with this updated version

{/* Admin Actions Section - Only for Admins */}
{currentWeek && currentUserProfile?.is_admin && (
  <div className="bg-white rounded-lg shadow border">
    <div className="p-4 border-b border-gray-200">
      <h3 className="text-lg font-semibold">Admin Actions</h3>
    </div>
    <div className="p-4 space-y-4">
      
      {/* Weekly Management */}
      <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
        <h4 className="font-semibold text-blue-800 mb-3">Weekly Management</h4>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <button
              onClick={handleInitializeWeekSystem}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Initialize Week System
            </button>
            <button
              onClick={handleAdvanceWeek}
              className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
            >
              Advance to Next Week
            </button>
          </div>
          <div className="text-sm text-blue-700">
            <div><strong>Current Week:</strong> {currentWeek.week_name || `Week ${currentWeek.week_number}`} ({currentWeek.season_type || 'regular'})</div>
            <div><strong>Games Loaded:</strong> {games.length}</div>
            {currentWeek.pick_deadline && (
              <div><strong>Pick Deadline:</strong> {new Date(currentWeek.pick_deadline).toLocaleString()}</div>
            )}
          </div>
        </div>
      </div>

      {/* Game Loading */}
      <div className="bg-green-50 p-4 rounded-lg border border-green-200">
        <h4 className="font-semibold text-green-800 mb-3">Manual Game Loading</h4>
        <div className="space-y-3">
          <div className="flex gap-3">
            <button
              onClick={handleLoadRegularSeasonGames}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              Load Regular Season Games
            </button>
            <button
              onClick={handleLoadPreseasonGames}
              className="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700"
            >
              Load Preseason Games
            </button>
          </div>
          <p className="text-sm text-green-700">
            Manual loading (use only if Initialize Week System doesn't work)
          </p>
        </div>
      </div>

      {/* Pick Deadline Management */}
      <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
        <h4 className="font-semibold text-orange-800 mb-3">Pick Deadline Management</h4>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <button
              onClick={handleSetPickDeadline}
              className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700"
            >
              Set Pick Deadline
            </button>
            {currentWeek.pick_deadline && (
              <button
                onClick={handleClearPickDeadline}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
                Clear Deadline
              </button>
            )}
          </div>
          {currentWeek.pick_deadline && (
            <div className="text-sm">
              <span className={`font-medium ${arePicksLocked() ? 'text-red-600' : 'text-green-600'}`}>
                Deadline: {new Date(currentWeek.pick_deadline).toLocaleString()}
                {arePicksLocked() && ' (LOCKED)'}
              </span>
            </div>
          )}
          <p className="text-sm text-orange-700">
            Format: YYYY-MM-DD HH:MM (e.g., 2025-08-25 10:00 for 10am PT Sunday)
          </p>
        </div>
      </div>

      {/* Week Status */}
      <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
        <h4 className="font-semibold text-gray-800 mb-2">Current Week Status</h4>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="font-medium">Week:</span> {currentWeek.week_name || `Week ${currentWeek.week_number}`}
          </div>
          <div>
            <span className="font-medium">Season:</span> {currentWeek.season_type || 'regular'}
          </div>
          <div>
            <span className="font-medium">Year:</span> {currentWeek.year || 2025}
          </div>
          <div>
            <span className="font-medium">Status:</span> 
            <span className={`ml-1 ${currentWeek.picks_locked ? 'text-red-600' : 'text-green-600'}`}>
              {currentWeek.picks_locked ? 'Locked' : 'Open'}
            </span>
          </div>
        </div>
      </div>

    </div>
  </div>
)}
