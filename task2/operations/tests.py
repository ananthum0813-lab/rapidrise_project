from django.test import TestCase

# Create your tests here.
"""
Run: python manage.py test api
"""

from django.contrib.auth.models import User
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken


class APITests(APITestCase):

    def setUp(self):
        """Create a user and attach JWT token before every test."""
        self.user = User.objects.create_user(username="john", password="pass123")
        token = RefreshToken.for_user(self.user)
        self.refresh = str(token)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")

    # ── Register ──────────────────────────────────────────────────────────────

    def test_register_success(self):
        data = {"username": "jane", "password": "pass123", "confirm_password": "pass123"}
        res = self.client.post("/api/register/", data)
        self.assertEqual(res.status_code, 201)

    def test_register_password_mismatch(self):
        data = {"username": "jane", "password": "pass123", "confirm_password": "wrong"}
        res = self.client.post("/api/register/", data)
        self.assertEqual(res.status_code, 400)

    # ── Login ─────────────────────────────────────────────────────────────────

    def test_login_success(self):
        res = self.client.post("/api/login/", {"username": "john", "password": "pass123"})
        self.assertEqual(res.status_code, 200)
        self.assertIn("access", res.data)

    def test_login_wrong_password(self):
        res = self.client.post("/api/login/", {"username": "john", "password": "wrong"})
        self.assertEqual(res.status_code, 401)

    # ── Logout ────────────────────────────────────────────────────────────────

    def test_logout_success(self):
        res = self.client.post("/api/logout/", {"refresh": self.refresh})
        self.assertEqual(res.status_code, 200)

    # ── Auth Protection ───────────────────────────────────────────────────────

    def test_no_token_blocked(self):
        self.client.credentials()  # remove token
        res = self.client.get("/api/add/?a=10&b=5")
        self.assertEqual(res.status_code, 401)

    # ── Arithmetic ────────────────────────────────────────────────────────────

    def test_add(self):
        res = self.client.get("/api/add/?a=10&b=5")
        self.assertEqual(res.data["result"], 15.0)

    def test_subtract(self):
        res = self.client.get("/api/subtract/?a=10&b=3")
        self.assertEqual(res.data["result"], 7.0)

    def test_multiply(self):
        res = self.client.get("/api/multiply/?a=4&b=5")
        self.assertEqual(res.data["result"], 20.0)

    def test_divide(self):
        res = self.client.get("/api/divide/?a=10&b=4")
        self.assertEqual(res.data["result"], 2.5)

    def test_divide_by_zero(self):
        res = self.client.get("/api/divide/?a=10&b=0")
        self.assertEqual(res.status_code, 400)

    def test_invalid_input(self):
        res = self.client.get("/api/add/?a=abc&b=5")
        self.assertEqual(res.status_code, 400)