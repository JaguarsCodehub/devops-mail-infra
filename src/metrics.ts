import client from 'prom-client';

export const registerMetrics = new client.Registry();

const memoryUsageGauge = new client.Gauge({
  name: 'node_memory_rss_bytes',
  help: 'Resident Set Size memory in bytes',
});

registerMetrics.registerMetric(memoryUsageGauge);

setInterval(() => {
  memoryUsageGauge.set(process.memoryUsage().rss);
}, 5000);
