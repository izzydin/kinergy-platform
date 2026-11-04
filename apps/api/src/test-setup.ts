/**
 * Diagnostic Instrumentation for API Test Suite Execution in CI.
 *
 * Captures process exit signals, uncaught exceptions, unhandled rejections,
 * and memory metrics to diagnose premature worker/process termination.
 * Operates non-intrusively without altering application logic or mock state.
 */

if (process.env.CI || process.env.DIAGNOSTIC_LOGS === 'true') {
  const getMemorySnapshot = () => {
    const mem = process.memoryUsage();
    return `heapUsed: ${Math.round(mem.heapUsed / 1024 / 1024)}MB, rss: ${Math.round(
      mem.rss / 1024 / 1024,
    )}MB, external: ${Math.round(mem.external / 1024 / 1024)}MB`;
  };

  process.on('uncaughtException', (err) => {
    console.error(
      `[CI_DIAGNOSTIC:UNCAUGHT_EXCEPTION] PID ${process.pid} (${getMemorySnapshot()}):`,
      err,
    );
  });

  process.on('unhandledRejection', (reason) => {
    console.error(
      `[CI_DIAGNOSTIC:UNHANDLED_REJECTION] PID ${process.pid} (${getMemorySnapshot()}):`,
      reason,
    );
  });

  process.on('beforeExit', (code) => {
    if (code !== 0) {
      console.warn(
        `[CI_DIAGNOSTIC:BEFORE_EXIT] PID ${process.pid} exiting with non-zero code ${code} (${getMemorySnapshot()})`,
      );
    }
  });
}
