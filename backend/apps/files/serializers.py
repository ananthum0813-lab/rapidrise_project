import re
import os
from django.conf import settings
from django.db.models import Sum
from rest_framework import serializers
from .models import File
from apps.files.models import File
from .models import Folder


def sanitize_filename(name: str) -> str:
    name = os.path.basename(name)
    name = re.sub(r'[^\w\s.\-]', '_', name).strip()
    name = re.sub(r'\.{2,}', '.', name)
    return name or 'unnamed_file'


def get_mime_type(file) -> str:
    from .file_validation import detect_mime_type
    return detect_mime_type(file)


class FileSerializer(serializers.ModelSerializer):
    file_size_display = serializers.ReadOnlyField()
    # FIX: expose is_expired as a computed read-only field
    is_expired        = serializers.ReadOnlyField()

    file = serializers.SerializerMethodField()

    class Meta:
        model = File
        fields = [
            'id',
            'original_name',
            'file',
            'file_size',
            'file_size_display',
            'mime_type',
            'uploaded_at',
            'is_deleted',
            'deleted_at',
            'is_favorite',
            # FIX: these two fields were missing — the frontend needs them for
            # the expiry badge, column, preview modal, and SetExpiryModal.
            'expires_at',
            'is_expired',
        ]
        read_only_fields = fields

    def get_file(self, obj) -> str | None:
        if not (obj.file and obj.file.name):
            return None
        request = self.context.get('request')
        if request is not None:
            return request.build_absolute_uri(obj.file.url)
        return obj.file.url


class FileUploadSerializer(serializers.Serializer):
    files = serializers.ListField(
        child=serializers.FileField(allow_empty_file=False),
        min_length=1,
        max_length=20,
        error_messages={'min_length': 'At least one file is required.'},
    )

    def validate_files(self, files):
        allowed_types = getattr(settings, 'ALLOWED_MIME_TYPES', set())
        max_size = settings.MAX_FILE_SIZE_BYTES
        errors = []

        for f in files:
            if f.size > max_size:
                errors.append(
                    f"'{f.name}' is too large. Max size is {settings.MAX_FILE_SIZE_MB}MB."
                )
                continue

            mime = get_mime_type(f)
            if allowed_types and mime not in allowed_types:
                errors.append(
                    f"'{f.name}' — file type '{mime or 'unknown'}' is not allowed."
                )

        if errors:
            raise serializers.ValidationError(errors)
        return files

    def validate(self, attrs):
        user = self.context['request'].user
        new_size = sum(f.size for f in attrs['files'])
        used = File.objects.filter(owner=user, is_deleted=False).aggregate(
            total=Sum('file_size')
        )['total'] or 0

        if used + new_size > settings.MAX_STORAGE_BYTES:
            available = (settings.MAX_STORAGE_BYTES - used) / (1024 * 1024)
            raise serializers.ValidationError(
                f'Storage limit exceeded. You only have {available:.1f}MB available.'
            )
        return attrs


# ── Minimal file info embedded inside a folder response ───────────────────────

class FolderFileSerializer(serializers.ModelSerializer):
    file_size_display = serializers.ReadOnlyField()

    class Meta:
        model  = File
        fields = [
            'id', 'original_name', 'mime_type',
            'file_size', 'file_size_display', 'uploaded_at',
            'is_favorite', 'scan_status',
        ]
        read_only_fields = fields


# ── Full folder (with embedded file list) ─────────────────────────────────────

class FolderSerializer(serializers.ModelSerializer):
    file_count = serializers.ReadOnlyField()
    files      = FolderFileSerializer(
        many=True,
        read_only=True,
        source='files_active',
    )

    class Meta:
        model  = Folder
        fields = [
            'id', 'name', 'description', 'color', 'icon',
            'file_count', 'files',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'file_count', 'files', 'created_at', 'updated_at']

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Folder name cannot be empty.')
        return value


# ── Light summary (no embedded files) ────────────────────────────────────────

class FolderSummarySerializer(serializers.ModelSerializer):
    file_count = serializers.ReadOnlyField()

    class Meta:
        model  = Folder
        fields = ['id', 'name', 'description', 'color', 'icon', 'file_count', 'created_at']
        read_only_fields = fields


# ── Create / update ───────────────────────────────────────────────────────────

class CreateFolderSerializer(serializers.Serializer):
    name        = serializers.CharField(max_length=255)
    description = serializers.CharField(max_length=500, required=False, allow_blank=True, default='')
    color       = serializers.CharField(max_length=7,   required=False, default='#6366f1')
    icon        = serializers.CharField(max_length=50,  required=False, default='fa-folder')
    file_ids    = serializers.ListField(
        child=serializers.UUIDField(),
        required=False,
        default=list,
    )

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Folder name cannot be empty.')
        user = self.context['request'].user
        qs   = Folder.objects.filter(owner=user, name__iexact=value)
        if self.context.get('folder_pk'):
            qs = qs.exclude(pk=self.context['folder_pk'])
        if qs.exists():
            raise serializers.ValidationError(f'A folder named "{value}" already exists.')
        return value

    def validate_color(self, value):
        import re
        if not re.match(r'^#[0-9a-fA-F]{6}$', value):
            return '#6366f1'
        return value

    def validate_file_ids(self, value):
        if not value:
            return []
        user  = self.context['request'].user
        found = File.objects.filter(pk__in=value, owner=user, is_deleted=False)
        if found.count() != len(set(str(v) for v in value)):
            raise serializers.ValidationError('One or more file IDs are invalid or not owned by you.')
        return [str(f.pk) for f in found]


class AddRemoveFilesSerializer(serializers.Serializer):
    file_ids = serializers.ListField(
        child=serializers.UUIDField(),
        min_length=1,
    )

    def validate_file_ids(self, value):
        user  = self.context['request'].user
        found = File.objects.filter(pk__in=value, owner=user, is_deleted=False)
        if found.count() != len(set(str(v) for v in value)):
            raise serializers.ValidationError('One or more file IDs are invalid or not owned by you.')
        return [str(f.pk) for f in found]