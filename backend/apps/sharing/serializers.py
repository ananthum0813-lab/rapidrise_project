from rest_framework import serializers
from apps.files.models import File
from .models import FileShare, ShareAnalyticsEvent, FileRequest, RequestRecipient, SubmissionInbox, ZipShare


class CreateShareSerializer(serializers.Serializer):
    file_id          = serializers.UUIDField()
    recipient_emails = serializers.ListField(
        child=serializers.EmailField(),
        min_length=1,
        max_length=20,
    )
    expiration_hours = serializers.IntegerField(min_value=1, max_value=720)
    message          = serializers.CharField(max_length=1000, required=False, allow_blank=True, default='')

    def validate_file_id(self, value):
        user = self.context['request'].user
        try:
            file = File.objects.get(pk=value, owner=user, is_deleted=False)
        except File.DoesNotExist:
            raise serializers.ValidationError('File not found or you do not have permission to share it.')
        self.context['file'] = file
        return value

    def validate_recipient_emails(self, value):
        return list({e.lower().strip() for e in value})


class FileShareSerializer(serializers.ModelSerializer):
    file_name         = serializers.CharField(source='file.original_name', read_only=True)
    file_id           = serializers.UUIDField(source='file.id', read_only=True)
    file_size_display = serializers.CharField(source='file.file_size_display', read_only=True)
    share_url         = serializers.ReadOnlyField()
    has_been_accessed = serializers.ReadOnlyField()
    is_active         = serializers.ReadOnlyField()
    share_type        = serializers.SerializerMethodField()

    class Meta:
        model  = FileShare
        fields = [
            'id', 'file_id', 'file_name', 'file_size_display',
            'recipient_email', 'message', 'share_url', 'status',
            'shared_at', 'expires_at', 'accessed_at',
            'download_count', 'has_been_accessed', 'is_active', 'last_ip',
            'share_type',
        ]
        read_only_fields = fields

    def get_share_type(self, obj):
        return 'single'


class PublicShareSerializer(serializers.ModelSerializer):
    file_name         = serializers.CharField(source='file.original_name', read_only=True)
    file_size_display = serializers.CharField(source='file.file_size_display', read_only=True)
    mime_type         = serializers.CharField(source='file.mime_type', read_only=True)

    class Meta:
        model  = FileShare
        fields = ['id', 'file_name', 'file_size_display', 'mime_type', 'message', 'shared_at', 'expires_at']
        read_only_fields = fields


class CreateZipShareSerializer(serializers.Serializer):
    file_ids         = serializers.ListField(
        child=serializers.UUIDField(),
        min_length=2,
        max_length=50,
    )
    recipient_emails = serializers.ListField(
        child=serializers.EmailField(),
        min_length=1,
        max_length=20,
    )
    expiration_hours = serializers.IntegerField(min_value=1, max_value=720)
    message          = serializers.CharField(max_length=1000, required=False, allow_blank=True, default='')
    zip_name         = serializers.CharField(max_length=200, required=False, allow_blank=True, default='')

    def validate_file_ids(self, value):
        user = self.context['request'].user
        files = File.objects.filter(pk__in=value, owner=user, is_deleted=False)
        if files.count() != len(set(str(v) for v in value)):
            raise serializers.ValidationError(
                'One or more files not found or you do not have permission to share them.'
            )
        self.context['files'] = list(files)
        return value

    def validate_recipient_emails(self, value):
        return list({e.lower().strip() for e in value})

    def validate_zip_name(self, value):
        if not value:
            return 'shared_files.zip'
        if not value.endswith('.zip'):
            value += '.zip'
        safe = ''.join(c for c in value if c.isalnum() or c in ('_', '-', '.', ' '))
        return safe or 'shared_files.zip'


class ZipShareFileSerializer(serializers.ModelSerializer):
    class Meta:
        model  = File
        fields = ['id', 'original_name', 'file_size_display', 'mime_type']
        read_only_fields = fields


class ZipShareSerializer(serializers.ModelSerializer):
    share_url         = serializers.ReadOnlyField()
    has_been_accessed = serializers.ReadOnlyField()
    is_active         = serializers.ReadOnlyField()
    files_info        = ZipShareFileSerializer(source='files', many=True, read_only=True)
    share_type        = serializers.SerializerMethodField()

    class Meta:
        model  = ZipShare
        fields = [
            'id', 'recipient_email', 'message', 'zip_name',
            'share_url', 'status', 'file_count', 'files_info',
            'shared_at', 'expires_at', 'accessed_at',
            'download_count', 'has_been_accessed', 'is_active', 'last_ip',
            'share_type',
        ]
        read_only_fields = fields

    def get_share_type(self, obj):
        return 'zip'


class PublicZipShareSerializer(serializers.ModelSerializer):
    files_info = ZipShareFileSerializer(source='files', many=True, read_only=True)

    class Meta:
        model  = ZipShare
        fields = ['id', 'zip_name', 'file_count', 'files_info', 'message', 'shared_at', 'expires_at']
        read_only_fields = fields


class ShareAnalyticsEventSerializer(serializers.ModelSerializer):
    class Meta:
        model        = ShareAnalyticsEvent
        fields       = ['id', 'event_type', 'occurred_at', 'ip_address', 'user_agent', 'country']
        read_only_fields = fields


class ShareAnalyticsSummarySerializer(serializers.ModelSerializer):
    file_name         = serializers.CharField(source='file.original_name', read_only=True)
    file_size_display = serializers.CharField(source='file.file_size_display', read_only=True)
    share_url         = serializers.ReadOnlyField()
    is_active         = serializers.ReadOnlyField()
    has_been_accessed = serializers.ReadOnlyField()

    class Meta:
        model  = FileShare
        fields = [
            'id', 'file_name', 'file_size_display',
            'recipient_email', 'status', 'share_url', 'is_active',
            'shared_at', 'expires_at', 'accessed_at',
            'download_count', 'has_been_accessed', 'last_ip',
        ]
        read_only_fields = fields


class RequestRecipientSerializer(serializers.ModelSerializer):
    upload_url      = serializers.ReadOnlyField()
    has_uploaded    = serializers.SerializerMethodField()
    files_submitted = serializers.SerializerMethodField()
    upload_status   = serializers.SerializerMethodField()

    class Meta:
        model  = RequestRecipient
        fields = [
            'id', 'email', 'name', 'upload_url',
            'upload_count', 'files_submitted', 'first_uploaded_at', 'created_at',
            'has_uploaded', 'upload_status',
        ]
        read_only_fields = fields

    def get_has_uploaded(self, obj):
        return obj.upload_count > 0

    def get_files_submitted(self, obj):
        return SubmissionInbox.objects.filter(
            recipient=obj,
            status__in=[
                SubmissionInbox.Status.PENDING,
                SubmissionInbox.Status.APPROVED,
                SubmissionInbox.Status.NEEDS_ACTION,
                SubmissionInbox.Status.COMPLETE,
            ]
        ).count()

    def get_upload_status(self, obj):
        if obj.upload_count > 0:
            return 'uploaded'
        if obj.first_uploaded_at:
            return 'uploaded'
        return 'not_opened'


class FileRequestSerializer(serializers.ModelSerializer):
    upload_url           = serializers.ReadOnlyField()
    submission_count     = serializers.SerializerMethodField()
    is_expired           = serializers.ReadOnlyField()
    recipients           = RequestRecipientSerializer(many=True, read_only=True)
    owner_name           = serializers.SerializerMethodField()
    total_recipients     = serializers.SerializerMethodField()
    uploaded_recipients  = serializers.SerializerMethodField()

    class Meta:
        model  = FileRequest
        fields = [
            'id', 'title', 'description', 'recipient_email',
            'upload_url', 'upload_token',
            'expires_at', 'status', 'max_files',
            'allowed_extensions', 'required_files',
            'created_at', 'updated_at',
            'submission_count', 'is_expired',
            'recipients', 'owner_name',
            'total_recipients', 'uploaded_recipients',
        ]
        read_only_fields = [
            'id', 'upload_url', 'upload_token', 'created_at', 'updated_at',
            'submission_count', 'is_expired', 'recipients', 'owner_name',
            'total_recipients', 'uploaded_recipients',
        ]

    def get_owner_name(self, obj):
        return getattr(obj.owner, 'full_name', None) or obj.owner.email

    def get_submission_count(self, obj):
        return SubmissionInbox.objects.filter(
            file_request=obj,
            status__in=[
                SubmissionInbox.Status.PENDING,
                SubmissionInbox.Status.APPROVED,
                SubmissionInbox.Status.NEEDS_ACTION,
                SubmissionInbox.Status.COMPLETE,
            ]
        ).count()

    def get_total_recipients(self, obj):
        return obj.recipients.count()

    def get_uploaded_recipients(self, obj):
        return obj.recipients.filter(upload_count__gt=0).count()


class CreateFileRequestSerializer(serializers.Serializer):
    title              = serializers.CharField(max_length=255)
    description        = serializers.CharField(max_length=2000, required=False, allow_blank=True, default='')
    recipient_email    = serializers.EmailField(required=False, allow_blank=True, default='')
    recipient_emails   = serializers.ListField(
        child=serializers.EmailField(),
        required=False,
        default=list,
        max_length=20,
    )
    expiration_hours   = serializers.IntegerField(min_value=1, max_value=8760, required=False, default=168)
    max_files          = serializers.IntegerField(min_value=1, max_value=50, default=10)
    required_files     = serializers.ListField(
        child=serializers.CharField(max_length=255),
        required=False,
        default=list,
    )
    allowed_extensions = serializers.ListField(
        child=serializers.CharField(max_length=10),
        required=False,
        default=list,
    )

    def validate(self, data):
        emails = set(e.lower().strip() for e in data.get('recipient_emails', []) if e.strip())
        if data.get('recipient_email', '').strip():
            emails.add(data['recipient_email'].lower().strip())
        data['all_recipient_emails'] = list(emails)
        return data


class PublicRequestInfoSerializer(serializers.Serializer):
    id                     = serializers.UUIDField()
    title                  = serializers.CharField()
    description            = serializers.CharField()
    owner_name             = serializers.CharField()
    expires_at             = serializers.DateTimeField()
    max_files              = serializers.IntegerField()
    allowed_extensions     = serializers.ListField(child=serializers.CharField())
    required_files         = serializers.ListField(child=serializers.CharField())
    submission_count       = serializers.IntegerField()
    remaining_slots        = serializers.IntegerField()
    recipient_email        = serializers.EmailField()
    recipient_name         = serializers.CharField()
    recipient_upload_count = serializers.IntegerField()


class SubmissionInboxSerializer(serializers.ModelSerializer):
    request_title   = serializers.CharField(source='file_request.title', read_only=True, default=None)
    file_url        = serializers.SerializerMethodField()
    download_url    = serializers.SerializerMethodField()
    scan_status     = serializers.CharField(source='file.scan_status', read_only=True, default='pending')
    scan_result     = serializers.CharField(source='file.scan_result',  read_only=True, default='')
    scanned_at      = serializers.DateTimeField(source='file.scanned_at', read_only=True, default=None)
    recipient_email = serializers.EmailField(source='recipient.email', read_only=True, default=None)
    recipient_name  = serializers.CharField(source='recipient.name',   read_only=True, default=None)

    class Meta:
        model  = SubmissionInbox
        fields = [
            'id', 'source_type',
            'file_request', 'request_title',
            'submitter_email', 'submitter_name',
            'recipient_email', 'recipient_name',
            'original_filename', 'file_size', 'mime_type',
            'file', 'file_url', 'download_url',
            'scan_status', 'scan_result', 'scanned_at',
            'status', 'review_note', 'rejection_reason',
            'submitted_at', 'reviewed_at',
            'saved_to_storage', 'saved_filename',
        ]
        read_only_fields = fields

    def _get_safe_url(self, obj):
        if not obj.file or not obj.file.file:
            return None
        if obj.file.scan_status != 'safe':
            return None
        request = self.context.get('request')
        if request:
            return request.build_absolute_uri(obj.file.file.url)
        return obj.file.file.url

    def get_file_url(self, obj):
        return self._get_safe_url(obj)

    def get_download_url(self, obj):
        return self._get_safe_url(obj)


class ReviewSubmissionSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=['approve', 'reject', 'needs_action', 'complete'])
    note   = serializers.CharField(max_length=1000, required=False, allow_blank=True, default='')