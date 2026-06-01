import uuid
import pytest
from django.urls import reverse
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient
from django.contrib.auth import get_user_model
from apps.files.models import File
from apps.sharing.models import FileShare, ZipShare, FileRequest, RequestRecipient, SubmissionInbox

User = get_user_model()


# ──────────────────────────────────────────────
# Fixtures
# ──────────────────────────────────────────────

@pytest.fixture
def client():
    return APIClient()


@pytest.fixture
def user(db):
    return User.objects.create_user(
        email='owner@example.com',
        password='StrongPass123!'
    )


@pytest.fixture
def auth_client(client, user):
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def file_obj(db, user):
    f = SimpleUploadedFile('test.txt', b'hello', content_type='text/plain')
    return File.objects.create(
        owner=user,
        original_name='test.txt',
        file=f,
        file_size=5,
        mime_type='text/plain',
        scan_status=File.ScanStatus.SAFE,
    )


@pytest.fixture
def share(db, user, file_obj):
    from datetime import timedelta
    from django.utils import timezone
    return FileShare.objects.create(
        file=file_obj,
        shared_by=user,
        recipient_email='recipient@example.com',
        expires_at=timezone.now() + timedelta(hours=24),
        status=FileShare.Status.ACTIVE,
    )


@pytest.fixture
def zip_share(db, user, file_obj):
    from datetime import timedelta
    from django.utils import timezone
    zs = ZipShare.objects.create(
        shared_by=user,
        recipient_email='recipient@example.com',
        zip_name='bundle.zip',
        expires_at=timezone.now() + timedelta(hours=24),
        file_count=1,
        status=ZipShare.Status.ACTIVE,
    )
    zs.files.set([file_obj])
    return zs


@pytest.fixture
def file_request(db, user):
    from datetime import timedelta
    from django.utils import timezone
    return FileRequest.objects.create(
        owner=user,
        title='Test Request',
        description='Please send files',
        expires_at=timezone.now() + timedelta(hours=168),
        max_files=5,
        status=FileRequest.Status.OPEN,
    )


@pytest.fixture
def recipient(db, file_request):
    return RequestRecipient.objects.create(
        file_request=file_request,
        email='sender@example.com',
        name='Sender',
    )


# ──────────────────────────────────────────────
# All Files
# ──────────────────────────────────────────────

@pytest.mark.django_db
def test_all_files_authenticated(auth_client, file_obj):
    res = auth_client.get(reverse('all-files'))
    assert res.status_code == 200
    assert 'files' in res.data['data']


@pytest.mark.django_db
def test_all_files_unauthenticated(client):
    res = client.get(reverse('all-files'))
    assert res.status_code == 401


@pytest.mark.django_db
def test_all_files_search(auth_client, file_obj):
    res = auth_client.get(reverse('all-files'), {'search': 'test'})
    assert res.status_code == 200
    assert res.data['data']['count'] >= 1


# ──────────────────────────────────────────────
# Single File Shares
# ──────────────────────────────────────────────

@pytest.mark.django_db
def test_share_list(auth_client, share):
    res = auth_client.get(reverse('share-list'))
    assert res.status_code == 200
    assert res.data['data']['count'] >= 1


@pytest.mark.django_db
def test_share_list_unauthenticated(client):
    res = client.get(reverse('share-list'))
    assert res.status_code == 401


@pytest.mark.django_db
def test_revoke_share(auth_client, share):
    res = auth_client.post(reverse('share-revoke', args=[share.pk]))
    assert res.status_code == 200
    share.refresh_from_db()
    assert share.status == FileShare.Status.REVOKED


@pytest.mark.django_db
def test_revoke_already_revoked(auth_client, share):
    share.revoke()
    res = auth_client.post(reverse('share-revoke', args=[share.pk]))
    assert res.status_code == 200


@pytest.mark.django_db
def test_delete_share(auth_client, share):
    res = auth_client.delete(reverse('share-delete', args=[share.pk]))
    assert res.status_code == 200
    assert not FileShare.objects.filter(pk=share.pk).exists()


@pytest.mark.django_db
def test_share_analytics(auth_client, share):
    res = auth_client.get(reverse('share-analytics', args=[share.pk]))
    assert res.status_code == 200


@pytest.mark.django_db
def test_global_share_analytics(auth_client, share):
    res = auth_client.get(reverse('share-global-analytics'))
    assert res.status_code == 200
    assert 'totals' in res.data['data']


# ──────────────────────────────────────────────
# ZIP Shares
# ──────────────────────────────────────────────

@pytest.mark.django_db
def test_zip_list(auth_client, zip_share):
    res = auth_client.get(reverse('zip-list'))
    assert res.status_code == 200
    assert res.data['data']['count'] >= 1


@pytest.mark.django_db
def test_zip_list_unauthenticated(client):
    res = client.get(reverse('zip-list'))
    assert res.status_code == 401


@pytest.mark.django_db
def test_revoke_zip_share(auth_client, zip_share):
    res = auth_client.post(reverse('zip-revoke', args=[zip_share.pk]))
    assert res.status_code == 200
    zip_share.refresh_from_db()
    assert zip_share.status == ZipShare.Status.REVOKED


@pytest.mark.django_db
def test_revoke_zip_already_revoked(auth_client, zip_share):
    zip_share.revoke()
    res = auth_client.post(reverse('zip-revoke', args=[zip_share.pk]))
    assert res.status_code == 200


@pytest.mark.django_db
def test_delete_zip_share(auth_client, zip_share):
    res = auth_client.delete(reverse('zip-delete', args=[zip_share.pk]))
    assert res.status_code == 200
    assert not ZipShare.objects.filter(pk=zip_share.pk).exists()


# ──────────────────────────────────────────────
# Public ZIP Share
# ──────────────────────────────────────────────

@pytest.mark.django_db
def test_public_zip_info(client, zip_share):
    res = client.get(reverse('public-zip-info', args=[zip_share.share_token]))
    assert res.status_code == 200


@pytest.mark.django_db
def test_public_zip_info_not_found(client):
    res = client.get(reverse('public-zip-info', args=[uuid.uuid4()]))
    assert res.status_code == 404


@pytest.mark.django_db
def test_public_zip_info_revoked(client, zip_share):
    zip_share.revoke()
    res = client.get(reverse('public-zip-info', args=[zip_share.share_token]))
    assert res.status_code == 404


# ──────────────────────────────────────────────
# Public Single-file Share
# ──────────────────────────────────────────────

@pytest.mark.django_db
def test_public_share_info(client, share):
    res = client.get(reverse('public-share-info', args=[share.share_token]))
    assert res.status_code == 200


@pytest.mark.django_db
def test_public_share_info_not_found(client):
    res = client.get(reverse('public-share-info', args=[uuid.uuid4()]))
    assert res.status_code == 404


# ──────────────────────────────────────────────
# File Requests
# ──────────────────────────────────────────────

@pytest.mark.django_db
def test_request_list(auth_client, file_request):
    res = auth_client.get(reverse('request-list'))
    assert res.status_code == 200
    assert res.data['data']['count'] >= 1


@pytest.mark.django_db
def test_request_list_unauthenticated(client):
    res = client.get(reverse('request-list'))
    assert res.status_code == 401


@pytest.mark.django_db
def test_request_detail(auth_client, file_request):
    res = auth_client.get(reverse('request-detail', args=[file_request.pk]))
    assert res.status_code == 200
    assert res.data['data']['title'] == 'Test Request'


@pytest.mark.django_db
def test_request_detail_not_found(auth_client):
    res = auth_client.get(reverse('request-detail', args=[uuid.uuid4()]))
    assert res.status_code == 404


@pytest.mark.django_db
def test_request_delete_closes(auth_client, file_request):
    res = auth_client.delete(reverse('request-detail', args=[file_request.pk]))
    assert res.status_code == 200
    file_request.refresh_from_db()
    assert file_request.status == FileRequest.Status.CLOSED


# ──────────────────────────────────────────────
# OTP Endpoints
# ──────────────────────────────────────────────

@pytest.mark.django_db
def test_send_otp(client, recipient):
    res = client.post(reverse('recipient-send-otp', args=[recipient.upload_token]))
    assert res.status_code in (200, 429)


@pytest.mark.django_db
def test_send_otp_invalid_token(client):
    res = client.post(reverse('recipient-send-otp', args=[uuid.uuid4()]))
    assert res.status_code == 404


@pytest.mark.django_db
def test_verify_otp_missing(client, recipient):
    res = client.post(reverse('recipient-verify-otp', args=[recipient.upload_token]), {})
    assert res.status_code == 400


@pytest.mark.django_db
def test_verify_otp_wrong(client, recipient):
    res = client.post(reverse('recipient-verify-otp', args=[recipient.upload_token]), {'otp': '000000'})
    assert res.status_code == 400


@pytest.mark.django_db
def test_resend_otp(client, recipient):
    res = client.post(reverse('recipient-resend-otp', args=[recipient.upload_token]))
    assert res.status_code in (200, 429)


# ──────────────────────────────────────────────
# Public Recipient Info
# ──────────────────────────────────────────────

@pytest.mark.django_db
def test_recipient_info(client, recipient):
    res = client.get(reverse('recipient-info', args=[recipient.upload_token]))
    assert res.status_code == 200
    assert res.data['data']['title'] == 'Test Request'


@pytest.mark.django_db
def test_recipient_info_invalid_token(client):
    res = client.get(reverse('recipient-info', args=[uuid.uuid4()]))
    assert res.status_code == 404


# ──────────────────────────────────────────────
# Public Recipient Upload (no valid session)
# ──────────────────────────────────────────────

@pytest.mark.django_db
def test_recipient_upload_no_session(client, recipient):
    f = SimpleUploadedFile('upload.txt', b'data', content_type='text/plain')
    res = client.post(
        reverse('recipient-upload', args=[recipient.upload_token]),
        {'files': f},
        format='multipart',
    )
    # Should reject — no valid OTP session token
    assert res.status_code == 400


@pytest.mark.django_db
def test_recipient_upload_invalid_token(client):
    res = client.post(reverse('recipient-upload', args=[uuid.uuid4()]), {})
    assert res.status_code in (400, 404)


# ──────────────────────────────────────────────
# Inbox
# ──────────────────────────────────────────────

@pytest.mark.django_db
def test_inbox_list(auth_client):
    res = auth_client.get(reverse('inbox-list'))
    assert res.status_code == 200


@pytest.mark.django_db
def test_inbox_list_unauthenticated(client):
    res = client.get(reverse('inbox-list'))
    assert res.status_code == 401


@pytest.mark.django_db
def test_inbox_review_not_found(auth_client):
    res = auth_client.post(
        reverse('inbox-review', args=[uuid.uuid4()]),
        {'action': 'approve'},
        format='json',
    )
    assert res.status_code == 404


@pytest.mark.django_db
def test_inbox_remove_not_found(auth_client):
    res = auth_client.delete(reverse('inbox-remove', args=[uuid.uuid4()]))
    assert res.status_code == 404


@pytest.mark.django_db
def test_inbox_delete_infected_not_found(auth_client):
    res = auth_client.delete(reverse('inbox-delete-infected', args=[uuid.uuid4()]))
    assert res.status_code == 404


# ──────────────────────────────────────────────
# Save to Storage
# ──────────────────────────────────────────────

@pytest.mark.django_db
def test_save_to_storage_not_found(auth_client):
    res = auth_client.post(reverse('inbox-save-to-storage', args=[uuid.uuid4()]))
    assert res.status_code == 404


@pytest.mark.django_db
def test_save_to_storage_not_complete(auth_client, user, file_obj):
    submission = SubmissionInbox.objects.create(
        owner=user,
        file=file_obj,
        original_filename='test.txt',
        file_size=5,
        mime_type='text/plain',
        status=SubmissionInbox.Status.PENDING,
    )
    res = auth_client.post(reverse('inbox-save-to-storage', args=[submission.pk]))
    assert res.status_code == 400