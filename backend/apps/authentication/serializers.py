import re
import string
from datetime import date
from dateutil.relativedelta import relativedelta
from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from .models import User, PasswordResetToken


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)
    confirm_password = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ['first_name', 'last_name', 'email', 'password', 'confirm_password', 'date_of_birth']

    def validate_first_name(self, value):
        value = value.strip()
        if not re.match(r"^[A-Za-z\s'\-]{2,50}$", value):
            raise serializers.ValidationError('Enter a valid first name (letters only, 2–50 characters).')
        return value

    def validate_last_name(self, value):
        value = value.strip()
        if not re.match(r"^[A-Za-z\s'\-]{1,50}$", value):
            raise serializers.ValidationError('Enter a valid last name (letters only, 1–50 characters).')
        return value

    def validate_email(self, value):
        value = value.lower().strip()
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError('An account with this email already exists.')
        return value

    def validate_date_of_birth(self, value):
        if value > date.today():
            raise serializers.ValidationError('Date of birth cannot be in the future.')
        age = relativedelta(date.today(), value).years
        if age < 13:
            raise serializers.ValidationError('You must be at least 13 years old to register.')
        return value

    def validate_password(self, value):
        validate_password(value)

        if not any(char.isdigit() for char in value):
            raise serializers.ValidationError('Password must contain at least one number.')

        if not any(char.isalpha() for char in value):
            raise serializers.ValidationError('Password must contain at least one letter.')

        if not any(char in string.punctuation for char in value):
            raise serializers.ValidationError('Password must contain at least one special character.')

        return value

    def validate(self, attrs):
        if attrs['password'] != attrs['confirm_password']:
            raise serializers.ValidationError({'confirm_password': 'Passwords do not match.'})
        return attrs

    def create(self, validated_data):
        validated_data.pop('confirm_password')
        return User.objects.create_user(**validated_data)


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        email = attrs['email'].lower().strip()
        user = authenticate(request=self.context.get('request'), email=email, password=attrs['password'])
        if not user:
            raise serializers.ValidationError('Invalid email or password.')
        if not user.is_active:
            raise serializers.ValidationError('Your account has been deactivated.')
        attrs['user'] = user
        return attrs


class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.ReadOnlyField()

    class Meta:
        model = User
        fields = ['id', 'email', 'first_name', 'last_name', 'full_name', 'date_of_birth', 'date_joined']
        read_only_fields = fields


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=8)
    confirm_password = serializers.CharField(write_only=True)

    def validate_old_password(self, value):
        if not self.context['request'].user.check_password(value):
            raise serializers.ValidationError('Current password is incorrect.')
        return value

    def validate_new_password(self, value):
        validate_password(value)
        # Reuse check against current password
        if self.context['request'].user.check_password(value):
            raise serializers.ValidationError('New password must be different from your current password.')
        return value

    def validate(self, attrs):
        if attrs['new_password'] != attrs['confirm_password']:
            raise serializers.ValidationError({'confirm_password': 'Passwords do not match.'})
        if attrs['old_password'] == attrs['new_password']:
            raise serializers.ValidationError({'new_password': 'New password must be different from current password.'})
        return attrs

    def save(self, **kwargs):
        user = self.context['request'].user
        user.set_password(self.validated_data['new_password'])
        user.save(update_fields=['password', 'updated_at'])
        # Invalidate any outstanding reset tokens so old reset links cannot be used
        PasswordResetToken.objects.filter(user=user, is_used=False).update(is_used=True)
        return user


class ForgotPasswordSerializer(serializers.Serializer):
    email = serializers.EmailField()

    def validate_email(self, value):
        return value.lower().strip()


class ResetPasswordSerializer(serializers.Serializer):
    token = serializers.CharField()
    new_password = serializers.CharField(write_only=True, min_length=8)
    confirm_password = serializers.CharField(write_only=True)

    def validate_token(self, value):
        try:
            token_obj = PasswordResetToken.objects.select_related('user').get(token=value)
        except PasswordResetToken.DoesNotExist:
            raise serializers.ValidationError('Invalid or expired reset token.')
        if not token_obj.is_valid:
            raise serializers.ValidationError('This reset link has expired or already been used.')
        self.context['reset_token'] = token_obj
        return value

    def validate_new_password(self, value):
        validate_password(value)
        # Reuse check against current password
        token_obj = self.context.get('reset_token')
        if token_obj and token_obj.user.check_password(value):
            raise serializers.ValidationError('New password must be different from your current password.')
        return value

    def validate(self, attrs):
        if attrs['new_password'] != attrs['confirm_password']:
            raise serializers.ValidationError({'confirm_password': 'Passwords do not match.'})
        return attrs

    def save(self, **kwargs):
        token_obj = self.context['reset_token']
        user = token_obj.user
        user.set_password(self.validated_data['new_password'])
        user.save(update_fields=['password', 'updated_at'])
        token_obj.is_used = True
        token_obj.save(update_fields=['is_used'])
        # Invalidate all other outstanding reset tokens for this user
        PasswordResetToken.objects.filter(user=user, is_used=False).update(is_used=True)
        return user