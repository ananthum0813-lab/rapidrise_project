import pytest
from django.urls import reverse
from rest_framework.test import APIClient
from django.contrib.auth import get_user_model

User = get_user_model()


@pytest.fixture
def client():
    return APIClient()


@pytest.fixture
def user(db):
    return User.objects.create_user(
        email='test@example.com',
        password='StrongPass123!'
    )


@pytest.fixture
def auth_client(client, user):
    client.force_authenticate(user=user)
    return client


# ──────────────────────────────────────────────
# RegisterView
# ──────────────────────────────────────────────

@pytest.mark.django_db
def test_register_success(client):
    res = client.post(reverse('register'), {
        'first_name': 'Test',
        'last_name': 'User',
        'email': 'new@example.com',
        'password': 'StrongPass123!',
        'confirm_password': 'StrongPass123!',
    })
    assert res.status_code == 201
    assert 'tokens' in res.data['data']
    assert 'user' in res.data['data']

@pytest.mark.django_db
def test_register_duplicate_email(client, user):
    res = client.post(reverse('register'), {
        'first_name': 'Test',
        'last_name': 'User',
        'email': 'test@example.com',  # already exists
        'password': 'StrongPass123!',
        'confirm_password': 'StrongPass123!',
    })
    assert res.status_code == 400

@pytest.mark.django_db
def test_register_password_mismatch(client):
    res = client.post(reverse('register'), {
        'first_name': 'Test',
        'last_name': 'User',
        'email': 'new@example.com',
        'password': 'StrongPass123!',
        'confirm_password': 'WrongPass!',
    })
    assert res.status_code == 400

@pytest.mark.django_db
def test_register_missing_email(client):
    res = client.post(reverse('register'), {
        'first_name': 'Test',
        'password': 'StrongPass123!',
        'confirm_password': 'StrongPass123!',
    })
    assert res.status_code == 400


# ──────────────────────────────────────────────
# LoginView
# ──────────────────────────────────────────────

@pytest.mark.django_db
def test_login_success(client, user):
    res = client.post(reverse('login'), {
        'email': 'test@example.com',
        'password': 'StrongPass123!',
    })
    assert res.status_code == 200
    assert 'access' in res.data['data']['tokens']
    assert 'refresh' in res.data['data']['tokens']

@pytest.mark.django_db
def test_login_wrong_password(client, user):
    res = client.post(reverse('login'), {
        'email': 'test@example.com',
        'password': 'WrongPass!',
    })
    assert res.status_code in (400, 401)

@pytest.mark.django_db
def test_login_nonexistent_email(client):
    res = client.post(reverse('login'), {
        'email': 'nobody@example.com',
        'password': 'StrongPass123!',
    })
    assert res.status_code in (400, 401)

@pytest.mark.django_db
def test_login_missing_fields(client):
    res = client.post(reverse('login'), {})
    assert res.status_code == 400


# ──────────────────────────────────────────────
# LogoutView
# ──────────────────────────────────────────────

@pytest.mark.django_db
def test_logout_success(auth_client):
    res = auth_client.post(reverse('logout'), {'refresh': 'sometoken'})
    assert res.status_code == 200

@pytest.mark.django_db
def test_logout_unauthenticated(client):
    res = client.post(reverse('logout'), {'refresh': 'sometoken'})
    assert res.status_code == 401


# ──────────────────────────────────────────────
# ProfileView
# ──────────────────────────────────────────────

@pytest.mark.django_db
def test_get_profile(auth_client, user):
    res = auth_client.get(reverse('profile'))
    assert res.status_code == 200
    assert res.data['data']['email'] == user.email

@pytest.mark.django_db
def test_get_profile_unauthenticated(client):
    res = client.get(reverse('profile'))
    assert res.status_code == 401


# ──────────────────────────────────────────────
# UpdateProfileView
# ──────────────────────────────────────────────

@pytest.mark.django_db
def test_update_profile_first_name(auth_client):
    res = auth_client.patch(reverse('update-profile'), {'first_name': 'Updated'})
    assert res.status_code == 200
    assert res.data['data']['first_name'] == 'Updated'

@pytest.mark.django_db
def test_update_profile_last_name(auth_client):
    res = auth_client.patch(reverse('update-profile'), {'last_name': 'NewLast'})
    assert res.status_code == 200
    assert res.data['data']['last_name'] == 'NewLast'

@pytest.mark.django_db
def test_update_profile_does_not_clear_other_fields(auth_client, user):
    user.first_name = 'Original'
    user.save()
    res = auth_client.patch(reverse('update-profile'), {'last_name': 'Changed'})
    assert res.status_code == 200
    assert res.data['data']['first_name'] == 'Original'

@pytest.mark.django_db
def test_update_profile_unauthenticated(client):
    res = client.patch(reverse('update-profile'), {'first_name': 'Hacker'})
    assert res.status_code == 401


# ──────────────────────────────────────────────
# ChangePasswordView
# ──────────────────────────────────────────────

@pytest.mark.django_db
def test_change_password_success(auth_client):
    res = auth_client.post(reverse('change-password'), {
        'old_password': 'StrongPass123!',
        'new_password': 'NewPass456!',
        'confirm_password': 'NewPass456!',
    })
    assert res.status_code == 200

@pytest.mark.django_db
def test_change_password_wrong_old(auth_client):
    res = auth_client.post(reverse('change-password'), {
        'old_password': 'WrongOld!',
        'new_password': 'NewPass456!',
        'confirm_password': 'NewPass456!',
    })
    assert res.status_code == 400

@pytest.mark.django_db
def test_change_password_mismatch(auth_client):
    res = auth_client.post(reverse('change-password'), {
        'old_password': 'StrongPass123!',
        'new_password': 'NewPass456!',
        'confirm_password': 'DoesNotMatch!',
    })
    assert res.status_code == 400

@pytest.mark.django_db
def test_change_password_unauthenticated(client):
    res = client.post(reverse('change-password'), {
        'old_password': 'StrongPass123!',
        'new_password': 'NewPass456!',
        'confirm_password': 'NewPass456!',
    })
    assert res.status_code == 401


# ──────────────────────────────────────────────
# ForgotPasswordView
# ──────────────────────────────────────────────

@pytest.mark.django_db
def test_forgot_password_existing_email(client, user):
    res = client.post(reverse('forgot-password'), {'email': 'test@example.com'})
    assert res.status_code == 200

@pytest.mark.django_db
def test_forgot_password_nonexistent_email(client):
    # Returns 200 to avoid email enumeration
    res = client.post(reverse('forgot-password'), {'email': 'nobody@example.com'})
    assert res.status_code == 200

@pytest.mark.django_db
def test_forgot_password_missing_email(client):
    res = client.post(reverse('forgot-password'), {})
    assert res.status_code == 400


# ──────────────────────────────────────────────
# TokenRefreshView
# ──────────────────────────────────────────────

@pytest.mark.django_db
def test_token_refresh_missing(client):
    res = client.post(reverse('token-refresh'), {})
    assert res.status_code == 400

@pytest.mark.django_db
def test_token_refresh_invalid(client):
    res = client.post(reverse('token-refresh'), {'refresh': 'badtoken'})
    assert res.status_code == 401


# ──────────────────────────────────────────────
# DeleteAccountView
# ──────────────────────────────────────────────

@pytest.mark.django_db
def test_delete_account_success(auth_client, user):
    res = auth_client.post(reverse('delete-account'), {'confirm': 'delete'})
    assert res.status_code == 200
    assert not User.objects.filter(pk=user.pk).exists()

@pytest.mark.django_db
def test_delete_account_wrong_confirm(auth_client, user):
    res = auth_client.post(reverse('delete-account'), {'confirm': 'yes'})
    assert res.status_code == 400
    assert User.objects.filter(pk=user.pk).exists()

@pytest.mark.django_db
def test_delete_account_missing_confirm(auth_client, user):
    res = auth_client.post(reverse('delete-account'), {})
    assert res.status_code == 400

@pytest.mark.django_db
def test_delete_account_unauthenticated(client):
    res = client.post(reverse('delete-account'), {'confirm': 'delete'})
    assert res.status_code == 401

@pytest.mark.django_db
def test_delete_account_returns_user_id(auth_client, user):
    user_id = str(user.pk)
    res = auth_client.post(reverse('delete-account'), {'confirm': 'delete'})
    assert res.data['data']['deleted_user_id'] == user_id