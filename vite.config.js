import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': 'http://localhost:3000',
        '/__local_s3': {
          target: env.AWS_ENDPOINT_URL || 'https://127.0.0.1:9297',
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/__local_s3/, ''),
        },
      },
    },
  };
});
