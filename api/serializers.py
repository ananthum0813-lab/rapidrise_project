from django.contrib.auth.models import User
from rest_framework import serializers



# ─── Auth Serializers ─────────────────────────────────────────────────────────

class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=6)

    class Meta:
        model  = User
        fields = ['username', 'email', 'password']

    def create(self, validated_data):
        # Use create_user so Django hashes the password
        return User.objects.create_user(**validated_data)