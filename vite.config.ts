import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/sokak/',
  plugins: [react()],
  build: {
    sourcemap: true,
  },
});
