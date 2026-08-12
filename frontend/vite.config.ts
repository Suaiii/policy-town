import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  base: '/policy-town',
  plugins: [react()],
  server: {
    allowedHosts: ['policy-town-your-app-name.fly.dev', 'localhost', '127.0.0.1'],
  },
});
