"""
apps/files/tasks.py
─────────────────────────────────────────────────────────────────────────────
Celery tasks for automatic file expiration and cleanup.

BEAT SCHEDULE (set in settings.py or celery.py)
────────────────────────────────────────────────
For TESTING (1-minute expiry):

    CELERY_BEAT_SCHEDULE = {
        'delete-expired-files': {
            'task': 'apps.files.tasks.delete_expired_files',
            'schedule': 60.0,          # every 60 seconds  ← use for testing
        },
    }

For PRODUCTION (hourly is fine when minimum expiry is 1 hour):

    from celery.schedules import crontab
    CELERY_BEAT_SCHEDULE = {
        'delete-expired-files': {
            'task': 'apps.files.tasks.delete_expired_files',
            'schedule': crontab(minute=0),   # every hour at :00
        },
    }

Manual trigger (Django shell):
    from apps.files.tasks import delete_expired_files
    delete_expired_files.delay()    # async via Celery
    delete_expired_files()          # sync (testing only)
"""

import os
import logging

from celery import shared_task
from django.db import transaction
from django.utils import timezone

logger = logging.getLogger(__name__)


@shared_task(
    bind=True,
    name='apps.files.tasks.delete_expired_files',
    max_retries=3,
    default_retry_delay=60,
    acks_late=True,
    reject_on_worker_lost=True,
)
def delete_expired_files(self):
    """
    Soft-delete every File whose ``expires_at`` is in the past and that
    has not already been deleted.

    FIX: ``select_for_update`` MUST run inside ``transaction.atomic()``.
    Without it the row-level lock is released immediately on PostgreSQL,
    making the skip_locked guard useless and allowing two concurrent workers
    to process the same file simultaneously.
    """
    from .models import File

    now = timezone.now()

    # Fetch IDs first (outside the transaction) so we know the total count
    # without holding locks longer than necessary.
    expired_ids = list(
        File.objects.filter(
            expires_at__isnull=False,
            expires_at__lte=now,
            is_deleted=False,
        ).values_list('id', flat=True)
    )

    total = len(expired_ids)
    logger.info('delete_expired_files | starting | %d expired file(s) found', total)

    deleted_count = 0
    failed_count  = 0

    # Process each file in its own atomic block so one failure doesn't roll
    # back the entire batch.
    for file_id in expired_ids:
        try:
            # FIX: select_for_update MUST be inside atomic() to hold the lock
            # for the duration of the update, not just the SELECT.
            with transaction.atomic():
                try:
                    file_obj = (
                        File.objects
                        .select_for_update(skip_locked=True)
                        .get(id=file_id, is_deleted=False)
                    )
                except File.DoesNotExist:
                    # Another worker already processed this file — skip silently.
                    logger.debug('delete_expired_files | already handled | id=%s', file_id)
                    continue

                # Re-check expiry inside the lock (race-condition safety)
                if not file_obj.expires_at or file_obj.expires_at > now:
                    logger.debug('delete_expired_files | expiry cleared before lock | id=%s', file_id)
                    continue

                # Step 1 — remove the physical bytes from storage
                _delete_physical_file(file_obj)

                # Step 2 — soft-delete the DB record
                _soft_delete(file_obj, now)

            deleted_count += 1
            logger.info(
                'delete_expired_files | soft-deleted | name="%s" id=%s expires_at=%s',
                file_obj.original_name,
                file_obj.id,
                file_obj.expires_at,
            )

        except Exception as exc:
            failed_count += 1
            logger.error(
                'delete_expired_files | FAILED | id=%s error=%s',
                file_id,
                exc,
                exc_info=True,
            )

    logger.info(
        'delete_expired_files | done | deleted=%d  failed=%d  total=%d',
        deleted_count, failed_count, total,
    )

    return {'deleted': deleted_count, 'failed': failed_count}


# ─── Private helpers ──────────────────────────────────────────────────────────

def _delete_physical_file(file_obj) -> None:
    try:
        if not (file_obj.file and file_obj.file.name):
            logger.debug('_delete_physical_file | no storage path | id=%s', file_obj.id)
            return

        file_path = file_obj.file.path

        if os.path.exists(file_path):
            os.remove(file_path)
            logger.debug('_delete_physical_file | removed | path=%s', file_path)
        else:
            logger.warning(
                '_delete_physical_file | file not on disk (already removed?) | id=%s path=%s',
                file_obj.id, file_path,
            )

    except Exception as exc:
        # Non-fatal — still soft-delete the DB record even if disk removal fails.
        logger.error(
            '_delete_physical_file | storage removal error | id=%s error=%s',
            file_obj.id, exc,
        )


def _soft_delete(file_obj, now) -> None:
    file_obj.is_deleted = True
    file_obj.deleted_at = now
    file_obj.save(update_fields=['is_deleted', 'deleted_at'])


# ─────────────────────────────────────────────────────────────────────────────
# Auto-purge trashed files after a retention window
# ─────────────────────────────────────────────────────────────────────────────

@shared_task(
    bind=True,
    name='apps.files.tasks.delete_trashed_files',
    max_retries=3,
    default_retry_delay=60,
    acks_late=True,
    reject_on_worker_lost=True,
)
def delete_trashed_files(self):
    """
    Permanently delete (hard-delete) every File that has been in the trash
    longer than TRASH_RETENTION_SECONDS.

    PRODUCTION → TRASH_RETENTION_SECONDS = 2_592_000    (30 days)
    TESTING    → TRASH_RETENTION_SECONDS = 60           (1 minute)

    To switch to testing mode, replace the constant below with 60 and update
    the beat schedule in celery.py (swap crontab(minute=0) for 60.0).

    The task is safe to run concurrently: select_for_update(skip_locked=True)
    inside atomic() ensures each row is processed by exactly one worker.
    """
    from .models import File
    from datetime import timedelta

    # ── Retention window ──────────────────────────────────────────────────────
    # PRODUCTION → 2_592_000  (30 days  =  60 × 60 × 24 × 30)
    # TESTING    → 60         (1 minute — swap in during local/staging runs only)
    TRASH_RETENTION_SECONDS = 2_592_000

    now    = timezone.now()
    cutoff = now - timedelta(seconds=TRASH_RETENTION_SECONDS)

    # Fetch IDs outside the transaction to minimise lock duration.
    due_ids = list(
        File.objects.filter(
            is_deleted=True,
            deleted_at__isnull=False,
            deleted_at__lte=cutoff,
        ).values_list('id', flat=True)
    )

    total = len(due_ids)
    logger.info('delete_trashed_files | starting | %d file(s) due for purge', total)

    purged_count = 0
    failed_count = 0

    for file_id in due_ids:
        try:
            with transaction.atomic():
                try:
                    file_obj = (
                        File.objects
                        .select_for_update(skip_locked=True)
                        .get(id=file_id, is_deleted=True)
                    )
                except File.DoesNotExist:
                    # Another worker already purged this file — skip silently.
                    logger.debug('delete_trashed_files | already handled | id=%s', file_id)
                    continue

                # Re-check inside the lock (race-condition safety).
                if not file_obj.deleted_at or file_obj.deleted_at > cutoff:
                    logger.debug('delete_trashed_files | deleted_at shifted | id=%s', file_id)
                    continue

                # Hard-delete: remove physical bytes then the DB row.
                _delete_physical_file(file_obj)   # reuse existing helper above
                file_obj.delete()                 # permanent DB row removal

            purged_count += 1
            logger.info(
                'delete_trashed_files | purged | name="%s" id=%s deleted_at=%s',
                file_obj.original_name,
                file_obj.id,
                file_obj.deleted_at,
            )

        except Exception as exc:
            failed_count += 1
            logger.error(
                'delete_trashed_files | FAILED | id=%s error=%s',
                file_id, exc,
                exc_info=True,
            )

    logger.info(
        'delete_trashed_files | done | purged=%d  failed=%d  total=%d',
        purged_count, failed_count, total,
    )
    return {'purged': purged_count, 'failed': failed_count}