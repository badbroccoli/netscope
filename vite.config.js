import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// GitHub Pages serves project sites from https://<user>.github.io/<repo>/,
// so production assets must be prefixed with the repo name. The dev server
// still runs at the domain root.
const BASE_PATH = process.env.NODE_ENV === 'production' ? '/netscope/' : '/';

export default defineConfig({
	base: BASE_PATH,
	plugins: [react()],
	server: {
		port: 3000,
	},
	resolve: {
		extensions: ['.jsx', '.js', '.json'],
		alias: {
			'@': path.resolve(__dirname, './src'),
		},
	},
	build: {
		outDir: 'dist',
	},
});
