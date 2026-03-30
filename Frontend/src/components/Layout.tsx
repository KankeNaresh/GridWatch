import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../AuthContext";

const USERS = [
  { id: '1', label: 'Alice (Operator · Zone North)' },
  { id: '2', label: 'Bob (Operator · Zone South)' },
  { id: '3', label: 'Carol (Supervisor · All Zones)' },
]

export default function Layout() {
  const { userId, setUserId } = useAuth()

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Top nav */}
      <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <NavLink to="/" className="text-lg font-bold text-white tracking-tight">
              ⚡ GridWatch
            </NavLink>
            <nav className="flex gap-1">
              {[
                { to: '/', label: 'Dashboard' },
                { to: '/alerts', label: 'Alerts' },
                { to: '/suppression', label: 'Suppression' },
              ].map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.to === '/'}
                  className={({ isActive }) =>
                    `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-gray-800 text-white'
                        : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                    }`
                  }
                >
                  {link.label}
                </NavLink>
              ))}
            </nav>
          </div>

          {/* User switcher */}
          <select
            value={userId}
            onChange={(e) => {
              setUserId(e.target.value)
              window.location.reload()
            }}
            className="bg-gray-800 border border-gray-700 text-sm rounded-md px-2 py-1.5 text-gray-200 focus:ring-1 focus:ring-blue-500 focus:outline-none"
          >
            {USERS.map((u) => (
              <option key={u.id} value={u.id}>{u.label}</option>
            ))}
          </select>
        </div>
      </header>

      {/* Page content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
