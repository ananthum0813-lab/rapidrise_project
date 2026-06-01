import uuid
import secrets
import hashlib
import zipfile
import io
import os
from django.db import models
from django.conf import settings
from django.utils import timezone
from datetime import timedelta


class FileShare(models.Model):
    class Status(models.TextChoices):
        ACTIVE  = 'active',  'Active'
        EXPIRED = 'expired', 'Expired'
        REVOKED = 'revoked', 'Revoked'

    id              = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    file            = models.ForeignKey('files.File', on_delete=models.CASCADE, related_name='shares')
    shared_by       = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='shared_files')
    recipient_email = models.EmailField()
    share_token     = models.UUIDField(unique=True, default=uuid.uuid4, editable=False, db_index=True)
    message         = models.TextField(blank=True, max_length=1000)
    expires_at      = models.DateTimeField()
    status          = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE, db_index=True)
    shared_at       = models.DateTimeField(default=timezone.now)
    accessed_at     = models.DateTimeField(null=True, blank=True)
    download_count  = models.PositiveIntegerField(default=0)
    view_count      = models.PositiveIntegerField(default=0)
    last_ip         = models.GenericIPAddressField(null=True, blank=True)
    last_user_agent = models.CharField(max_length=512, blank=True)

    class Meta:
        db_table = 'file_shares'
        ordering = ['-shared_at']
        indexes  = [
            models.Index(fields=['shared_by', 'status']),
            models.Index(fields=['share_token']),
        ]

    def __str__(self):
        return f'{self.file.original_name} → {self.recipient_email}'

    @property
    def is_expired(self):
        return timezone.now() > self.expires_at

    @property
    def is_active(self):
        return self.status == self.Status.ACTIVE and not self.is_expired

    @property
    def has_been_accessed(self):
        return self.accessed_at is not None

    @property
    def share_url(self):
        return f'{settings.FRONTEND_URL}/share/{self.share_token}'

    def mark_accessed(self, ip=None, user_agent=''):
        if not self.accessed_at:
            self.accessed_at = timezone.now()
        self.download_count += 1
        self.last_ip         = ip
        self.last_user_agent = (user_agent or '')[:512]
        self.save(update_fields=['accessed_at', 'download_count', 'last_ip', 'last_user_agent'])

    def mark_viewed(self, ip=None, user_agent=''):
        self.view_count     += 1
        self.last_ip         = ip
        self.last_user_agent = (user_agent or '')[:512]
        self.save(update_fields=['view_count', 'last_ip', 'last_user_agent'])

    def revoke(self):
        self.status = self.Status.REVOKED
        self.save(update_fields=['status'])


class ZipShare(models.Model):
    class Status(models.TextChoices):
        ACTIVE  = 'active',  'Active'
        EXPIRED = 'expired', 'Expired'
        REVOKED = 'revoked', 'Revoked'

    id              = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    shared_by       = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='zip_shares')
    files           = models.ManyToManyField('files.File', related_name='zip_shares')
    recipient_email = models.EmailField()
    share_token     = models.UUIDField(unique=True, default=uuid.uuid4, editable=False, db_index=True)
    message         = models.TextField(blank=True, max_length=1000)
    zip_name        = models.CharField(max_length=255, default='shared_files.zip')
    expires_at      = models.DateTimeField()
    status          = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE, db_index=True)
    shared_at       = models.DateTimeField(default=timezone.now)
    accessed_at     = models.DateTimeField(null=True, blank=True)
    download_count  = models.PositiveIntegerField(default=0)
    last_ip         = models.GenericIPAddressField(null=True, blank=True)
    last_user_agent = models.CharField(max_length=512, blank=True)
    file_count      = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = 'zip_shares'
        ordering = ['-shared_at']
        indexes  = [
            models.Index(fields=['shared_by', 'status']),
            models.Index(fields=['share_token']),
        ]

    def __str__(self):
        return f'ZIP ({self.file_count} files) → {self.recipient_email}'

    @property
    def is_expired(self):
        return timezone.now() > self.expires_at

    @property
    def is_active(self):
        return self.status == self.Status.ACTIVE and not self.is_expired

    @property
    def has_been_accessed(self):
        return self.accessed_at is not None

    @property
    def share_url(self):
        return f'{settings.FRONTEND_URL}/zip-share/{self.share_token}'

    def mark_accessed(self, ip=None, user_agent=''):
        if not self.accessed_at:
            self.accessed_at = timezone.now()
        self.download_count += 1
        self.last_ip         = ip
        self.last_user_agent = (user_agent or '')[:512]
        self.save(update_fields=['accessed_at', 'download_count', 'last_ip', 'last_user_agent'])

    def revoke(self):
        self.status = self.Status.REVOKED
        self.save(update_fields=['status'])


class ShareAnalyticsEvent(models.Model):
    class EventType(models.TextChoices):
        VIEW     = 'view',     'View'
        DOWNLOAD = 'download', 'Download'

    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    share       = models.ForeignKey(FileShare, on_delete=models.CASCADE, related_name='events')
    event_type  = models.CharField(max_length=20, choices=EventType.choices)
    occurred_at = models.DateTimeField(default=timezone.now, db_index=True)
    ip_address  = models.GenericIPAddressField(null=True, blank=True)
    user_agent  = models.CharField(max_length=512, blank=True)
    country     = models.CharField(max_length=64, blank=True)

    class Meta:
        db_table = 'share_analytics_events'
        ordering = ['-occurred_at']
        indexes  = [
            models.Index(fields=['share', 'event_type']),
            models.Index(fields=['occurred_at']),
        ]

    def __str__(self):
        return f'{self.event_type} — {self.share_id} @ {self.occurred_at}'


class FileRequest(models.Model):
    class Status(models.TextChoices):
        OPEN      = 'open',      'Open'
        FULFILLED = 'fulfilled', 'Fulfilled'
        CLOSED    = 'closed',    'Closed'

    id              = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner           = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='file_requests',
    )
    title           = models.CharField(max_length=255)
    description     = models.TextField(blank=True, max_length=2000)
    recipient_email = models.EmailField(blank=True)
    upload_token    = models.UUIDField(unique=True, default=uuid.uuid4, editable=False, db_index=True)
    expires_at      = models.DateTimeField(null=True, blank=True)
    status          = models.CharField(max_length=20, choices=Status.choices, default=Status.OPEN)
    max_files       = models.PositiveIntegerField(default=10)
    created_at      = models.DateTimeField(default=timezone.now)
    updated_at      = models.DateTimeField(auto_now=True)
    required_files  = models.JSONField(default=list, blank=True)
    allowed_extensions = models.JSONField(default=list, blank=True)

    class Meta:
        db_table = 'file_requests'
        ordering = ['-created_at']

    def __str__(self):
        return f'Request: {self.title} by {self.owner.email}'

    @property
    def upload_url(self):
        return f'{settings.FRONTEND_URL}/request/upload/{self.upload_token}'

    @property
    def is_expired(self):
        if not self.expires_at:
            return False
        return timezone.now() > self.expires_at

    @property
    def submission_count(self):
        return self.submissions.filter(
            status__in=[
                SubmissionInbox.Status.PENDING,
                SubmissionInbox.Status.APPROVED,
                SubmissionInbox.Status.NEEDS_ACTION,
                SubmissionInbox.Status.COMPLETE,
            ]
        ).count()

    def close(self):
        self.status = self.Status.CLOSED
        self.save(update_fields=['status'])


OTP_EXPIRY_MINUTES   = 10
OTP_SESSION_MINUTES  = 30
OTP_MAX_ATTEMPTS     = 5
OTP_RESEND_COOLDOWN  = 60
OTP_MAX_SENDS_HOUR   = 5


class RequestRecipient(models.Model):
    id           = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    file_request = models.ForeignKey(
        FileRequest, on_delete=models.CASCADE, related_name='recipients',
    )
    email        = models.EmailField()
    name         = models.CharField(max_length=255, blank=True)
    upload_token = models.UUIDField(unique=True, default=uuid.uuid4, editable=False, db_index=True)

    created_at        = models.DateTimeField(default=timezone.now)
    first_uploaded_at = models.DateTimeField(null=True, blank=True)
    upload_count      = models.PositiveIntegerField(default=0)
    last_ip           = models.GenericIPAddressField(null=True, blank=True)

    otp_code_hash    = models.CharField(max_length=64, blank=True)
    otp_expires_at   = models.DateTimeField(null=True, blank=True)
    otp_verified     = models.BooleanField(default=False)
    otp_attempts     = models.PositiveIntegerField(default=0)
    otp_last_sent_at = models.DateTimeField(null=True, blank=True)
    otp_sends_hour   = models.PositiveIntegerField(default=0)
    otp_hour_window  = models.DateTimeField(null=True, blank=True)
    verified_until   = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table        = 'request_recipients'
        unique_together = [['file_request', 'email']]
        ordering        = ['created_at']

    def __str__(self):
        return f'{self.email} → {self.file_request.title}'

    @property
    def upload_url(self):
        return f'{settings.FRONTEND_URL}/request/upload/{self.upload_token}'

    @property
    def has_uploaded(self):
        return self.upload_count > 0

    @property
    def files_submitted_count(self):
        return self.submissions.filter(
            status__in=[
                SubmissionInbox.Status.PENDING,
                SubmissionInbox.Status.APPROVED,
                SubmissionInbox.Status.NEEDS_ACTION,
                SubmissionInbox.Status.COMPLETE,
            ]
        ).count()

    @staticmethod
    def _hash_otp(plaintext: str) -> str:
        return hashlib.sha256(plaintext.encode()).hexdigest()

    def generate_otp(self) -> str:
        plaintext = str(secrets.randbelow(900000) + 100000)
        now = timezone.now()

        if (not self.otp_hour_window or
                now >= self.otp_hour_window + timedelta(hours=1)):
            self.otp_sends_hour  = 0
            self.otp_hour_window = now

        self.otp_code_hash    = self._hash_otp(plaintext)
        self.otp_expires_at   = now + timedelta(minutes=OTP_EXPIRY_MINUTES)
        self.otp_verified     = False
        self.otp_attempts     = 0
        self.otp_last_sent_at = now
        self.otp_sends_hour  += 1
        self.verified_until   = None

        self.save(update_fields=[
            'otp_code_hash', 'otp_expires_at', 'otp_verified',
            'otp_attempts', 'otp_last_sent_at',
            'otp_sends_hour', 'otp_hour_window', 'verified_until',
        ])
        return plaintext

    def verify_otp(self, plaintext: str) -> tuple:
        now = timezone.now()

        if self.otp_attempts >= OTP_MAX_ATTEMPTS:
            return False, 'Too many incorrect attempts. Please request a new OTP.'

        if not self.otp_expires_at or now > self.otp_expires_at:
            return False, 'Invalid or expired OTP.'

        if self._hash_otp(plaintext) != self.otp_code_hash:
            self.otp_attempts += 1
            self.save(update_fields=['otp_attempts'])
            remaining = OTP_MAX_ATTEMPTS - self.otp_attempts
            if remaining <= 0:
                return False, 'Too many incorrect attempts. Please request a new OTP.'
            return False, 'Invalid or expired OTP.'

        self.otp_verified   = True
        self.otp_code_hash  = ''
        self.otp_expires_at = None
        self.otp_attempts   = 0
        self.verified_until = now + timedelta(minutes=OTP_SESSION_MINUTES)
        self.save(update_fields=[
            'otp_verified', 'otp_code_hash',
            'otp_expires_at', 'otp_attempts', 'verified_until',
        ])
        return True, ''

    @property
    def is_otp_verified(self) -> bool:
        if not self.otp_verified:
            return False
        if not self.verified_until:
            return False
        return timezone.now() < self.verified_until

    @property
    def can_resend_otp(self) -> bool:
        if not self.otp_last_sent_at:
            return True
        elapsed = (timezone.now() - self.otp_last_sent_at).total_seconds()
        return elapsed >= OTP_RESEND_COOLDOWN

    @property
    def resend_wait_seconds(self) -> int:
        if not self.otp_last_sent_at:
            return 0
        elapsed = (timezone.now() - self.otp_last_sent_at).total_seconds()
        return max(0, int(OTP_RESEND_COOLDOWN - elapsed))

    @property
    def hourly_sends_exceeded(self) -> bool:
        now = timezone.now()
        if not self.otp_hour_window:
            return False
        if now >= self.otp_hour_window + timedelta(hours=1):
            return False
        return self.otp_sends_hour >= OTP_MAX_SENDS_HOUR

    def record_upload(self, ip=None):
        if not self.first_uploaded_at:
            self.first_uploaded_at = timezone.now()
        self.upload_count += 1
        self.last_ip       = ip
        self.save(update_fields=['first_uploaded_at', 'upload_count', 'last_ip'])


class SubmissionInbox(models.Model):
    class Status(models.TextChoices):
        PENDING      = 'pending',      'Pending Review'
        APPROVED     = 'approved',     'Approved'
        REJECTED     = 'rejected',     'Rejected'
        NEEDS_ACTION = 'needs_action', 'Needs Action'
        COMPLETE     = 'complete',     'Complete'

    class SourceType(models.TextChoices):
        FILE_REQUEST = 'file_request', 'File Request'
        DIRECT_SHARE = 'direct_share', 'Direct Share Link Upload'
        ANONYMOUS    = 'anonymous',    'Anonymous Upload'

    id    = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='inbox_submissions',
    )
    source_type  = models.CharField(max_length=30, choices=SourceType.choices)
    file_request = models.ForeignKey(
        FileRequest, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='submissions',
    )
    recipient = models.ForeignKey(
        RequestRecipient, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='submissions',
    )
    submitter_email = models.EmailField(blank=True)
    submitter_name  = models.CharField(max_length=255, blank=True)
    submitter_ip    = models.GenericIPAddressField(null=True, blank=True)
    file = models.ForeignKey(
        'files.File', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='inbox_entry',
    )
    original_filename = models.CharField(max_length=255)
    file_size         = models.BigIntegerField(default=0)
    mime_type         = models.CharField(max_length=100, blank=True)
    status           = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    review_note      = models.TextField(blank=True, max_length=1000)
    rejection_reason = models.TextField(blank=True, max_length=1000)
    reviewed_at      = models.DateTimeField(null=True, blank=True)
    submitted_at     = models.DateTimeField(default=timezone.now, db_index=True)
    updated_at       = models.DateTimeField(auto_now=True)

    # Save-to-storage tracking 
    saved_to_storage = models.BooleanField(default=False)
    saved_filename   = models.CharField(max_length=500, blank=True, default='')

    class Meta:
        db_table = 'submission_inbox'
        ordering = ['-submitted_at']
        indexes  = [
            models.Index(fields=['owner', 'status']),
            models.Index(fields=['owner', 'source_type']),
            models.Index(fields=['file_request', 'status']),
            models.Index(fields=['recipient', 'status']),
        ]

    def __str__(self):
        return f'{self.original_filename} ({self.status}) — inbox of {self.owner.email}'

    def approve(self, note=''):
        self.status      = self.Status.APPROVED
        self.review_note = note
        self.reviewed_at = timezone.now()
        self.save(update_fields=['status', 'review_note', 'reviewed_at'])

    def reject(self, reason=''):
        self.status           = self.Status.REJECTED
        self.rejection_reason = reason
        self.reviewed_at      = timezone.now()
        self.save(update_fields=['status', 'rejection_reason', 'reviewed_at'])

    def mark_needs_action(self, note=''):
        self.status      = self.Status.NEEDS_ACTION
        self.review_note = note
        self.reviewed_at = timezone.now()
        self.save(update_fields=['status', 'review_note', 'reviewed_at'])

    def mark_complete(self):
        self.status      = self.Status.COMPLETE
        self.reviewed_at = timezone.now()
        self.save(update_fields=['status', 'reviewed_at'])