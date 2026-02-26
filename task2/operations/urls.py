from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from operations.views import RegisterView, LoginView,LogoutView
from operations.views import AddView,SubtractView,MultiplyView,DivideView


urlpatterns = [

    # Auth
    path("api/register/",      RegisterView.as_view()),
    path("api/login/",         LoginView.as_view()),
    path("api/logout/",        LogoutView.as_view()),
    path("api/token/refresh/", TokenRefreshView.as_view()),

     # Arithmetic (JWT required)
    path("api/add/",           AddView.as_view()),
    path("api/subtract/",      SubtractView.as_view()),
    path("api/multiply/",      MultiplyView.as_view()),
    path("api/divide/",        DivideView.as_view()),
]