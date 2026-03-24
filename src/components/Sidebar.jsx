export default function Sidebar({ activeTool, onSelectTool, isOpen, onClose }) {
  const TOOLS = [
    { id: 'Visualizer', name: 'Visualizer', icon: '📊' },
    { id: 'Table', name: 'Data Table', icon: '📄' }
  ];

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && <div className="sidebar-overlay" onClick={onClose} />}

      <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
        {/* Logo */}
        <div className="sidebar-logo">
          <h1>Theme Tracker</h1>
          <div className="subtitle">Market Intelligence</div>
        </div>

        {/* Tools Navigator */}
        <div className="sidebar-section" style={{ marginTop: 12 }}>
          <div className="sidebar-section-title">
            <span>⚙️</span>
            <span>Tools</span>
          </div>
          <div className="sidebar-tools">
            {TOOLS.map((tool) => (
              <div
                key={tool.id}
                className={`sidebar-item ${activeTool === tool.id ? 'active' : ''}`}
                onClick={() => onSelectTool(tool.id)}
              >
                <span className="tool-icon">{tool.icon}</span>
                <span>{tool.name}</span>
              </div>
            ))}
          </div>
        </div>

      </aside>
    </>
  );
}
