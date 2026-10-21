import { Layers, Users } from 'lucide-react';
import { NavItem } from './nav-item.tsx';
import { UserBlock } from './user-block.tsx';

/**
 * The design's 240px Tech Blue sidebar, with the signed-in user at its foot. The program name
 * joins the brand block in 4.5; the design's logo mark is left out (no organisation's brand is
 * hard-coded).
 */
export const Sidebar = () => (
  <aside className="flex w-60 shrink-0 flex-col bg-sidebar px-3 py-5">
    <div className="flex flex-col gap-0.5 px-2 pt-1 pb-6">
      <span className="text-xs text-tech-blue-100">Mentor portal</span>
    </div>
    <div className="px-2.5 py-2 text-[11px] tracking-[0.08em] text-tech-blue-200 uppercase">
      Workspace
    </div>
    <nav aria-label="Main">
      <ul className="flex flex-col gap-0.5">
        <NavItem to="/batches" icon={Layers} label="Batches" />
        <NavItem to="/users" icon={Users} label="Users and roles" />
      </ul>
    </nav>
    <UserBlock />
  </aside>
);
