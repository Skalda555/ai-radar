@echo off
rem Dvojklikem spusti AI Radar tak, aby byl dostupny z LAN a z telefonu.
rem Adresu, na ktere aplikaci oteviras, musi obsahovat AI_RADAR_ALLOWED_HOSTS v .env.local.
call "%~dp0START.cmd" lan
