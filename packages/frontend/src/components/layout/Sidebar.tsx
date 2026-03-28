import { Link, useLocation, useNavigate } from 'react-router-dom';

interface SidebarProps {
  onNewProject?: () => void;
}

const NAV_ITEMS = [
  { href: '/dashboard', icon: 'dashboard', label: 'Dashboard' },
  { href: '/', icon: 'folder_open', label: 'Projects' },
  { href: '/profile', icon: 'settings', label: 'Settings' },
];

export function Sidebar({ onNewProject }: SidebarProps) {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  function isActive(href: string) {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  }

  function handleNewProject() {
    if (onNewProject) {
      onNewProject();
    } else {
      navigate('/');
    }
  }

  return (
    <aside className="flex flex-col h-screen w-64 border-r border-[#151a21] bg-[#0a0e14] py-6 fixed left-0 top-0 overflow-y-auto shrink-0 z-40">
      {/* Logo */}
      <div className="px-6 mb-8">
        <div className="text-xl font-bold tracking-tighter text-[#2E5BFF] font-headline">Synthetic Studio</div>
        <div className="font-label text-[10px] uppercase tracking-widest text-slate-500 mt-1">Data Engine v2.4</div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 px-4">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            to={item.href}
            className={
              isActive(item.href)
                ? 'flex items-center gap-3 px-4 py-3 bg-[#151a21] text-[#2E5BFF] border-l-2 border-[#2E5BFF] font-bold transition-all'
                : 'flex items-center gap-3 px-4 py-3 text-slate-400 font-medium hover:text-slate-100 hover:bg-[#262c36] rounded-md transition-colors duration-200'
            }
          >
            <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
            <span className="font-label uppercase tracking-widest text-[10px]">{item.label}</span>
          </Link>
        ))}
      </nav>

      {/* CTA + User */}
      <div className="px-4 mt-auto">
        <button
          onClick={handleNewProject}
          className="w-full py-3 bg-primary text-on-primary-fixed font-bold text-xs uppercase tracking-widest rounded-md hover:brightness-110 transition-all flex items-center justify-center gap-2"
        >
          <span className="material-symbols-outlined text-[18px]">add_circle</span>
          New Project
        </button>
        <div className="mt-6 flex items-center gap-3 p-2 bg-surface-container rounded-lg border border-[#44484f]/20">
          <div className="w-8 h-8 rounded bg-[#20262f] flex items-center justify-center text-[11px] font-bold text-[#85adff] shrink-0">
            SY
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-bold truncate text-on-surface">Admin_01</div>
            <div className="text-[9px] text-on-surface-variant font-label truncate">LOCAL INSTANCE</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
