@echo off
cd /d "C:\Users\aad\OneDrive\TechSight Work\time attandance soft\AttendIQ"
start "AttendIQ API" pnpm dev
start "AttendIQ Web" pnpm --filter @attendiq/web dev