from django.contrib.auth.models import User
from rest_framework import serializers


class RegisterSerializer(serializers.ModelSerializer):
    password         = serializers.CharField(write_only=True, min_length=6)
    confirm_password = serializers.CharField(write_only=True)  # only for validation, not saved

    class Meta:
        model = User
        fields = ["username", "password", "confirm_password"]

    def validate(self, data):
        # Check both passwords match
        if data["password"] != data["confirm_password"]:
            raise serializers.ValidationError({"confirm_password": "Passwords do not match."})
        return data

    def create(self, validated_data):
        validated_data.pop("confirm_password")  # remove before saving — not a model field
        return User.objects.create_user(**validated_data)


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)