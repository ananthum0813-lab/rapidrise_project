# apps/files/services.py

import logging

from django.conf import settings
from django.core.mail import send_mail


logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Single file share email
# ─────────────────────────────────────────────────────────────────────────────

def send_share_email(
    recipient_email: str,
    sender_name: str,
    file_name: str,
    share_url: str,
    message: str,
    expires_at
) -> None:
    """
    Send single file share notification email using SMTP.
    """

    try:
        body = (
            f'Hi,\n\n'
            f'{sender_name} shared a file with you on VShare.\n\n'
            f'File: {file_name}\n'
            f'Download Link: {share_url}\n'
            f'Expires: {expires_at.strftime("%d %b %Y, %H:%M UTC")}\n'
        )

        if message:
            body += f'\nMessage:\n"{message}"\n'

        body += '\nDo not share this link with others.\n'

        send_mail(
            subject=f'{sender_name} shared a file with you on VShare',
            message=body,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[recipient_email],
            fail_silently=False,
        )

        logger.info(f'Share email sent to {recipient_email}')

    except Exception as e:
        logger.error(f'Failed to send share email to {recipient_email}: {e}')


# ─────────────────────────────────────────────────────────────────────────────
# ZIP / Folder share email
# ─────────────────────────────────────────────────────────────────────────────

def send_zip_share_email(zip_share, shared_by, file_names):
    """
    Send ZIP/folder share email using SMTP.
    """

    try:
        sender_name  = getattr(shared_by, 'full_name', None) or shared_by.email
        download_url = zip_share.share_url
        expires_str  = zip_share.expires_at.strftime('%Y-%m-%d %H:%M UTC')

        shown_names = file_names[:20]
        extra_count = max(0, len(file_names) - 20)

        subject = f'{sender_name} shared {zip_share.file_count} file(s) with you'

        file_lines = '\n'.join(f'  • {n}' for n in shown_names)

        more_line = (
            f'\n  … and {extra_count} more file(s)'
            if extra_count else ''
        )

        body = (
            f'Hi,\n\n'
            f'{sender_name} shared {zip_share.file_count} file(s) with you as a ZIP bundle.\n\n'
            f'Files included:\n'
            f'{file_lines}'
            f'{more_line}\n'
        )

        if zip_share.message:
            body += f'\nMessage:\n  "{zip_share.message}"\n'

        body += (
            f'\nDownload "{zip_share.zip_name}":\n'
            f'  {download_url}\n\n'
            f'This link expires: {expires_str}\n'
            f'Do not share this link — it is private to you.\n'
        )

        send_mail(
            subject=subject,
            message=body,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[zip_share.recipient_email],
            fail_silently=False,
        )

        logger.info(f'ZIP share email sent to {zip_share.recipient_email}')

    except Exception as e:
        logger.error(
            f'Failed to send ZIP share email to {zip_share.recipient_email}: {e}'
        )