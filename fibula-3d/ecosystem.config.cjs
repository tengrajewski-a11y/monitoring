// PM2 process file for the Fibula 3D game server.
// Usage: pm2 start ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: 'fibula-3d',
      script: 'server/index.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '600M',
      kill_timeout: 5000,
      env: { NODE_ENV: 'production', PORT: 7172 },
    },
  ],
};
