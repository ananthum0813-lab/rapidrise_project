from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from rest_framework_simplejwt.views import TokenRefreshView

urlpatterns = [
    # Admin
    path('admin/', admin.site.urls),
    
    # API Routes
    path('api/auth/', include('apps.authentication.urls')),
    path('api/files/', include('apps.files.urls')),
    path('api/sharing/', include('apps.sharing.urls')),
    
    # Token refresh (JWT)
    path('api/token/refresh/', TokenRefreshView.as_view(), name='token-refresh'),
]

# Serve media files in development
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)