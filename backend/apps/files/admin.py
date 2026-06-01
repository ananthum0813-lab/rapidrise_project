from django.contrib import admin
from .models import File


@admin.register(File)
class FileAdmin(admin.ModelAdmin):
    list_display = ('original_name', 'owner', 'file_size_display', 'mime_type', 'uploaded_at', 'is_deleted')
    list_filter = ('is_deleted', 'mime_type', 'uploaded_at')
    search_fields = ('original_name', 'owner__email')
    readonly_fields = ('id', 'uploaded_at', 'file_size', 'file_size_display')
    ordering = ('-uploaded_at',)