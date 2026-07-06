import { defineConfig } from 'vite';

export default defineConfig({
    base: './',
    build: {
        rollupOptions: {
            output: {
                manualChunks: {
                    phaser: ['phaser']
                }
            }
        }
    },
    server: {
        port: 8080,
        // Expose on the LAN so the game can be tested on a phone (see PLAN.md §3.10).
        host: true
    }
});
