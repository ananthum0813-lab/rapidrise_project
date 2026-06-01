from django.contrib import admin
from .models import FileShare


@admin.register(FileShare)
class FileShareAdmin(admin.ModelAdmin):
    list_display = ('file', 'shared_by', 'recipient_email', 'status', 'shared_at', 'expires_at', 'download_count')
    list_filter = ('status', 'shared_at')
    search_fields = ('file__original_name', 'shared_by__email', 'recipient_email')
    readonly_fields = ('id', 'share_token', 'shared_at', 'accessed_at', 'download_count')
    ordering = ('-shared_at',)