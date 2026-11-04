const nxPreset = require('@nx/jest/preset').default;

module.exports = {
  ...nxPreset,
  workerIdleMemoryLimit: '512MB',
};
