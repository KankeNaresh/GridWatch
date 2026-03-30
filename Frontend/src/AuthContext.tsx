import { createContext, type ReactNode, useCallback, useContext, useState } from "react";

interface AuthCtx {
  userId: string
  setUserId: (id: string) => void
}

const AuthContext = createContext<AuthCtx>({ userId: '1', setUserId: () => {} })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [userId, setUserIdState] = useState(
    () => localStorage.getItem('gridwatch_user_id') || '1',
  )

  const setUserId = useCallback((id: string) => {
    localStorage.setItem('gridwatch_user_id', id)
    setUserIdState(id)
  }, [])

  return (
    <AuthContext.Provider value={{ userId, setUserId }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
