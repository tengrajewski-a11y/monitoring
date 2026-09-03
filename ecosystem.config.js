// Konfiguracja PM2 (menedżera procesów) do uruchomienia aplikacji na VPS.
// Użycie: pm2 start ecosystem.config.js
module.exports = {
  apps: [
    {
      name: "trinity-trust-monitoring",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
