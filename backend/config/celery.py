import os
from celery import Celery
from celery.schedules import crontab
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
app = Celery("config")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()
# Fix deprecation warning
app.conf.broker_connection_retry_on_startup = True
app.conf.beat_schedule = {
'delete-expired-files': {
'task':     'apps.files.tasks.delete_expired_files',
'schedule': 60.0,
# 'schedule': crontab(minute=0),  # ← production
'options':  {'expires': 55},
    },
# ── Permanently purge files that have been in trash ≥ TRASH_RETENTION_SECONDS ──
# PRODUCTION → schedule: crontab(minute=0)  +  TRASH_RETENTION_SECONDS = 2_592_000  (30 days)
# TESTING    → schedule: 60.0               +  TRASH_RETENTION_SECONDS = 60         (1 minute) + 'expires': 55
'delete-trashed-files': {
'task':     'apps.files.tasks.delete_trashed_files',
'schedule': crontab(minute=0),   # ← production (hourly is plenty)
# 'schedule': 60.0,              # ← testing (run every 60 s)
'options':  {'expires': 3570},
    },
'expire-old-shares': {
'task':     'sharing.expire_old_shares',
'schedule': 300.0,
'options':  {'expires': 290},
    },
'unstick-scanning-files': {
'task':     'sharing.unstick_scanning_files',
'schedule': 180.0,
'options':  {'expires': 170},
    },
}
app.conf.timezone = 'UTC'
# ── IMPORTANT: do NOT hardcode queue in apply_async calls ─────────────────────
# These routes are only used when apply_async() does NOT specify queue=.
# The old code hardcoded queue='file_scan' which bypassed this entirely.
app.conf.task_routes = {
'sharing.scan_uploaded_file':                {'queue': 'celery'},
'sharing.expire_old_shares':                 {'queue': 'celery'},
'sharing.unstick_scanning_files':            {'queue': 'celery'},
'apps.files.tasks.delete_expired_files':     {'queue': 'celery'},
'apps.files.tasks.delete_trashed_files':     {'queue': 'celery'},  
}