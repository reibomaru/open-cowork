import { useEffect } from "react"
import { Route, Routes } from "react-router-dom"
import { useSessionStore } from "../../store/session-store"
import { useUIStore } from "../../store/ui-store"
import { ChatArea } from "../chat/ChatArea"
import { ResizeHandle } from "./ResizeHandle"
import { RightPanel } from "./RightPanel"
import { Sidebar } from "./Sidebar"

export function AppShell() {
  const sidebarOpen = useUIStore((s) => s.sidebarOpen)
  const rightPanelOpen = useUIStore((s) => s.rightPanelOpen)
  const sidebarWidth = useUIStore((s) => s.sidebarWidth)
  const rightPanelWidth = useUIStore((s) => s.rightPanelWidth)
  const setSidebarWidth = useUIStore((s) => s.setSidebarWidth)
  const setRightPanelWidth = useUIStore((s) => s.setRightPanelWidth)
  const fetchSessions = useSessionStore((s) => s.fetchSessions)

  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])

  return (
    <div className="flex h-full bg-app">
      {/* Sidebar */}
      <div className="shrink-0 overflow-hidden" style={{ width: sidebarOpen ? sidebarWidth : 0 }}>
        <Sidebar />
      </div>
      {sidebarOpen && (
        <ResizeHandle
          side="right"
          currentWidth={sidebarWidth}
          onChange={setSidebarWidth}
          ariaLabel="サイドバーの幅を調整"
        />
      )}

      {/* Main chat area */}
      <div className="flex-1 min-w-0 flex flex-col">
        <Routes>
          <Route path="/" element={<ChatArea />} />
          <Route path="/chat/:sessionId" element={<ChatArea />} />
        </Routes>
      </div>

      {/* Right panel */}
      {rightPanelOpen && (
        <ResizeHandle
          side="left"
          currentWidth={rightPanelWidth}
          onChange={setRightPanelWidth}
          ariaLabel="右パネルの幅を調整"
        />
      )}
      <div
        className="shrink-0 overflow-hidden"
        style={{ width: rightPanelOpen ? rightPanelWidth : 0 }}
      >
        <RightPanel />
      </div>
    </div>
  )
}
