import logging
from datetime import timedelta

from django.conf import settings
from django.core.mail import send_mail, EmailMultiAlternatives
from django.utils import timezone

from apps.files.models import File
from .models import (
    FileShare,
    FileRequest,
    RequestRecipient,
    ShareAnalyticsEvent,
    SubmissionInbox,
)

logger = logging.getLogger(__name__)

# helpers 

FRONTEND_URL = getattr(settings, 'FRONTEND_URL', 'https://app.example.com')
FROM_EMAIL   = getattr(settings, 'DEFAULT_FROM_EMAIL', 'noreply@example.com')


# Single-file shares 

def _send_share_email(share: FileShare, shared_by, message: str = '') -> None:
    """Send a single-file share notification email to the recipient."""
    sender_name  = getattr(shared_by, 'full_name', None) or shared_by.email
    download_url = share.share_url
    expires_str  = share.expires_at.strftime('%Y-%m-%d %H:%M UTC')
    file_name    = share.file.original_name

    subject    = f'{sender_name} shared a file with you: {file_name}'
    body_plain = (
        f'Hi,\n\n'
        f'{sender_name} has shared a file with you.\n\n'
        f'File: {file_name}\n'
        + (f'Message: "{message}"\n\n' if message else '\n')
        + f'Download link (private — do not share):\n  {download_url}\n\n'
        f'This link expires: {expires_str}\n\n'
        f'If you were not expecting this, you can safely ignore this email.\n'
    )

    try:
        send_mail(
            subject=subject,
            message=body_plain,
            from_email=FROM_EMAIL,
            recipient_list=[share.recipient_email],
            fail_silently=False,
        )
    except Exception:
        logger.exception(
            '_send_share_email: failed for share %s → %s',
            share.id, share.recipient_email,
        )


def create_shares(
    user,
    file: File,
    recipient_emails: list[str],
    expiration_hours: int,
    message: str = '',
) -> list[FileShare]:
    """
    Create one FileShare per recipient email and dispatch notification emails.
    Returns the list of created FileShare objects.
    """
    expires_at = timezone.now() + timedelta(hours=expiration_hours)
    shares     = []

    for email in recipient_emails:
        share = FileShare.objects.create(
            file=file,
            shared_by=user,
            recipient_email=email,
            message=message,
            expires_at=expires_at,
            status=FileShare.Status.ACTIVE,
        )
        shares.append(share)
        _send_share_email(share, shared_by=user, message=message)

    return shares


# File requests 

def _send_upload_request_email(
    recipient: RequestRecipient,
    owner_name: str,
    title: str,
    description: str = '',
) -> None:
    """
    Send a per-recipient upload-request email containing their unique OTP-gated
    upload link.
    """
    upload_url = recipient.upload_url
    req        = recipient.file_request
    expires_str = (
        req.expires_at.strftime('%Y-%m-%d %H:%M UTC')
        if req.expires_at else 'No expiry set'
    )

    subject    = f'{owner_name} is requesting files from you: {title}'
    body_plain = (
        f'Hi{" " + recipient.name if recipient.name else ""},\n\n'
        f'{owner_name} has requested files from you.\n\n'
        f'Request: {title}\n'
        + (f'Details: {description}\n\n' if description else '\n')
        + f'Use your secure upload link below to submit files:\n'
        f'  {upload_url}\n\n'
        f'You will need to verify your email address with a one-time code (OTP) '
        f'before you can upload. The code will be sent to this email address.\n\n'
        f'This link is private — do not share it.\n'
        f'Link expires: {expires_str}\n\n'
        f'Maximum files you can upload: {req.max_files}\n'
    )

    try:
        send_mail(
            subject=subject,
            message=body_plain,
            from_email=FROM_EMAIL,
            recipient_list=[recipient.email],
            fail_silently=False,
        )
    except Exception:
        logger.exception(
            '_send_upload_request_email: failed for recipient %s (request %s)',
            recipient.id, req.id,
        )


def create_file_request(
    owner,
    title: str,
    description: str,
    recipient_emails: list[str],
    recipient_email: str = '',
    expiration_hours: int = 168,
    max_files: int = 10,
    required_files: list = None,
    allowed_extensions: list = None,
) -> FileRequest:
    """
    Create a FileRequest with one RequestRecipient per email address.
    Dispatch upload-invitation emails to each recipient.

    max_files is PER RECIPIENT — each person gets their own independent quota.
    """
    expires_at = timezone.now() + timedelta(hours=expiration_hours)

    req = FileRequest.objects.create(
        owner=owner,
        title=title,
        description=description,
        recipient_email=recipient_email,
        expires_at=expires_at,
        status=FileRequest.Status.OPEN,
        max_files=max_files,
        required_files=required_files or [],
        allowed_extensions=allowed_extensions or [],
    )

    owner_name = getattr(owner, 'full_name', None) or owner.email

    for email in recipient_emails:
        # get_or_create is safe if the same email appears twice in the list
        recipient, _ = RequestRecipient.objects.get_or_create(
            file_request=req,
            email=email,
            defaults={'name': ''},
        )
        _send_upload_request_email(
            recipient=recipient,
            owner_name=owner_name,
            title=title,
            description=description,
        )

    return req


# OTP email 

def send_otp_email(
    recipient_email: str,
    otp_code: str,
    owner_name: str,
    title: str,
) -> None:
    """
    Send a 6-digit OTP to the recipient so they can verify their identity
    before uploading files.

    """
    from .models import OTP_EXPIRY_MINUTES

    subject = f'Your upload verification code for: {title}'

    body_plain = (
        f'Hi,\n\n'
        f'You have been asked to upload files by {owner_name}.\n\n'
        f'To verify your identity, enter the following one-time code on the upload page:\n\n'
        f'    {otp_code}\n\n'
        f'This code expires in {OTP_EXPIRY_MINUTES} minutes.\n\n'
        f'SECURITY NOTICE\n'
        f'---------------\n'
        f'• Do not share this code with anyone.\n'
        f'• {owner_name} and our team will never ask for this code.\n'
        f'• If you did not request this code, please ignore this email.\n\n'
        f'Once verified, you will have 30 minutes to complete your upload.\n'
    )

    try:
        send_mail(
            subject=subject,
            message=body_plain,
            from_email=FROM_EMAIL,
            recipient_list=[recipient_email],
            fail_silently=False,
        )
        logger.info('send_otp_email: sent to %s for request "%s"', recipient_email, title)
    except Exception:
        logger.exception(
            'send_otp_email: delivery failed for %s (request "%s")',
            recipient_email, title,
        )
        # Re-raise so the view can decide whether to surface the error
        raise


#  Public-token validation 

def get_valid_share(token: str) -> FileShare:
    """
    Resolve a public share token to an active FileShare.
    Raises ValueError with a user-safe message on any failure.
    """
    try:
        share = FileShare.objects.select_related('file').get(share_token=token)
    except FileShare.DoesNotExist:
        raise ValueError('This share link is invalid or has expired.')

    if share.status == FileShare.Status.REVOKED:
        raise ValueError('This share link has been revoked.')

    if share.status == FileShare.Status.EXPIRED or share.is_expired:
        raise ValueError('This share link has expired.')

    if not share.is_active:
        raise ValueError('This share link is no longer available.')

    return share


def get_valid_recipient(token: str) -> RequestRecipient:
    """
    Resolve a per-recipient upload token to an active RequestRecipient.
    Also validates the parent FileRequest (open + not expired).
    Raises ValueError with a user-safe message on any failure.
    """
    logger.debug('get_valid_recipient: incoming token=%s', token)
    try:
        recipient = RequestRecipient.objects.select_related('file_request__owner').get(
            upload_token=token,
        )
    except RequestRecipient.DoesNotExist:
        logger.warning('get_valid_recipient: token not found: %s', token)
        raise ValueError('This upload link is invalid or has expired.')

    req = recipient.file_request
    logger.info(
        'get_valid_recipient: found recipient=%s email=%s request=%s',
        recipient.id,
        recipient.email,
        req.id,
    )

    if req.status != FileRequest.Status.OPEN:
        raise ValueError(
            'This file request is no longer accepting uploads '
            f'(status: {req.status}).'
        )

    if req.is_expired:
        req.close()
        raise ValueError('This upload link has expired.')

    return recipient


# Analytics 

def record_analytics_event(
    share: FileShare,
    event_type: str,
    ip: str = None,
    user_agent: str = '',
) -> ShareAnalyticsEvent:
    """
    Persist a view or download analytics event for a FileShare.
    Silently ignores errors so that a logging failure never breaks a download.
    """
    try:
        return ShareAnalyticsEvent.objects.create(
            share=share,
            event_type=event_type,
            ip_address=ip,
            user_agent=(user_agent or '')[:512],
        )
    except Exception:
        logger.exception(
            'record_analytics_event: failed for share %s event %s',
            share.id, event_type,
        )


# Submission inbox 

def create_submission(
    owner,
    source_type: str,
    original_filename: str,
    file_size: int,
    mime_type: str,
    submitter_email: str = '',
    submitter_name: str = '',
    submitter_ip: str = None,
    file_request: FileRequest = None,
    recipient: RequestRecipient = None,
    file: File = None,
) -> SubmissionInbox:
    """
    Create a SubmissionInbox entry for an uploaded file.
    Links to the FileRequest and RequestRecipient when available.
    """
    return SubmissionInbox.objects.create(
        owner=owner,
        source_type=source_type,
        file_request=file_request,
        recipient=recipient,
        submitter_email=submitter_email,
        submitter_name=submitter_name,
        submitter_ip=submitter_ip,
        file=file,
        original_filename=original_filename,
        file_size=file_size,
        mime_type=mime_type,
        status=SubmissionInbox.Status.PENDING,
    )