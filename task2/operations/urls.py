from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from operations.views import RegisterView, LoginView,LogoutView


urlpatterns = [

    # Auth
    path("api/register/",      RegisterView.as_view()),
    path("api/login/",         LoginView.as_view()),
    path("api/logout/",        LogoutView.as_view()),
    path("api/token/refresh/", TokenRefreshView.as_view()),
]