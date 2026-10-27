@echo off
cd "C:\smarttracker_automation"
echo Starting daily tests at %date% %time% >> scripts\scheduled_task.log
call node scripts\run-daily-tests.js >> scripts\scheduled_task.log 2>&1
echo Finished daily tests at %date% %time% >> scripts\scheduled_task.log
call node scripts\send-report.js >> scripts\scheduled_task.log 2>&1
