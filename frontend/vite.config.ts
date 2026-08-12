import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  base: '/policy-town',
  // .env.local 位于仓库根目录（与 convex dev 共用），前端也从那里读取 VITE_* 变量
  envDir: '..',
  plugins: [react()],
  server: {
    allowedHosts: ['policy-town-your-app-name.fly.dev', 'localhost', '127.0.0.1'],
  },
});
