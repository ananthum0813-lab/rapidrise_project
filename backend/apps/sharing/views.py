import io
import os
import zipfile
import logging
import unicodedata
import re

from django.core import signing
from django.core.mail import EmailMultiAlternatives
from django.http import FileResponse, Http404, StreamingHttpResponse
from django.shortcuts import get_object_or_404
from django.db.models import Sum, Count, Q
from django.conf import settings
from django.utils import timezone

from rest_framework import status
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.pagination import PageNumberPagination
from rest_framework.exceptions import PermissionDenied, NotFound, ValidationError

from config.exceptions import success_response
from apps.files.models import File
from apps.files.serializers import FileSerializer, sanitize_filename
from apps.files.file_validation import detect_mime_type

from .models import (
    FileShare, ShareAnalyticsEvent,
    FileRequest, RequestRecipient, SubmissionInbox, ZipShare,
    OTP_EXPIRY_MINUTES, OTP_SESSION_MINUTES,
    OTP_MAX_ATTEMPTS, OTP_RESEND_COOLDOWN, OTP_MAX_SENDS_HOUR,
)
from .serializers import (
    CreateShareSerializer,
    FileShareSerializer,
    PublicShareSerializer,
    ShareAnalyticsEventSerializer,
    ShareAnalyticsSummarySerializer,
    FileRequestSerializer,
    CreateFileRequestSerializer,
    PublicRequestInfoSerializer,
    SubmissionInboxSerializer,
    ReviewSubmissionSerializer,
    CreateZipShareSerializer,
    ZipShareSerializer,
    PublicZipShareSerializer,
)
from .services import (
    create_shares,
    get_valid_share,
    get_valid_recipient,
    record_analytics_event,
    create_file_request,
    create_submission,
    send_otp_email,
)
from .tasks import dispatch_scan

logger = logging.getLogger(__name__)

BLOCKED_EXTENSIONS = {
    'exe', 'bat', 'cmd', 'sh', 'ps1', 'vbs', 'js', 'msi',
    'dll', 'com', 'scr', 'pif', 'reg', 'hta', 'jar',
}

DEFAULT_ALLOWED_MIMES = {
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
    'text/plain', 'text/csv',
    'application/zip', 'application/x-zip-compressed',
    'video/mp4', 'video/webm',
    'audio/mpeg', 'audio/wav',
}

MAX_FILE_SIZE_BYTES = getattr(settings, 'MAX_UPLOAD_SIZE_BYTES', 100 * 1024 * 1024)


class SharePagination(PageNumberPagination):
    page_size             = 10
    page_size_query_param = 'page_size'
    max_page_size         = 100


class InboxPagination(PageNumberPagination):
    page_size             = 20
    page_size_query_param = 'page_size'
    max_page_size         = 100


#  private helpers 

def _get_client_ip(request):
    xff = request.META.get('HTTP_X_FORWARDED_FOR', '')
    return xff.split(',')[0].strip() if xff else request.META.get('REMOTE_ADDR')


def _validate_file(uploaded_file, allowed_extensions=None):
    errors = []
    name   = uploaded_file.name or ''
    ext    = name.rsplit('.', 1)[-1].lower() if '.' in name else ''

    if uploaded_file.size > MAX_FILE_SIZE_BYTES:
        errors.append(f'File exceeds {MAX_FILE_SIZE_BYTES // (1024*1024)} MB limit.')
    if ext in BLOCKED_EXTENSIONS:
        errors.append(f'File type ".{ext}" is not allowed.')
    if allowed_extensions and ext not in [e.lower().lstrip('.') for e in allowed_extensions]:
        errors.append(f'File type ".{ext}" is not accepted for this request.')
    mime = detect_mime_type(uploaded_file)
    allowed_mimes = getattr(settings, 'ALLOWED_MIME_TYPES', DEFAULT_ALLOWED_MIMES)
    if mime not in allowed_mimes:
        errors.append(f'MIME type "{mime}" is not permitted.')
    return errors, mime


def _ascii_filename(name: str) -> str:
    nfkd = unicodedata.normalize('NFKD', name)
    ascii_only = nfkd.encode('ascii', 'ignore').decode('ascii')
    safe = re.sub(r'[^\w.\- ]', '_', ascii_only).strip() or 'download'
    return safe


def _content_disposition(filename: str, attachment: bool = True) -> str:
    disposition = 'attachment' if attachment else 'inline'
    ascii_name  = _ascii_filename(filename)
    from urllib.parse import quote
    utf8_encoded = quote(filename, safe='')
    return (
        f'{disposition}; filename="{ascii_name}"; '
        f"filename*=UTF-8''{utf8_encoded}"
    )


def _is_inline_preview_mime(mime: str) -> bool:
    mime = (mime or '').lower()
    return (
        mime == 'application/pdf'
        or mime.startswith('image/')
        or mime.startswith('text/')
    )


def _send_zip_share_email(zip_share, shared_by, file_names):
    from django.core.mail import send_mail
    sender_name  = getattr(shared_by, 'full_name', None) or shared_by.email
    download_url = zip_share.share_url
    expires_str  = zip_share.expires_at.strftime('%Y-%m-%d %H:%M UTC')
    shown_names  = file_names[:20]
    extra_count  = max(0, len(file_names) - 20)

    subject    = f'{sender_name} shared {zip_share.file_count} file(s) with you'
    file_lines = '\n'.join(f'  • {n}' for n in shown_names)
    more_line  = f'\n  … and {extra_count} more file(s)' if extra_count else ''

    body_plain = (
        f'Hi,\n\n'
        f'{sender_name} shared {zip_share.file_count} file(s) with you as a ZIP bundle.\n\n'
        f'Files included:\n{file_lines}{more_line}\n'
        + (f'\nMessage:\n  "{zip_share.message}"\n' if zip_share.message else '')
        + f'\nDownload "{zip_share.zip_name}":\n  {download_url}\n\n'
        f'This link expires: {expires_str}\n'
        f'Do not share this link — it is private to you.\n'
    )

    from_email = getattr(settings, 'DEFAULT_FROM_EMAIL', 'noreply@example.com')
    from django.core.mail import send_mail
    send_mail(
        subject=subject,
        message=body_plain,
        from_email=from_email,
        recipient_list=[zip_share.recipient_email],
        fail_silently=False,
    )


def _zip_stream_generator(files_queryset):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, mode='w', compression=zipfile.ZIP_DEFLATED, allowZip64=True) as zf:
        seen_names: dict[str, int] = {}
        for file_obj in files_queryset:
            try:
                if not file_obj.file or not file_obj.file.name:
                    continue
                arcname = file_obj.original_name or os.path.basename(file_obj.file.name)
                if arcname in seen_names:
                    seen_names[arcname] += 1
                    base, _, ext = arcname.rpartition('.')
                    arcname = f'{base}_{seen_names[arcname]}.{ext}' if ext else f'{arcname}_{seen_names[arcname]}'
                else:
                    seen_names[arcname] = 0
                with file_obj.file.open('rb') as fh:
                    data = fh.read()
                info = zipfile.ZipInfo(filename=arcname)
                info.compress_type = zipfile.ZIP_DEFLATED
                zf.writestr(info, data)
            except Exception as exc:
                logger.warning(
                    '_zip_stream_generator: skipped file pk=%s name=%s — %s',
                    file_obj.pk, getattr(file_obj, 'original_name', '?'), exc,
                )
    buf.seek(0)
    while True:
        chunk = buf.read(65536)
        if not chunk:
            break
        yield chunk


#  helper: count per-recipient active submissions 

_ACTIVE_STATUSES = [
    SubmissionInbox.Status.PENDING,
    SubmissionInbox.Status.APPROVED,
    SubmissionInbox.Status.NEEDS_ACTION,
    SubmissionInbox.Status.COMPLETE,
]


def _recipient_submission_count(recipient: RequestRecipient) -> int:
    """How many active (non-rejected) submissions this specific recipient has."""
    return SubmissionInbox.objects.filter(
        recipient=recipient,
        status__in=_ACTIVE_STATUSES,
    ).count()


# Signed OTP session token (X-Upload-Session header) scoped to recipient UUID —
# prevents other sessions from uploading once anyone has verified.

_SESSION_SIGNING_SALT = 'fileshare-upload-session-v1'


def _issue_session_token(recipient_id: str) -> str:
    """
    Create a signed, time-stamped session token encoding the recipient UUID.
    The timestamp is embedded automatically by signing.dumps().
    """
    return signing.dumps(str(recipient_id), salt=_SESSION_SIGNING_SALT)


def _validate_session_token(token: str, recipient_id: str) -> bool:
    """
    Return True only when:
      1. The token was signed by this server (valid signature).
      2. It has not expired (within OTP_SESSION_MINUTES).
      3. The embedded recipient UUID matches the one for this upload link.

    Any mismatch, tampering, or expiry returns False.
    """
    if not token:
        return False
    try:
        rid = signing.loads(
            token,
            salt=_SESSION_SIGNING_SALT,
            max_age=OTP_SESSION_MINUTES * 60,
        )
        return str(rid) == str(recipient_id)
    except (signing.BadSignature, signing.SignatureExpired, Exception):
        return False


#  All-files endpoint 

class AllFilesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = File.objects.filter(owner=request.user, is_deleted=False).order_by('original_name')
        search = request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(original_name__icontains=search)
        return success_response(data={
            'files': FileSerializer(qs, many=True, context={'request': request}).data,
            'count': qs.count(),
        })


# File Duplicate Detection 

class CheckDuplicateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        sha256 = request.data.get('sha256', '').strip().lower()
        if not sha256 or len(sha256) != 64:
            raise ValidationError({'sha256': 'Valid SHA-256 hex string required.'})
        duplicate = File.objects.filter(owner=request.user, sha256=sha256, is_deleted=False).first()
        if not duplicate:
            return success_response(data={'is_duplicate': False}, message='No duplicate found.')
        return success_response(
            data={'is_duplicate': True, 'existing_file': FileSerializer(duplicate, context={'request': request}).data},
            message='Duplicate file detected.',
        )


#  Single-file Share 

class CreateShareView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        raw    = request.data.get('recipient_emails') or request.data.get('recipient_email', '')
        emails = [e.strip() for e in raw.split(',') if e.strip()] if isinstance(raw, str) else list(raw)
        if not emails:
            raise ValidationError({'recipient_emails': 'At least one recipient email is required.'})
        serializer = CreateShareSerializer(
            data={**request.data, 'recipient_emails': emails},
            context={'request': request},
        )
        serializer.is_valid(raise_exception=True)
        shares = create_shares(
            user=request.user,
            file=serializer.context['file'],
            recipient_emails=serializer.validated_data['recipient_emails'],
            expiration_hours=serializer.validated_data['expiration_hours'],
            message=serializer.validated_data.get('message', ''),
        )
        return success_response(
            data={'shares': FileShareSerializer(shares, many=True).data, 'count': len(shares)},
            message=f'File shared with {len(shares)} recipient(s).',
            status_code=status.HTTP_201_CREATED,
        )


class SharedFileListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = FileShare.objects.filter(shared_by=request.user).select_related('file')
        status_filter = request.query_params.get('status', '').strip()
        if status_filter in [c[0] for c in FileShare.Status.choices]:
            qs = qs.filter(status=status_filter)
        file_id = request.query_params.get('file_id', '').strip()
        if file_id:
            qs = qs.filter(file__id=file_id)
        paginator = SharePagination()
        page      = paginator.paginate_queryset(qs, request)
        return success_response(data={
            'results':      FileShareSerializer(page, many=True).data,
            'count':        paginator.page.paginator.count,
            'total_pages':  paginator.page.paginator.num_pages,
            'current_page': paginator.page.number,
            'next':         paginator.get_next_link(),
            'previous':     paginator.get_previous_link(),
        })


class RevokeShareView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        share = get_object_or_404(FileShare, pk=pk, shared_by=request.user)
        if share.status == FileShare.Status.REVOKED:
            return success_response(message='This share is already revoked.')
        share.revoke()
        return success_response(message='Share revoked.')


class DeleteShareView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        share = get_object_or_404(FileShare, pk=pk, shared_by=request.user)
        share.delete()
        return success_response(message='Share deleted.')


class ShareAnalyticsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        share = get_object_or_404(FileShare, pk=pk, shared_by=request.user)
        return success_response(data=ShareAnalyticsSummarySerializer(share).data)


class GlobalShareAnalyticsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        fs_qs  = FileShare.objects.filter(shared_by=request.user)
        fs_agg = fs_qs.aggregate(
            total_shares=Count('id'),
            total_downloads=Sum('download_count'),
            active_count=Count('id', filter=Q(status='active')),
            expired_count=Count('id', filter=Q(status='expired')),
            revoked_count=Count('id', filter=Q(status='revoked')),
        )
        zs_qs  = ZipShare.objects.filter(shared_by=request.user)
        zs_agg = zs_qs.aggregate(
            total_zip_shares=Count('id'),
            total_zip_downloads=Sum('download_count'),
            zip_active=Count('id', filter=Q(status='active')),
            zip_expired=Count('id', filter=Q(status='expired')),
            zip_revoked=Count('id', filter=Q(status='revoked')),
        )
        top_shares = fs_qs.order_by('-download_count')[:5]
        top_zips   = zs_qs.order_by('-download_count')[:5]
        return success_response(data={
            'single_file': fs_agg,
            'zip_shares':  zs_agg,
            'totals': {
                'total_shares':    (fs_agg['total_shares'] or 0) + (zs_agg['total_zip_shares'] or 0),
                'total_downloads': (fs_agg['total_downloads'] or 0) + (zs_agg['total_zip_downloads'] or 0),
                'active_count':    (fs_agg['active_count'] or 0) + (zs_agg['zip_active'] or 0),
                'expired_count':   (fs_agg['expired_count'] or 0) + (zs_agg['zip_expired'] or 0),
                'revoked_count':   (fs_agg['revoked_count'] or 0) + (zs_agg['zip_revoked'] or 0),
            },
            'top_shares': FileShareSerializer(top_shares, many=True).data,
            'top_zips':   ZipShareSerializer(top_zips, many=True).data,
        })


#  Multi-file ZIP Share 

class CreateZipShareView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = CreateZipShareSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)

        d         = serializer.validated_data
        files     = serializer.context['files']
        emails    = d['recipient_emails']
        zip_name  = d.get('zip_name', 'shared_files.zip')
        message   = d.get('message', '')
        exp_hours = d['expiration_hours']

        from datetime import timedelta
        expires_at = timezone.now() + timedelta(hours=exp_hours)
        file_names = [f.original_name for f in files]
        zip_shares = []

        for email in emails:
            zs = ZipShare.objects.create(
                shared_by=request.user,
                recipient_email=email,
                message=message,
                zip_name=zip_name,
                expires_at=expires_at,
                file_count=len(files),
                status=ZipShare.Status.ACTIVE,
            )
            zs.files.set(files)
            zip_shares.append(zs)
            try:
                _send_zip_share_email(zip_share=zs, shared_by=request.user, file_names=file_names)
            except Exception:
                logger.exception('CreateZipShareView: email failed for ZipShare %s → %s', zs.id, email)

        return success_response(
            data={
                'zip_shares': ZipShareSerializer(zip_shares, many=True).data,
                'count':      len(zip_shares),
                'file_count': len(files),
            },
            message=(
                f'{len(files)} files bundled as a ZIP and shared with '
                f'{len(zip_shares)} recipient(s). Download links sent by email.'
            ),
            status_code=status.HTTP_201_CREATED,
        )


class ZipShareListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = ZipShare.objects.filter(shared_by=request.user).prefetch_related('files')
        status_filter = request.query_params.get('status', '').strip()
        if status_filter in [c[0] for c in ZipShare.Status.choices]:
            qs = qs.filter(status=status_filter)
        paginator = SharePagination()
        page      = paginator.paginate_queryset(qs, request)
        return success_response(data={
            'results':      ZipShareSerializer(page, many=True).data,
            'count':        paginator.page.paginator.count,
            'total_pages':  paginator.page.paginator.num_pages,
            'current_page': paginator.page.number,
            'next':         paginator.get_next_link(),
            'previous':     paginator.get_previous_link(),
        })


class RevokeZipShareView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        zs = get_object_or_404(ZipShare, pk=pk, shared_by=request.user)
        if zs.status == ZipShare.Status.REVOKED:
            return success_response(message='Already revoked.')
        zs.revoke()
        return success_response(message='ZIP share revoked.')


class DeleteZipShareView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        zs = get_object_or_404(ZipShare, pk=pk, shared_by=request.user)
        zs.delete()
        return success_response(message='ZIP share deleted.')


class PublicZipShareInfoView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, token):
        try:
            zs = ZipShare.objects.prefetch_related('files').get(share_token=str(token))
        except ZipShare.DoesNotExist:
            raise NotFound(
                f'ZIP share not found for token "{token}". '
                'Use the share_token UUID from the creation response, not the id.'
            )
        if zs.status == ZipShare.Status.REVOKED:
            raise NotFound(f'This ZIP share has been revoked (id={zs.id}).')
        if zs.status == ZipShare.Status.EXPIRED or zs.is_expired:
            raise NotFound(f'This ZIP share has expired (expires_at={zs.expires_at}).')
        if not zs.is_active:
            raise NotFound(f'This ZIP share is not active (status={zs.status}).')
        return success_response(data=PublicZipShareSerializer(zs).data)


class PublicZipShareDownloadView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, token):
        try:
            zs = ZipShare.objects.prefetch_related('files').get(share_token=str(token))
        except ZipShare.DoesNotExist:
            raise NotFound('ZIP share not found.')
        if zs.status == ZipShare.Status.REVOKED:
            raise NotFound('This ZIP share link has been revoked.')
        if zs.status == ZipShare.Status.EXPIRED or zs.is_expired:
            raise NotFound('This ZIP share link has expired.')
        if not zs.is_active:
            raise NotFound('This ZIP share link is no longer available.')

        files = zs.files.filter(is_deleted=False)
        if not files.exists():
            raise NotFound('No files available in this ZIP share.')

        ip         = _get_client_ip(request)
        user_agent = request.META.get('HTTP_USER_AGENT', '')
        zs.mark_accessed(ip=ip, user_agent=user_agent)

        response = StreamingHttpResponse(
            _zip_stream_generator(files),
            content_type='application/zip',
        )
        response['Content-Disposition']    = _content_disposition(zs.zip_name)
        response['X-Content-Type-Options'] = 'nosniff'
        response['Cache-Control']          = 'no-cache, no-store, must-revalidate'
        return response


#  Public single-file share 

class PublicShareInfoView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, token):
        try:
            share = get_valid_share(str(token))
        except ValueError as e:
            raise NotFound(str(e))
        ip         = _get_client_ip(request)
        user_agent = request.META.get('HTTP_USER_AGENT', '')
        share.mark_viewed(ip=ip, user_agent=user_agent)
        record_analytics_event(share, ShareAnalyticsEvent.EventType.VIEW, ip=ip, user_agent=user_agent)
        return success_response(data=PublicShareSerializer(share).data)


class PublicShareDownloadView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, token):
        try:
            share = get_valid_share(str(token))
        except ValueError as e:
            raise NotFound(str(e))
        file_obj = share.file
        if file_obj.is_deleted:
            raise NotFound('The shared file has been deleted.')
        if not file_obj.file or not file_obj.file.name:
            raise Http404
        try:
            path = file_obj.file.path
        except Exception:
            raise Http404
        if not os.path.exists(path):
            raise Http404
        ip         = _get_client_ip(request)
        user_agent = request.META.get('HTTP_USER_AGENT', '')
        share.mark_accessed(ip=ip, user_agent=user_agent)
        record_analytics_event(share, ShareAnalyticsEvent.EventType.DOWNLOAD, ip=ip, user_agent=user_agent)
        force_download = request.query_params.get('download') in {'1', 'true', 'yes'}
        mime = file_obj.mime_type or 'application/octet-stream'
        as_attachment = force_download or not _is_inline_preview_mime(mime)

        response = FileResponse(
            open(path, 'rb'),
            content_type=mime,
        )
        response['Content-Disposition']    = _content_disposition(file_obj.original_name, attachment=as_attachment)
        response['Content-Length']         = file_obj.file_size
        response['X-Content-Type-Options'] = 'nosniff'
        response['Cache-Control']          = 'no-cache, no-store, must-revalidate'
        return response


#  File Requests 

class FileRequestListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = FileRequest.objects.filter(owner=request.user).prefetch_related('recipients')
        status_filter = request.query_params.get('status', '').strip()
        if status_filter in [c[0] for c in FileRequest.Status.choices]:
            qs = qs.filter(status=status_filter)
        paginator = SharePagination()
        page      = paginator.paginate_queryset(qs, request)
        return success_response(data={
            'results':      FileRequestSerializer(page, many=True).data,
            'count':        paginator.page.paginator.count,
            'total_pages':  paginator.page.paginator.num_pages,
            'current_page': paginator.page.number,
            'next':         paginator.get_next_link(),
            'previous':     paginator.get_previous_link(),
        })

    def post(self, request):
        serializer = CreateFileRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data

        recipient_emails = d.get('all_recipient_emails', [])
        if not recipient_emails:
            raise ValidationError({
                'recipient_emails': (
                    'At least one recipient email is required. '
                    'File request upload links are delivered by email only.'
                )
            })

        req = create_file_request(
            owner=request.user,
            title=d['title'],
            description=d.get('description', ''),
            recipient_emails=recipient_emails,
            recipient_email=d.get('recipient_email', ''),
            expiration_hours=d.get('expiration_hours', 168),
            max_files=d.get('max_files', 10),
            required_files=d.get('required_files', []),
            allowed_extensions=d.get('allowed_extensions', []),
        )
        return success_response(
            data=FileRequestSerializer(req).data,
            message='File request created.',
            status_code=status.HTTP_201_CREATED,
        )


class FileRequestDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def _get_obj(self, pk, user):
        req = get_object_or_404(FileRequest, pk=pk)
        if req.owner != user:
            raise PermissionDenied('Not your request.')
        return req

    def get(self, request, pk):
        return success_response(data=FileRequestSerializer(self._get_obj(pk, request.user)).data)

    def delete(self, request, pk):
        self._get_obj(pk, request.user).close()
        return success_response(message='File request closed.')


# Public per-recipient OTP endpoints 

class SendOTPView(APIView):
    """
    POST /api/sharing/requests/upload/<token>/send-otp/

    Generates a fresh OTP and emails it to the recipient.
    Called automatically when the public upload page loads, and on resend.

    """
    permission_classes = [AllowAny]

    def post(self, request, token):
        try:
            recipient = get_valid_recipient(str(token))
        except ValueError as e:
            raise NotFound(str(e))

        # Hard hourly cap
        if recipient.hourly_sends_exceeded:
            return success_response(
                data={
                    'sent':         False,
                    'wait_seconds': 0,
                    'hourly_limit': True,
                },
                message=(
                    f'Too many verification emails sent this hour '
                    f'(max {OTP_MAX_SENDS_HOUR}). Please try again later.'
                ),
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        # Cooldown — return wait time without regenerating the existing code
        if not recipient.can_resend_otp:
            wait = recipient.resend_wait_seconds
            return success_response(
                data={
                    'sent':            False,
                    'wait_seconds':    wait,
                    'expires_minutes': OTP_EXPIRY_MINUTES,
                },
                message=f'Please wait {wait} seconds before requesting a new code.',
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        # Generate OTP and dispatch email
        plaintext = recipient.generate_otp()
        req       = recipient.file_request
        owner_name = getattr(req.owner, 'full_name', None) or req.owner.email

        try:
            send_otp_email(
                recipient_email=recipient.email,
                otp_code=plaintext,
                owner_name=owner_name,
                title=req.title,
            )
            logger.info('OTP sent to %s for request %s', recipient.email, req.id)
        except Exception:
            logger.exception('SendOTPView: email send failed for recipient %s', recipient.id)
            # Don't expose delivery failure — OTP is still valid in the DB
            # so the user can try resend after cooldown.

        return success_response(
            data={
                'sent':            True,
                'wait_seconds':    OTP_RESEND_COOLDOWN,
                'expires_minutes': OTP_EXPIRY_MINUTES,
            },
            message=f'A verification code has been sent to {recipient.email}.',
            status_code=status.HTTP_200_OK,
        )


class VerifyOTPView(APIView):
    """
    POST /api/sharing/requests/upload/<token>/verify-otp/
    Body: { "otp": "483291" }

    Verifies the submitted OTP.
    """
    permission_classes = [AllowAny]

    def post(self, request, token):
        try:
            recipient = get_valid_recipient(str(token))
        except ValueError as e:
            raise NotFound(str(e))

        otp_input = str(request.data.get('otp', '')).strip()
        if not otp_input:
            raise ValidationError({'otp': 'OTP is required.'})

        success, error_msg = recipient.verify_otp(otp_input)

        if not success:
            logger.warning(
                'VerifyOTPView: failed attempt for recipient %s (attempt %s)',
                recipient.id, recipient.otp_attempts,
            )
            raise ValidationError({'otp': error_msg or 'Invalid or expired OTP.'})

        logger.info('OTP verified for recipient %s (request %s)', recipient.id, recipient.file_request_id)
        session_token = _issue_session_token(str(recipient.id))

        return success_response(
            data={
                'verified':        True,
                'session_minutes': OTP_SESSION_MINUTES,
                'session_token':   session_token,   # client must store & re-send
            },
            message='Email verified successfully.',
        )


class ResendOTPView(APIView):
    """
    POST /api/sharing/requests/upload/<token>/resend-otp/
    """
    permission_classes = [AllowAny]

    def post(self, request, token):
        # Delegate entirely to SendOTPView
        return SendOTPView().post(request, token=token)


# Public per-recipient info

class PublicRecipientInfoView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, token):
        try:
            recipient = get_valid_recipient(str(token))
        except ValueError as e:
            raise NotFound(str(e))

        req = recipient.file_request

        # Per-recipient slot calculation ( each recipient has their own quota)
        recipient_submitted = _recipient_submission_count(recipient)
        remaining = max(0, req.max_files - recipient_submitted)

        data = PublicRequestInfoSerializer({
            'id':                      req.id,
            'title':                   req.title,
            'description':             req.description,
            'owner_name':              getattr(req.owner, 'full_name', None) or req.owner.email,
            'expires_at':              req.expires_at,
            'max_files':               req.max_files,
            'allowed_extensions':      req.allowed_extensions,
            'required_files':          req.required_files,
            # submission_count = THIS recipient's count (not global)
            'submission_count':        recipient_submitted,
            'remaining_slots':         remaining,
            'recipient_email':         recipient.email,
            'recipient_name':          recipient.name,
            'recipient_upload_count':  recipient_submitted,
        }).data

        return success_response(data=data)


# Public per-recipient upload 

class PublicRecipientUploadView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, token):
        try:
            recipient = get_valid_recipient(str(token))
        except ValueError as e:
            raise ValidationError({'token': str(e)})

        req = recipient.file_request

        # Validate signed session token (FormData field, avoids CORS preflight).
        # Checks signature, expiry, and recipient scope — DB flag alone isn't enough
        # since it's shared across browsers and can't distinguish sessions.
        session_token = request.data.get('session_token', '').strip()
        if not _validate_session_token(session_token, str(recipient.id)):
            raise ValidationError({
                'otp': (
                    'Email verification required. '
                    'Please verify the OTP sent to your email before uploading.'
                )
            })

        # ── Per-recipient slot check (quota is per recipient, not shared) ─────
        current_count = _recipient_submission_count(recipient)

        if current_count >= req.max_files:
            raise ValidationError({
                'files': (
                    f'You have already uploaded the maximum of {req.max_files} '
                    f'file(s) allowed for this request.'
                )
            })

        files = request.FILES.getlist('files')
        if not files:
            raise ValidationError({'files': 'No files provided.'})

        remaining_slots = req.max_files - current_count
        if len(files) > remaining_slots:
            raise ValidationError({
                'files': (
                    f'You can upload {remaining_slots} more file(s). '
                    f'You submitted {len(files)}.'
                )
            })

        used_bytes = File.objects.filter(owner=req.owner, is_deleted=False).aggregate(
            total=Sum('file_size')
        )['total'] or 0
        available = settings.MAX_STORAGE_BYTES - used_bytes
        if available <= 0:
            raise ValidationError({'files': 'Storage limit exceeded. Delete files or empty trash before uploading.'})

        ip      = _get_client_ip(request)
        created = []
        errors  = []

        for f in files:
            validation_errors, mime = _validate_file(f, req.allowed_extensions or None)
            if validation_errors:
                errors.append({'file': f.name, 'errors': validation_errors})
                continue
            if f.size > available:
                errors.append({
                    'file': f.name,
                    'errors': [
                        'Storage limit exceeded — not enough storage space for this file.'
                    ],
                })
                continue
            try:
                clean_name  = sanitize_filename(f.name)
                file_record = File.objects.create(
                    owner=req.owner,
                    original_name=clean_name,
                    file=f,
                    file_size=f.size,
                    mime_type=mime,
                    scan_status=File.ScanStatus.PENDING,
                )
                create_submission(
                    owner=req.owner,
                    source_type=SubmissionInbox.SourceType.FILE_REQUEST,
                    original_filename=clean_name,
                    file_size=f.size,
                    mime_type=mime,
                    submitter_email=recipient.email,
                    submitter_name=recipient.name,
                    submitter_ip=ip,
                    file_request=req,
                    recipient=recipient,
                    file=file_record,
                )
                created.append({'filename': clean_name, 'size': f.size, 'scan_status': 'pending'})
                try:
                    dispatch_scan(str(file_record.id))
                except Exception:
                    logger.exception('Scan dispatch failed for file %s', file_record.id)
            except Exception as exc:
                logger.exception('Upload failed for %s', f.name)
                errors.append({'file': f.name, 'errors': [str(exc)]})

        if created:
            recipient.record_upload(ip=ip)

        if not created:
            msg = ' | '.join(e['errors'][0] if isinstance(e, dict) and 'errors' in e else str(e) for e in errors) if errors else 'No files uploaded.'
            return success_response(
                data={'submitted': 0, 'errors': errors},
                message=msg,
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        return success_response(
            data={'submitted': len(created), 'files': created, 'errors': errors or None},
            message=f'{len(created)} file(s) uploaded and queued for security scanning.',
            status_code=status.HTTP_201_CREATED,
        )


# Public scan-status polling 

class PublicUploadStatusView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, token):
        try:
            recipient = get_valid_recipient(str(token))
        except ValueError as e:
            raise NotFound(str(e))

        submissions = (
            SubmissionInbox.objects
            .filter(recipient=recipient)
            .select_related('file')
            .order_by('-submitted_at')
        )

        files = []
        for sub in submissions:
            files.append({
                'id':          str(sub.id),
                'filename':    sub.original_filename,
                'size':        sub.file_size,
                'scan_status': sub.file.scan_status if sub.file else 'scan_failed',
                'scan_result': (sub.file.scan_result or '') if sub.file else '',
                'uploaded_at': sub.submitted_at.isoformat(),
            })

        return success_response(data={'files': files})


#  Legacy shared-token upload 

class PublicFileRequestInfoView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, token):
        req = get_object_or_404(FileRequest, upload_token=token, status=FileRequest.Status.OPEN)
        if req.is_expired:
            req.close()
            raise NotFound('This upload request has expired.')
        return success_response(data=FileRequestSerializer(req).data)


class PublicFileRequestUploadView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, token):
        req = get_object_or_404(FileRequest, upload_token=token, status=FileRequest.Status.OPEN)
        if req.is_expired:
            req.close()
            raise NotFound('This upload request has expired.')
        files = request.FILES.getlist('files')
        if not files:
            raise ValidationError({'files': 'No files provided.'})
        if len(files) > req.max_files:
            raise ValidationError({'files': f'Maximum {req.max_files} files allowed.'})
        submitter_email = request.data.get('submitter_email', '').strip()
        submitter_name  = request.data.get('submitter_name', '').strip()
        ip      = _get_client_ip(request)
        created = []
        errors  = []
        for f in files:
            validation_errors, mime = _validate_file(f)
            if validation_errors:
                errors.append({'file': f.name, 'errors': validation_errors})
                continue
            try:
                clean_name  = sanitize_filename(f.name)
                file_record = File.objects.create(
                    owner=req.owner, original_name=clean_name, file=f,
                    file_size=f.size, mime_type=mime, scan_status=File.ScanStatus.PENDING,
                )
                create_submission(
                    owner=req.owner, source_type=SubmissionInbox.SourceType.FILE_REQUEST,
                    original_filename=clean_name, file_size=f.size, mime_type=mime,
                    submitter_email=submitter_email, submitter_name=submitter_name,
                    submitter_ip=ip, file_request=req, file=file_record,
                )
                created.append(str(file_record.id))
                try:
                    dispatch_scan(str(file_record.id))
                except Exception:
                    logger.exception('Scan dispatch failed for file %s', file_record.id)
            except Exception as exc:
                errors.append({'file': f.name, 'errors': [str(exc)]})
        if not created:
            msg = ' | '.join(e['errors'][0] if isinstance(e, dict) and 'errors' in e else str(e) for e in errors) if errors else 'No files uploaded.'
        else:
            msg = f'{len(created)} file(s) submitted.'

        return success_response(
            data={'submitted': len(created), 'errors': errors or None},
            message=msg,
            status_code=status.HTTP_201_CREATED if created else status.HTTP_400_BAD_REQUEST,
        )


# Submission Inbox 

class SubmissionInboxListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = (
            SubmissionInbox.objects
            .filter(owner=request.user)
            .select_related('file', 'file_request', 'recipient')
        )
        status_filter = request.query_params.get('status', '').strip()
        if status_filter:
            qs = qs.filter(status=status_filter)
        source_filter = request.query_params.get('source_type', '').strip()
        if source_filter:
            qs = qs.filter(source_type=source_filter)
        scan_filter = request.query_params.get('scan_status', '').strip()
        if scan_filter:
            qs = qs.filter(file__scan_status=scan_filter)
        file_request_id = request.query_params.get('file_request_id', '').strip()
        if file_request_id:
            qs = qs.filter(file_request__id=file_request_id)

        counts        = qs.values('status').annotate(n=Count('id'))
        status_counts = {row['status']: row['n'] for row in counts}
        scan_counts   = (
            SubmissionInbox.objects.filter(owner=request.user)
            .values('file__scan_status').annotate(n=Count('id'))
        )
        scan_status_counts = {
            row['file__scan_status']: row['n']
            for row in scan_counts if row['file__scan_status']
        }

        paginator = InboxPagination()
        page      = paginator.paginate_queryset(qs, request)
        return success_response(data={
            'results':            SubmissionInboxSerializer(page, many=True, context={'request': request}).data,
            'count':              paginator.page.paginator.count,
            'total_pages':        paginator.page.paginator.num_pages,
            'current_page':       paginator.page.number,
            'next':               paginator.get_next_link(),
            'previous':           paginator.get_previous_link(),
            'status_counts':      status_counts,
            'scan_status_counts': scan_status_counts,
        })


class ReviewSubmissionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        submission = get_object_or_404(SubmissionInbox, pk=pk, owner=request.user)
        if request.data.get('action') == 'approve':
            if submission.file and submission.file.scan_status != File.ScanStatus.SAFE:
                raise ValidationError({'action': 'Cannot approve a file that has not passed security scanning.'})
        serializer = ReviewSubmissionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        action = serializer.validated_data['action']
        note   = serializer.validated_data.get('note', '')
        if action == 'approve':
            submission.approve(note=note)
        elif action == 'reject':
            submission.reject(reason=note)
        elif action == 'needs_action':
            submission.mark_needs_action(note=note)
        elif action == 'complete':
            submission.mark_complete()
        return success_response(
            data=SubmissionInboxSerializer(submission, context={'request': request}).data,
            message=f'Submission marked as {action}.',
        )


class DeleteInfectedFileView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        submission = get_object_or_404(SubmissionInbox, pk=pk, owner=request.user)
        file_obj   = submission.file
        if file_obj and file_obj.scan_status not in (File.ScanStatus.INFECTED, File.ScanStatus.SCAN_FAILED):
            raise ValidationError({'detail': 'Only infected or scan-failed files can be deleted via this endpoint.'})
        filename = submission.original_filename
        if file_obj:
            try:
                file_obj.hard_delete()
            except Exception:
                logger.exception('Failed to hard-delete file %s', file_obj.pk)
        submission.delete()
        return success_response(message=f'Infected file "{filename}" permanently deleted.')


class RemoveInboxItemView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        submission = get_object_or_404(SubmissionInbox, pk=pk, owner=request.user)
        file_obj   = submission.file
        filename   = submission.original_filename

        if file_obj:
            try:
                file_obj.hard_delete()
                logger.info(
                    'RemoveInboxItemView: hard-deleted file pk=%s scan_status=%s',
                    file_obj.pk, file_obj.scan_status,
                )
            except Exception:
                logger.exception('RemoveInboxItemView: Failed to hard-delete file %s', file_obj.pk)

        submission.delete()
        return success_response(message=f'"{filename}" removed from inbox.')
    
class SaveToStorageView(APIView):
    """
    POST /api/sharing/inbox/<pk>/save-to-storage/

    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        from django.db.models import Sum
        from django.core.files.base import ContentFile
        from apps.files.views import resolve_unique_filename
        from apps.files.serializers import FileSerializer, sanitize_filename

        submission = get_object_or_404(SubmissionInbox, pk=pk, owner=request.user)

        if submission.status != SubmissionInbox.Status.COMPLETE:
            raise ValidationError({'detail': 'Only submissions with status "complete" can be saved to storage.'})

        file_obj = submission.file
        if not file_obj:
            raise ValidationError({'detail': 'This submission has no associated file.'})

        if file_obj.scan_status != File.ScanStatus.SAFE:
            raise ValidationError({'detail': 'Only files that have passed security scanning can be saved to storage.'})

        if submission.saved_to_storage:
            raise ValidationError({'detail': 'This file has already been saved to storage.'})

        # Resolve filename
        raw_name     = (request.data.get('filename') or '').strip()
        if not raw_name:
            raw_name = submission.original_filename or file_obj.original_name or 'file'
        desired_name = sanitize_filename(raw_name)
        unique_name  = resolve_unique_filename(desired_name, request.user)

        # Quota check
        used_bytes = File.objects.filter(
            owner=request.user, is_deleted=False
        ).aggregate(total=Sum('file_size'))['total'] or 0
        available = settings.MAX_STORAGE_BYTES - used_bytes
        if file_obj.file_size > available:
            raise ValidationError({
                'detail': (
                    f'Not enough storage space. '
                    f'File is {file_obj.file_size} bytes; '
                    f'you have {available} bytes available.'
                )
            })

        # Read source file and create a new independent File record
        try:
            with file_obj.file.open('rb') as fh:
                content = fh.read()
        except Exception as exc:
            logger.exception('SaveToStorageView: could not read file %s', file_obj.pk)
            raise ValidationError({'detail': f'Could not read source file: {exc}'})

        try:
            new_file_record = File.objects.create(
                owner=request.user,
                original_name=unique_name,
                file=ContentFile(content, name=unique_name),
                file_size=file_obj.file_size,
                mime_type=file_obj.mime_type,
                sha256=getattr(file_obj, 'sha256', '') or '',
                scan_status=File.ScanStatus.SAFE,
            )
        except Exception as exc:
            logger.exception('SaveToStorageView: failed to create File record')
            raise ValidationError({'detail': f'Failed to save file: {exc}'})

        # Mark submission as saved
        submission.saved_to_storage = True
        submission.saved_filename   = unique_name
        submission.save(update_fields=['saved_to_storage', 'saved_filename'])

        return success_response(
            data={
                'saved_file': FileSerializer(new_file_record, context={'request': request}).data,
                'submission': SubmissionInboxSerializer(submission, context={'request': request}).data,
            },
            message=f'"{unique_name}" saved to your storage.',
            status_code=status.HTTP_201_CREATED,
        )