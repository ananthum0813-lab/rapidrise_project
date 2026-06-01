import secrets
import logging
from datetime import timedelta

from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone

from rest_framework_simplejwt.tokens import RefreshToken

from .models import User, PasswordResetToken


logger = logging.getLogger(__name__)


def get_tokens_for_user(user) -> dict:
    """Generate JWT tokens for a user."""

    refresh = RefreshToken.for_user(user)

    return {
        'refresh': str(refresh),
        'access': str(refresh.access_token),
    }


def send_password_reset_email(email: str) -> None:
    """
    Generate a password reset token and send reset email.
    Silently ignores unknown emails to prevent enumeration.
    """

    try:
        user = User.objects.get(
            email=email,
            is_active=True,
        )

    except User.DoesNotExist:
        return

    # Invalidate old tokens
    PasswordResetToken.objects.filter(
        user=user,
        is_used=False,
    ).update(is_used=True)

    # Create new token
    token = secrets.token_urlsafe(32)

    expires_at = timezone.now() + timedelta(
        hours=settings.PASSWORD_RESET_EXPIRY_HOURS
    )

    PasswordResetToken.objects.create(
        user=user,
        token=token,
        expires_at=expires_at,
    )

    reset_link = (
        f"{settings.FRONTEND_URL}/reset-password?token={token}"
    )

    try:
        body = (
    f'Hi {user.first_name},\n\n'
    f'You requested a password reset for your VShare account.\n\n'
    f'Reset Link:\n'
    f'{reset_link}\n\n'
    f'This link expires in '
    f'{int(settings.PASSWORD_RESET_EXPIRY_HOURS * 60)} minute(s).\n\n'
    f'If you did not request this, you can safely ignore this email.\n'
)
        send_mail(
            subject='Reset Your VShare Password',
            message=body,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            fail_silently=False,
        )

        logger.info(
            f'Password reset email sent to {email}'
        )

    except Exception as e:
        logger.error(
            f'Failed to send password reset email to {email}: {e}'
        )