"""
Run:
    python manage.py test operations
"""

from django.contrib.auth.models import User
from rest_framework.test import APITestCase
from rest_framework import status
from rest_framework_simplejwt.tokens import RefreshToken


class OperationsAPITests(APITestCase):

    def setUp(self):
        """Create test user and generate JWT token."""
        self.user = User.objects.create_user(
            username="john",
            password="pass123"
        )

        refresh = RefreshToken.for_user(self.user)
        self.refresh_token = str(refresh)
        self.access_token = str(refresh.access_token)

        # Attach token by default
        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {self.access_token}"
        )

    # ───────── REGISTER ───────── #

    def test_register_success(self):
        data = {
            "username": "jane",
            "password": "pass123",
            "confirm_password": "pass123"
        }

        response = self.client.post("/operations/api/register/", data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_register_password_mismatch(self):
        data = {
            "username": "jane",
            "password": "pass123",
            "confirm_password": "wrong"
        }

        response = self.client.post("/operations/api/register/", data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    # ───────── LOGIN ───────── #

    def test_login_success(self):
        response = self.client.post(
            "/operations/api/login/",
            {"username": "john", "password": "pass123"}
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)

    def test_login_wrong_password(self):
        response = self.client.post(
            "/operations/api/login/",
            {"username": "john", "password": "wrong"}
        )

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    # ───────── LOGOUT ───────── #

    def test_logout_success(self):
        response = self.client.post(
            "/operations/api/logout/",
            {"refresh": self.refresh_token}
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    # ───────── AUTH PROTECTION ───────── #

    def test_protected_route_without_token(self):
        self.client.credentials()  # remove token

        response = self.client.get("/operations/api/add/?a=10&b=5")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    # ───────── ARITHMETIC ───────── #

    def test_add(self):
        response = self.client.get("/operations/api/add/?a=10&b=5")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["result"], 15.0)

    def test_subtract(self):
        response = self.client.get("/operations/api/subtract/?a=10&b=3")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["result"], 7.0)

    def test_multiply(self):
        response = self.client.get("/operations/api/multiply/?a=4&b=5")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["result"], 20.0)

    def test_divide(self):
        response = self.client.get("/operations/api/divide/?a=10&b=4")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["result"], 2.5)

    def test_divide_by_zero(self):
        response = self.client.get("/operations/api/divide/?a=10&b=0")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_invalid_input(self):
        response = self.client.get("/operations/api/add/?a=abc&b=5")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)