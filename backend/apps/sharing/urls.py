from django.urls import path
from .views import (
    AllFilesView,
    CheckDuplicateView,
    CreateShareView,
    SharedFileListView,
    RevokeShareView,
    DeleteShareView,
    ShareAnalyticsView,
    GlobalShareAnalyticsView,
    CreateZipShareView,
    ZipShareListView,
    RevokeZipShareView,
    DeleteZipShareView,
    PublicZipShareInfoView,
    PublicZipShareDownloadView,
    PublicShareInfoView,
    PublicShareDownloadView,
    FileRequestListView,
    FileRequestDetailView,
    PublicRecipientInfoView,
    PublicRecipientUploadView,
    PublicFileRequestInfoView,
    PublicFileRequestUploadView,
    PublicUploadStatusView,
    SubmissionInboxListView,
    ReviewSubmissionView,
    DeleteInfectedFileView,
    RemoveInboxItemView,
    SaveToStorageView,
    # OTP endpoints
    SendOTPView,
    VerifyOTPView,
    ResendOTPView,
)

urlpatterns = [
    #All files (for share form file selector) 
    path('all-files/',         AllFilesView.as_view(),       name='all-files'),

    # Duplicate check 
    path('check-duplicate/',   CheckDuplicateView.as_view(), name='check-duplicate'),

    # Single-file shares 
    path('',                           SharedFileListView.as_view(),       name='share-list'),
    path('create/',                    CreateShareView.as_view(),          name='share-create'),
    path('<uuid:pk>/revoke/',          RevokeShareView.as_view(),          name='share-revoke'),
    path('<uuid:pk>/',                 DeleteShareView.as_view(),          name='share-delete'),
    path('<uuid:pk>/analytics/',       ShareAnalyticsView.as_view(),       name='share-analytics'),
    path('analytics/',                 GlobalShareAnalyticsView.as_view(), name='share-global-analytics'),

    # Multi-file ZIP shares 
    path('zip/',                       ZipShareListView.as_view(),         name='zip-list'),
    path('zip/create/',                CreateZipShareView.as_view(),       name='zip-create'),
    path('zip/<uuid:pk>/revoke/',      RevokeZipShareView.as_view(),       name='zip-revoke'),
    path('zip/<uuid:pk>/',             DeleteZipShareView.as_view(),       name='zip-delete'),

    # Public ZIP share pages 
    path('public/zip/<uuid:token>/',          PublicZipShareInfoView.as_view(),     name='public-zip-info'),
    path('public/zip/<uuid:token>/download/', PublicZipShareDownloadView.as_view(), name='public-zip-download'),

    # Public single-file share pages 
    path('public/<uuid:token>/',          PublicShareInfoView.as_view(),     name='public-share-info'),
    path('public/<uuid:token>/download/', PublicShareDownloadView.as_view(), name='public-share-download'),

    # File requests (authenticated) 
    path('requests/',            FileRequestListView.as_view(),   name='request-list'),
    path('requests/<uuid:pk>/',  FileRequestDetailView.as_view(), name='request-detail'),

    #  Per-recipient OTP verification (public) 
    path('requests/upload/<uuid:token>/send-otp/',   SendOTPView.as_view(),   name='recipient-send-otp'),
    path('requests/upload/<uuid:token>/verify-otp/', VerifyOTPView.as_view(), name='recipient-verify-otp'),
    path('requests/upload/<uuid:token>/resend-otp/', ResendOTPView.as_view(), name='recipient-resend-otp'),

    # Per-recipient info + upload (public)
    path('requests/upload/<uuid:token>/',        PublicRecipientInfoView.as_view(),   name='recipient-info'),
    path('requests/upload/<uuid:token>/submit/', PublicRecipientUploadView.as_view(), name='recipient-upload'),

    # Public scan-status polling 
    path('public-upload-status/<uuid:token>/', PublicUploadStatusView.as_view(), name='public-upload-status'),

    # Legacy shared-token upload 
    path('requests/public/<uuid:token>/',        PublicFileRequestInfoView.as_view(),   name='public-request-info'),
    path('requests/public/<uuid:token>/upload/', PublicFileRequestUploadView.as_view(), name='public-request-upload'),

    # Inbox 
    path('inbox/',                              SubmissionInboxListView.as_view(), name='inbox-list'),
    path('inbox/<uuid:pk>/review/',             ReviewSubmissionView.as_view(),    name='inbox-review'),
    path('inbox/<uuid:pk>/delete-file/',        DeleteInfectedFileView.as_view(),  name='inbox-delete-infected'),
    path('inbox/<uuid:pk>/remove/',             RemoveInboxItemView.as_view(),     name='inbox-remove'),
    path('inbox/<uuid:pk>/save-to-storage/',    SaveToStorageView.as_view(),       name='inbox-save-to-storage'),
]