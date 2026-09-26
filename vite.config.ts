import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/sokak/',
  plugins: [react()],
  test: {
    include: ['src/**/*.test.ts'],
  },
  build: {
    sourcemap: false,
  },
});
