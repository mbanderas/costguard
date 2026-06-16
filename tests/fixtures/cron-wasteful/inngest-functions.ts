// Wasteful inngest fixture: too-frequent (every 5 min) and unguarded
export const frequentSync = {
  id: "frequent-sync",
  name: "Frequent Sync",
  trigger: { cron: "*/5 * * * *" },
};

// Overlap: identical expression as the one in pg_cron (*/2 * * * *)
export const overlapSync = {
  id: "overlap-sync",
  name: "Overlap Sync",
  trigger: { cron: "*/2 * * * *" },
};
