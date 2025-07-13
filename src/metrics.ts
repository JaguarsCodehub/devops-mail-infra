import client from 'prom-client';

export const registerMetrics = new client.Registry();

// Memory usage gauges
const memoryUsageRSS = new client.Gauge({
  name: 'node_memory_rss_bytes',
  help: 'Resident Set Size memory',
});
const memoryUsageHeapTotal = new client.Gauge({
  name: 'node_memory_heap_total_bytes',
  help: 'Heap total',
});
const memoryUsageHeapUsed = new client.Gauge({
  name: 'node_memory_heap_used_bytes',
  help: 'Heap used',
});

// Email Syncs
const syncDurationSeconds = new client.Gauge({
  name: 'email_sync_duration_seconds',
  help: 'Time taken for last inbox sync (seconds)',
});

const syncEmailCount = new client.Gauge({
  name: 'email_sync_count_total',
  help: 'Total number of emails synced in last operation',
});

const syncEmailsPerSecond = new client.Gauge({
  name: 'email_sync_rate_emails_per_second',
  help: 'Email sync rate (emails per second)',
});

// CPU usages for my Endpoint
const cpuUsagePercent = new client.Gauge({
  name: 'node_cpu_percent',
  help: 'CPU usage percent',
});


registerMetrics.registerMetric(memoryUsageRSS);
registerMetrics.registerMetric(memoryUsageHeapTotal);
registerMetrics.registerMetric(memoryUsageHeapUsed);
registerMetrics.registerMetric(cpuUsagePercent);
registerMetrics.registerMetric(syncDurationSeconds);
registerMetrics.registerMetric(syncEmailCount);
registerMetrics.registerMetric(syncEmailsPerSecond);

setInterval(() => {
  const memUsage = process.memoryUsage();
  memoryUsageRSS.set(memUsage.rss);
  memoryUsageHeapTotal.set(memUsage.heapTotal);
  memoryUsageHeapUsed.set(memUsage.heapUsed);

  const cpuUsage = process.cpuUsage();
  const user = cpuUsage.user / 1000; // microseconds to milliseconds
  const system = cpuUsage.system / 1000;
  const totalCpu = (user + system) / 10; // rough % over 5s interval
  cpuUsagePercent.set(totalCpu);
  
}, 5000);

export function updateSyncDuration(durationMs: number, emailCount?: number) {
  syncDurationSeconds.set(durationMs / 1000); // milliseconds → seconds
  
  if (emailCount !== undefined) {
    syncEmailCount.set(emailCount);
    const emailsPerSecond = emailCount / (durationMs / 1000);
    syncEmailsPerSecond.set(emailsPerSecond);
  }
}