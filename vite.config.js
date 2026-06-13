import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
    plugins: [react()],
    server: {
        port: 5173,
        proxy: {
            '/vacancies': 'https://diploma-project-production-8147.up.railway.app',
            '/health': 'https://diploma-project-production-8147.up.railway.app',
            '/criteria': 'https://diploma-project-production-8147.up.railway.app',
            '/scoring': 'https://diploma-project-production-8147.up.railway.app',
            '/resumes': 'https://diploma-project-production-8147.up.railway.app',
            '/analytics': 'https://diploma-project-production-8147.up.railway.app',
            '/runs': 'https://diploma-project-production-8147.up.railway.app',
            '/skills': 'https://diploma-project-production-8147.up.railway.app',
        }
    }
});