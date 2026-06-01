"""
apps/sharing/management/commands/expire_shares.py
─────────────────────────────────────────────────────────────────────────────
Management command to mark expired share links as expired.

Run manually:
    python manage.py expire_shares

Or via cron (every hour):
    0 * * * * /path/to/venv/bin/python /path/to/manage.py expire_shares

"""

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.sharing.models import FileShare, ZipShare


class Command(BaseCommand):
    help = 'Mark all expired single-file shares and ZIP shares as expired.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be marked without making any changes.',
        )

    def handle(self, *args, **options):
        now     = timezone.now()
        dry_run = options['dry_run']

        # ── FileShare ──────────────────────────────────────────────────────
        fs_qs = FileShare.objects.filter(
            status=FileShare.Status.ACTIVE,
            expires_at__lt=now,
        )
        fs_count = fs_qs.count()

        # ── ZipShare ───────────────────────────────────────────────────────
        zs_qs = ZipShare.objects.filter(
            status=ZipShare.Status.ACTIVE,
            expires_at__lt=now,
        )
        zs_count = zs_qs.count()

        total = fs_count + zs_count

        if dry_run:
            if total:
                self.stdout.write(
                    self.style.WARNING(
                        f'[DRY RUN] Would mark {fs_count} FileShare(s) and '
                        f'{zs_count} ZipShare(s) as expired ({total} total).'
                    )
                )
            else:
                self.stdout.write('[DRY RUN] No expired shares found.')
            return

        if total:
            fs_qs.update(status=FileShare.Status.EXPIRED)
            zs_qs.update(status=ZipShare.Status.EXPIRED)
            self.stdout.write(
                self.style.SUCCESS(
                    f'Marked {fs_count} FileShare(s) and {zs_count} ZipShare(s) '
                    f'as expired ({total} total).'
                )
            )
        else:
            self.stdout.write('No expired shares found.')