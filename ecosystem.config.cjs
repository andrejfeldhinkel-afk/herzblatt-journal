module.exports = {
  apps: [{
    name: 'herzblatt-blog',
    script: 'server.mjs',
    cwd: '/home/xy/Andrej/blog',
    instances: 1,
    exec_mode: 'fork',
    env: {
      PORT: 9991,
      HOST: '0.0.0.0',
      NODE_ENV: 'production',
      ASTRO_TELEMETRY_DISABLED: '1'
    },
    max_restarts: 10,
    restart_delay: 3000,
    kill_timeout: 5000,
    error_file: '/home/xy/Andrej/blog/logs/error.log',
    out_file: '/home/xy/Andrej/blog/logs/out.log',
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
  }]
};
