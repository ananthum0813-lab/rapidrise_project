from django.contrib.auth.models import User
from rest_framework import serializers
from .models import Task,UploadedFile



# ─── Auth Serializers ─────────────────────────────────────────────────────────

class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=6)

    class Meta:
        model  = User
        fields = ['username', 'email', 'password']

    def create(self, validated_data):
        # Use create_user so Django hashes the password
        return User.objects.create_user(**validated_data)

# ─── Task Serializer ──────────────────────────────────────────────────────────

class TaskSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Task
        fields = ['id', 'title', 'description', 'completed', 'created_at']
        read_only_fields = ['id', 'created_at']

# ─── File Serializer ──────────────────────────────────────────────────────────

class UploadedFileSerializer(serializers.ModelSerializer):
    download_url = serializers.SerializerMethodField()

    class Meta:
        model  = UploadedFile
        fields = ['id', 'original_name', 'file_size', 'uploaded_at', 'download_url']

    def get_download_url(self, obj):
        request = self.context.get('request')
        return request.build_absolute_uri(f'/api/files/{obj.id}/download/')

