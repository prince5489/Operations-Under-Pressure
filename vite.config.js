import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  root: 'client',
  build: {
    outDir: '../public',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/items': 'http://localhost:3000',
      '/login': 'http://localhost:3000',
      '/me': 'http://localhost:3000',
      '/teams': 'http://localhost:3000',
      '/users': 'http://localhost:3000',
    },
  },
});
