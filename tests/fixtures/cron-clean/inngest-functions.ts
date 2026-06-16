// Clean inngest fixture: hourly cron (60 min interval >= 15 min threshold), guarded
export const dailySync = {
  id: "daily-sync",
  name: "Daily Sync",
  // singletonKey guard is within 5 lines of the cron expression (heuristic)
  singletonKey: "daily-sync-v1",
  trigger: { cron: "0 * * * *" },
};
