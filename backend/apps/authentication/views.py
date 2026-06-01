import logging
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.exceptions import ValidationError, AuthenticationFailed
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError

from config.exceptions import success_response
from .serializers import (
    RegisterSerializer, LoginSerializer, UserSerializer,
    ChangePasswordSerializer, ForgotPasswordSerializer, ResetPasswordSerializer,
)
from .services import get_tokens_for_user, send_password_reset_email

logger = logging.getLogger(__name__)


class RegisterView(APIView):
    """Register a new user account."""
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return success_response(
            data={'tokens': get_tokens_for_user(user), 'user': UserSerializer(user).data},
            message='Account created successfully.',
            status_code=status.HTTP_201_CREATED,
        )


class LoginView(APIView):
    """Login with email and password."""
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data['user']
        return success_response(
            data={'tokens': get_tokens_for_user(user), 'user': UserSerializer(user).data},
            message='Login successful.',
        )


class LogoutView(APIView):
    """Logout by blacklisting the refresh token."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            RefreshToken(request.data.get('refresh', '')).blacklist()
        except TokenError:
            pass
        return success_response(message='Logged out successfully.')


class ProfileView(APIView):
    """Get the authenticated user's profile."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return success_response(data=UserSerializer(request.user).data)


class UpdateProfileView(APIView):
    """Update the authenticated user's profile."""
    permission_classes = [IsAuthenticated]

    def patch(self, request):
        user = request.user
        first_name = request.data.get('first_name')
        last_name = request.data.get('last_name')
        date_of_birth = request.data.get('date_of_birth')
        
        if first_name is not None:
            user.first_name = first_name
        if last_name is not None:
            user.last_name = last_name
        if date_of_birth is not None:
            user.date_of_birth = date_of_birth
        
        user.save()
        return success_response(
            data=UserSerializer(user).data,
            message='Profile updated successfully.'
        )


class ChangePasswordView(APIView):
    """Change password for authenticated user."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return success_response(message='Password changed successfully.')


class ForgotPasswordView(APIView):
    """Send a password reset link to the given email."""
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = ForgotPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        send_password_reset_email(serializer.validated_data['email'])
        return success_response(message='If an account with that email exists, a reset link has been sent.')


class ResetPasswordView(APIView):
    """Reset password using a token from the reset email."""
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = ResetPasswordSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return success_response(message='Password reset successfully. You can now log in.')


class TokenRefreshView(APIView):
    """Refresh an access token using a valid refresh token."""
    permission_classes = [AllowAny]

    def post(self, request):
        refresh_str = request.data.get('refresh')
        if not refresh_str:
            raise ValidationError({'refresh': 'Refresh token is required.'})
        try:
            refresh = RefreshToken(refresh_str)
            return success_response(data={
                'access': str(refresh.access_token),
                'refresh': str(refresh),
            })
        except TokenError as e:
            raise AuthenticationFailed(str(e))


class DeleteAccountView(APIView):
    """Permanently delete the authenticated user account and owned data."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        confirm = str(request.data.get('confirm', '')).strip().lower()
        if confirm != 'delete':
            raise ValidationError({
                'confirm': 'Confirmation text mismatch. Send "delete" to confirm account deletion.'
            })

        refresh = request.data.get('refresh', '')
        if refresh:
            try:
                RefreshToken(refresh).blacklist()
            except TokenError:
                pass

        user = request.user
        user_id = str(user.id)

        # Ensure physical file cleanup before user cascade deletion.
        from apps.files.models import File
        user_files = File.objects.filter(owner=user)
        for file_obj in user_files:
            try:
                file_obj.hard_delete()
            except Exception:
                logger.exception('DeleteAccountView: failed to hard-delete file %s', file_obj.pk)

        user.delete()
        return success_response(
            message='Account deleted successfully.',
            data={'deleted_user_id': user_id},
            status_code=status.HTTP_200_OK,
        )