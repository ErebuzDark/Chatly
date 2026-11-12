import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { App as AntdApp, ConfigProvider, theme as antdTheme } from 'antd'

const ThemeContext = createContext(null)
const KEY = 'theme'

function getInitialMode() {
  try {
    return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark' // dark by default
  } catch {
    return 'dark'
  }
}

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState(getInitialMode)

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('light', mode === 'light')
    root.style.colorScheme = mode
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', mode === 'dark' ? '#0f1014' : '#f4f5f8')
    try { localStorage.setItem(KEY, mode) } catch { /* ignore */ }
  }, [mode])

  const toggle = useCallback(() => setMode((m) => (m === 'dark' ? 'light' : 'dark')), [])

  const antd = useMemo(() => {
    const dark = mode === 'dark'
    return {
      algorithm: dark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
      token: {
        colorPrimary: '#0a84ff',
        colorSuccess: '#30d158',
        colorWarning: '#ff9f0a',
        colorError: '#ff453a',
        borderRadius: 10,
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Inter, Roboto, sans-serif',
        ...(dark && {
          colorBgContainer: 'rgba(255,255,255,0.06)',
          colorBgElevated: '#1c1d22',
          colorBorder: 'rgba(255,255,255,0.14)',
        }),
      },
      components: {
        Button: { controlHeight: 40, fontWeight: 500 },
        Input: { controlHeight: 40 },
      },
    }
  }, [mode])

  const value = useMemo(() => ({ mode, toggle, setMode }), [mode, toggle])

  return (
    <ThemeContext.Provider value={value}>
      <ConfigProvider theme={antd}>
        <AntdApp>{children}</AntdApp>
      </ConfigProvider>
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>')
  return ctx
}
