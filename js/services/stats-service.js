import { parseLocalDate, todayISO, addDays, isOverdue } from '../core/utils.js';

const STATUS_KEYS = ['todo', 'in_progress', 'review', 'done'];
const PRIORITY_KEYS = ['low', 'medium', 'high', 'critical'];

function toMillis(value) {
  if (!value) return -1;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.seconds === 'number') {
    return value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1e6);
  }
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isNaN(time) ? -1 : time;
  }
  if (typeof value === 'string') {
    const time = Date.parse(value);
    return Number.isNaN(time) ? -1 : time;
  }
  return -1;
}

export function buildStats(data = {}, today = todayISO()) {
  if (!parseLocalDate(today)) {
    throw new RangeError(`Tanggal acuan tidak valid: ${today}`);
  }

  const projects = Array.isArray(data?.projects) ? data.projects : [];
  const tasks = Array.isArray(data?.tasks) ? data.tasks : [];
  const users = Array.isArray(data?.users) ? data.users : [];
  const activity = Array.isArray(data?.activity) ? data.activity : [];

  const maxUpcomingDate = addDays(today, 7);

  const statusCounts = { todo: 0, in_progress: 0, review: 0, done: 0 };
  const priorityCounts = { low: 0, medium: 0, high: 0, critical: 0 };

  let activeProjects = 0;
  for (const project of projects) {
    if (project?.status === 'active') activeProjects++;
  }

  let inProgressTasks = 0;
  let overdueTasks = 0;
  let doneTasks = 0;

  const upcoming = [];
  const overdueAttention = [];
  const unassigned = [];

  const tasksByProject = new Map();
  for (const project of projects) {
    if (project?.id) tasksByProject.set(project.id, []);
  }

  const userMap = new Map();
  for (const user of users) {
    if (user?.id) {
      userMap.set(user.id, {
        userId: user.id,
        name: user.name || 'Anggota',
        active: 0,
        overdue: 0,
      });
    }
  }

  for (const task of tasks) {
    if (!task) continue;

    if (task.projectId && tasksByProject.has(task.projectId)) {
      tasksByProject.get(task.projectId).push(task);
    }

    if (STATUS_KEYS.includes(task.status)) {
      statusCounts[task.status]++;
    }
    if (PRIORITY_KEYS.includes(task.priority)) {
      priorityCounts[task.priority]++;
    }

    if (task.status === 'in_progress') inProgressTasks++;
    if (task.status === 'done') doneTasks++;

    const isTaskOverdue = isOverdue(task, today);
    if (isTaskOverdue) {
      overdueTasks++;
    }

    const isNotDone = task.status !== 'done';

    if (isNotDone) {
      if (!task.assigneeId) {
        unassigned.push(task);
      }

      if (isTaskOverdue) {
        overdueAttention.push(task);
      }

      const hasDueDate = Boolean(parseLocalDate(task.dueDate));
      if (hasDueDate && task.dueDate >= today && task.dueDate <= maxUpcomingDate) {
        upcoming.push(task);
      }
    }

    if (task.assigneeId) {
      if (!userMap.has(task.assigneeId)) {
        userMap.set(task.assigneeId, {
          userId: task.assigneeId,
          name: 'Anggota tidak tersedia',
          active: 0,
          overdue: 0,
        });
      }
      const userWorkload = userMap.get(task.assigneeId);
      if (isNotDone) {
        userWorkload.active++;
        if (isTaskOverdue) {
          userWorkload.overdue++;
        }
      }
    }
  }

  const totalTasks = tasks.length;
  const completionRate = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  const kpis = {
    activeProjects,
    inProgressTasks,
    overdueTasks,
    completionRate,
  };

  const projectProgress = projects.map((project) => {
    const list = tasksByProject.get(project.id) || tasks.filter((t) => t?.projectId === project.id);
    const total = list.length;
    const done = list.filter((t) => t.status === 'done').length;
    const percentage = total > 0 ? Math.round((done / total) * 100) : 0;
    return {
      id: project.id,
      name: project.name || '',
      done,
      total,
      percentage,
    };
  });

  const emptyProjects = projects.filter((project) => {
    const list = tasksByProject.get(project.id);
    return list ? list.length === 0 : !tasks.some((t) => t?.projectId === project.id);
  });

  upcoming.sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || '') || (a.id || '').localeCompare(b.id || ''));
  overdueAttention.sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || '') || (a.id || '').localeCompare(b.id || ''));

  const workload = [...userMap.values()].sort((a, b) => (
    b.active - a.active || b.overdue - a.overdue || a.name.localeCompare(b.name, 'id-ID')
  ));

  const validActivity = activity
    .filter((item) => toMillis(item?.createdAt) > 0)
    .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt))
    .slice(0, 10);

  return {
    kpis,
    statusCounts,
    priorityCounts,
    workload,
    projectProgress,
    upcoming,
    attention: {
      overdue: overdueAttention,
      emptyProjects,
      unassigned,
    },
    recentActivity: validActivity,
  };
}

export class StatsService {
  static summary(data, { today = todayISO() } = {}) {
    return buildStats(data, today);
  }

  summary(data, options) {
    return StatsService.summary(data, options);
  }
}
