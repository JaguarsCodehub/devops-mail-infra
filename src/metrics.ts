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

registerMetrics.registerMetric(memoryUsageRSS);
registerMetrics.registerMetric(memoryUsageHeapTotal);
registerMetrics.registerMetric(memoryUsageHeapUsed);

setInterval(() => {
  const memUsage = process.memoryUsage();
  memoryUsageRSS.set(memUsage.rss);
  memoryUsageHeapTotal.set(memUsage.heapTotal);
  memoryUsageHeapUsed.set(memUsage.heapUsed);
}, 5000);
