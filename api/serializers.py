from django.contrib.auth.models import User
from rest_framework import serializers
from .models import Task



# ─── Auth Serializers ─────────────────────────────────────────────────────────

class RegisterSerializer(serializers.ModelSerializer):
    password         = serializers.CharField(write_only=True, min_length=8, max_length=20)
    confirm_password = serializers.CharField(write_only=True, min_length=8, max_length=20)

    class Meta:
        model  = User
        fields = ['username', 'email', 'password', 'confirm_password']

    def validate_password(self, value):
        if not any(char.isdigit() for char in value):
            raise serializers.ValidationError('Password must contain at least one number.')
        if not any(char.isalpha() for char in value):
            raise serializers.ValidationError('Password must contain at least one letter.')
        if not any(char in '!@#$%^&*()_+-=[]{}|;:,.<>?' for char in value):
            raise serializers.ValidationError('Password must contain at least one special character.')
        return value

    def validate(self, attrs):
        if attrs['password'] != attrs['confirm_password']:
            raise serializers.ValidationError({'confirm_password': 'Passwords do not match.'})
        return attrs

    def create(self, validated_data):
        validated_data.pop('confirm_password')  # Remove before saving
        # Use create_user so Django hashes the password
        return User.objects.create_user(**validated_data)

# ─── Task Serializer ──────────────────────────────────────────────────────────

class TaskSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Task
        fields = ['id', 'title', 'description', 'completed', 'created_at']
        read_only_fields = ['id', 'created_at']

