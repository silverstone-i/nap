import DashboardIcon from '@mui/icons-material/Dashboard';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import GroupsIcon from '@mui/icons-material/Groups';
import RuleIcon from '@mui/icons-material/Rule';
import InsightsIcon from '@mui/icons-material/Insights';

export const NAV_ITEMS = [
  {
    id: 'dashboard',
    label: 'Overview',
    icon: DashboardIcon,
    path: '/dashboard',
    capability: 'overview:view',
    modules: [
      { id: 'dashboard-snapshots', label: 'Snapshots', path: '/dashboard' },
      { id: 'dashboard-teams', label: 'Teams', path: '/dashboard/teams', capability: 'overview:teams' },
    ],
  },
  {
    id: 'planning',
    label: 'Planning',
    icon: CalendarMonthIcon,
    path: '/schedule/timeline',
    capability: 'planning:view',
    modules: [
      { id: 'schedule-timeline', label: 'Timeline', path: '/schedule/timeline' },
      { id: 'schedule-staffing', label: 'Staffing', path: '/schedule/staffing', capability: 'planning:staffing' },
    ],
  },
  {
    id: 'talent',
    label: 'Talent',
    icon: GroupsIcon,
    path: '/talent/roster',
    capability: 'talent:view',
    modules: [
      { id: 'talent-roster', label: 'Roster', path: '/talent/roster' },
    ],
  },
  {
    id: 'rules',
    label: 'Rules',
    icon: RuleIcon,
    path: '/rules/library',
    capability: 'rules:view',
    modules: [
      { id: 'rules-library', label: 'Library', path: '/rules/library' },
      { id: 'rules-policies', label: 'Policies', path: '/rules/policies', capability: 'rules:policies' },
    ],
  },
  {
    id: 'insights',
    label: 'Insights',
    icon: InsightsIcon,
    path: '/insights/performance',
    capability: 'insights:view',
    modules: [
      { id: 'insights-performance', label: 'Performance', path: '/insights/performance' },
      { id: 'insights-trends', label: 'Trends', path: '/insights/trends' },
    ],
  },
];

const hasCapability = (capabilities = []) => (requiredCap) => {
  if (!requiredCap) return true;
  if (!Array.isArray(capabilities) || capabilities.length === 0) return true;
  return capabilities.includes(requiredCap);
};

export function buildNavigationConfig(capabilities) {
  const can = hasCapability(capabilities);
  return NAV_ITEMS.filter((primary) => can(primary.capability)).map((primary) => ({
    ...primary,
    modules: (primary.modules || []).filter((module) => can(module.capability)),
  }));
}
